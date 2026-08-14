import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildObservationParams,
  convert,
  filterSeries,
  getObservations,
  toFxTable,
  type FxTable,
  type SeriesInfo,
} from "../src/valet.js";

const sample: SeriesInfo[] = [
  { name: "FXUSDCAD", label: "USD/CAD", description: "Daily average exchange rate: US dollar to Canadian dollar" },
  { name: "FXEURCAD", label: "EUR/CAD", description: "Daily average exchange rate: euro to Canadian dollar" },
  { name: "V39079", label: "Overnight rate target", description: "Target for the overnight rate" },
];

describe("filterSeries", () => {
  it("matches case-insensitively across name, label and description", () => {
    expect(filterSeries(sample, "overnight TARGET", 10)).toEqual([sample[2]]);
    expect(filterSeries(sample, "fxusd", 10)).toEqual([sample[0]]);
  });

  it("requires every term to match (AND semantics)", () => {
    expect(filterSeries(sample, "exchange euro", 10)).toEqual([sample[1]]);
    expect(filterSeries(sample, "exchange banana", 10)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(filterSeries(sample, "exchange", 1)).toHaveLength(1);
  });
});

describe("buildObservationParams", () => {
  it("defaults to recent=10 when no range is given", () => {
    expect(buildObservationParams({})).toEqual({ recent: "10" });
  });

  it("passes explicit ranges through without adding a default", () => {
    expect(buildObservationParams({ startDate: "2025-01-01", endDate: "2025-06-30" })).toEqual({
      start_date: "2025-01-01",
      end_date: "2025-06-30",
    });
    expect(buildObservationParams({ recent: 3 })).toEqual({ recent: "3" });
  });
});

describe("FX table and conversion", () => {
  const table: FxTable = { date: "2026-08-14", rates: { USD: 1.3875, EUR: 1.51 } };

  it("extracts rates from a group observation row", () => {
    const parsed = toFxTable({
      seriesDetail: {},
      observations: [{ date: "2026-08-14", values: { FXUSDCAD: "1.3875", FXEURCAD: "1.51", NOTFX: "9" } }],
    });
    expect(parsed).toEqual(table);
  });

  it("keeps only the newest date when discontinued currencies add older rows", () => {
    // The group endpoint returns each series' own latest row; VND was
    // discontinued in 2019 and must not shadow the current business day.
    const parsed = toFxTable({
      seriesDetail: {},
      observations: [
        { date: "2019-12-31", values: { FXVNDCAD: "0.000056" } },
        { date: "2026-08-14", values: { FXUSDCAD: "1.3875", FXEURCAD: "1.51" } },
      ],
    });
    expect(parsed).toEqual(table);
  });

  it("converts through CAD as the cross currency", () => {
    const { result, rate } = convert(table, 100, "USD", "EUR");
    expect(rate).toBeCloseTo(1.3875 / 1.51, 10);
    expect(result).toBeCloseTo(100 * (1.3875 / 1.51), 10);
  });

  it("treats CAD as identity on either side", () => {
    expect(convert(table, 50, "USD", "CAD").result).toBeCloseTo(69.375, 10);
    expect(convert(table, 50, "CAD", "CAD").result).toBe(50);
  });

  it("names the supported currencies when one is unknown", () => {
    expect(() => convert(table, 1, "XYZ", "CAD")).toThrow(/No daily rate for XYZ.*CAD, EUR, USD/);
  });

  it("throws when the API returns no observations", () => {
    expect(() => toFxTable({ seriesDetail: {}, observations: [] })).toThrow(/No FX observations/);
  });
});

describe("getObservations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses the Valet response shape and builds the right URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        seriesDetail: { FXUSDCAD: { label: "USD/CAD", description: "desc" } },
        observations: [{ d: "2026-08-14", FXUSDCAD: { v: "1.3875" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getObservations(["FXUSDCAD"], { recent: 2 });

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/valet/observations/FXUSDCAD/json");
    expect(url.searchParams.get("recent")).toBe("2");
    expect(result).toEqual({
      seriesDetail: { FXUSDCAD: { label: "USD/CAD", description: "desc" } },
      observations: [{ date: "2026-08-14", values: { FXUSDCAD: "1.3875" } }],
    });
  });

  it("surfaces the Valet error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: "Series FXFOO not found" }) }),
    );
    await expect(getObservations(["FXFOO"])).rejects.toThrow("Series FXFOO not found");
  });
});
