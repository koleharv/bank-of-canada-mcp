// Client for the Bank of Canada Valet API (https://www.bankofcanada.ca/valet/docs)
// Pure logic lives here so it can be unit-tested without the MCP runtime.

const BASE = "https://www.bankofcanada.ca/valet";

export interface SeriesInfo {
  name: string;
  label: string;
  description: string;
}

export interface Observation {
  date: string;
  values: Record<string, string>;
}

export interface ObservationsResult {
  seriesDetail: Record<string, { label: string; description: string }>;
  observations: Observation[];
}

async function valetGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Valet error bodies carry a human-readable `message` (e.g. "Series FXFOO not found")
    throw new Error(body.message ?? `Valet API request failed with status ${res.status}`);
  }
  return body;
}

// ponytail: full ~16k-series catalogue memoized for process lifetime; it changes rarely.
let catalogue: SeriesInfo[] | undefined;

export async function listSeries(): Promise<SeriesInfo[]> {
  if (!catalogue) {
    const body = await valetGet("/lists/series/json");
    catalogue = Object.entries(body.series as Record<string, { label?: string; description?: string }>).map(
      ([name, s]) => ({ name, label: s.label ?? "", description: s.description ?? "" }),
    );
  }
  return catalogue;
}

export function filterSeries(all: SeriesInfo[], query: string, limit: number): SeriesInfo[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all
    .filter((s) => {
      const haystack = `${s.name} ${s.label} ${s.description}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    })
    .slice(0, limit);
}

function parseObservations(body: any): ObservationsResult {
  const seriesDetail: ObservationsResult["seriesDetail"] = {};
  for (const [name, d] of Object.entries(body.seriesDetail as Record<string, any>)) {
    seriesDetail[name] = { label: d.label ?? "", description: d.description ?? "" };
  }
  const observations: Observation[] = (body.observations ?? []).map((row: any) => {
    const { d, ...rest } = row;
    const values: Record<string, string> = {};
    for (const [name, cell] of Object.entries(rest as Record<string, { v?: string }>)) {
      if (cell?.v !== undefined) values[name] = cell.v;
    }
    return { date: d, values };
  });
  return { seriesDetail, observations };
}

export interface ObservationOptions {
  startDate?: string;
  endDate?: string;
  recent?: number;
}

export function buildObservationParams(opts: ObservationOptions): Record<string, string> {
  const params: Record<string, string> = {};
  if (opts.startDate) params.start_date = opts.startDate;
  if (opts.endDate) params.end_date = opts.endDate;
  if (opts.recent) params.recent = String(opts.recent);
  // No range at all would return the full history — default to a small window
  // so a careless call can't flood the model's context.
  if (Object.keys(params).length === 0) params.recent = "10";
  return params;
}

export async function getObservations(series: string[], opts: ObservationOptions = {}): Promise<ObservationsResult> {
  const body = await valetGet(`/observations/${series.map(encodeURIComponent).join(",")}/json`, buildObservationParams(opts));
  return parseObservations(body);
}

export async function getGroupObservations(group: string, opts: ObservationOptions = {}): Promise<ObservationsResult> {
  const body = await valetGet(`/observations/group/${encodeURIComponent(group)}/json`, buildObservationParams(opts));
  return parseObservations(body);
}

// FX_RATES_DAILY series are named FX{CUR}CAD and quote CAD per 1 unit of {CUR}.
export interface FxTable {
  date: string;
  /** CAD per 1 unit of currency, e.g. { USD: 1.3875, EUR: 1.51 } */
  rates: Record<string, number>;
}

export function toFxTable(result: ObservationsResult): FxTable {
  // recent=1 on a group returns each series' own latest row, so discontinued
  // currencies (e.g. VND, ended 2019) appear as extra rows with old dates.
  // Keep only the newest date — its row carries every actively-published rate.
  let latest: Observation | undefined;
  for (const row of result.observations) {
    if (!latest || row.date > latest.date) latest = row;
  }
  if (!latest) throw new Error("No FX observations returned by the Valet API");
  const rates: Record<string, number> = {};
  for (const [name, v] of Object.entries(latest.values)) {
    const m = name.match(/^FX([A-Z]{3})CAD$/);
    if (m) rates[m[1]] = Number(v);
  }
  return { date: latest.date, rates };
}

export function convert(table: FxTable, amount: number, from: string, to: string): { result: number; rate: number } {
  const cadPer = (cur: string): number => {
    if (cur === "CAD") return 1;
    const rate = table.rates[cur];
    if (rate === undefined) {
      const known = ["CAD", ...Object.keys(table.rates).sort()].join(", ");
      throw new Error(`No daily rate for ${cur}. Supported currencies: ${known}`);
    }
    return rate;
  };
  const rate = cadPer(from) / cadPer(to);
  return { result: amount * rate, rate };
}

export async function latestFxTable(): Promise<FxTable> {
  return toFxTable(await getGroupObservations("FX_RATES_DAILY", { recent: 1 }));
}
