#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  convert,
  filterSeries,
  getObservations,
  latestFxTable,
  listSeries,
} from "./valet.js";

const server = new McpServer({ name: "bank-of-canada", version: "0.1.0" });

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Surfaces Valet's own error messages (e.g. "Series FXFOO not found") so the
// model can self-correct instead of the whole call blowing up.
function guarded<A extends unknown[]>(fn: (...args: A) => Promise<ToolResult>) {
  return async (...args: A): Promise<ToolResult> => {
    try {
      return await fn(...args);
    } catch (err) {
      return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true };
    }
  };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

server.registerTool(
  "search_series",
  {
    title: "Search Bank of Canada data series",
    description:
      "Search the Bank of Canada's catalogue of ~16,000 economic time series (exchange rates, policy interest rate, CPI, bond yields, commodity prices...). Returns series names to use with get_observations.",
    inputSchema: {
      query: z.string().describe("Keywords, e.g. 'overnight rate target' or 'USD exchange'"),
      limit: z.number().int().min(1).max(100).default(20).describe("Max results to return"),
    },
  },
  guarded(async ({ query, limit }) => jsonResult(filterSeries(await listSeries(), query, limit))),
);

server.registerTool(
  "get_observations",
  {
    title: "Get time-series observations",
    description:
      "Fetch observations for up to 5 Bank of Canada series (find names with search_series). Defaults to the 10 most recent observations when no range is given.",
    inputSchema: {
      series: z.array(z.string()).min(1).max(5).describe("Series names, e.g. ['FXUSDCAD', 'V39079']"),
      start_date: isoDate.optional().describe("Start of range, YYYY-MM-DD"),
      end_date: isoDate.optional().describe("End of range, YYYY-MM-DD"),
      recent: z.number().int().min(1).max(500).optional().describe("Alternatively: just the N most recent observations"),
    },
  },
  guarded(async ({ series, start_date, end_date, recent }) =>
    jsonResult(await getObservations(series, { startDate: start_date, endDate: end_date, recent })),
  ),
);

server.registerTool(
  "latest_fx_rates",
  {
    title: "Latest daily exchange rates",
    description: "Latest official Bank of Canada daily exchange rates, quoted as CAD per 1 unit of each foreign currency.",
    inputSchema: {},
  },
  guarded(async () => jsonResult(await latestFxTable())),
);

server.registerTool(
  "convert_currency",
  {
    title: "Convert currency",
    description:
      "Convert an amount between currencies using the latest Bank of Canada daily rates (cross-rated through CAD). Indicative daily averages, not transactional quotes.",
    inputSchema: {
      amount: z.number().describe("Amount to convert"),
      from: z.string().length(3).describe("ISO currency code, e.g. USD"),
      to: z.string().length(3).describe("ISO currency code, e.g. EUR"),
    },
  },
  guarded(async ({ amount, from, to }) => {
    const table = await latestFxTable();
    const { result, rate } = convert(table, amount, from.toUpperCase(), to.toUpperCase());
    return jsonResult({ amount, from: from.toUpperCase(), to: to.toUpperCase(), result, rate, rate_date: table.date });
  }),
);

await server.connect(new StdioServerTransport());
