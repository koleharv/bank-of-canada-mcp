# bank-of-canada-mcp — Design

**Date:** 2026-08-14
**Goal:** A public, npx-installable MCP server as a portfolio piece — useful enough to earn real users, small enough to be readable in one sitting.

## Idea selection

Candidates considered:

1. **Bank of Canada Valet API server** (chosen) — free, no-auth JSON API with ~16k economic time series (FX rates, policy rate, CPI, bond yields). FRED, World Bank, IMF, and Brazil's central bank all have MCP servers; **Canada has none**. Clear gap, and directly relevant to Canadian employers (Bank of Canada, fintech).
2. Statistics Canada Web Data Service — bigger surface but quirky POST-based API keyed by opaque vector IDs; worse first-version ergonomics. Deferred to roadmap.
3. Generic dev-tool servers (dependency explainers, changelog watchers) — crowded space, no differentiation.

## Architecture

TypeScript ESM package, stdio transport, published to npm with a `bin` so
`npx bank-of-canada-mcp` just works.

- `src/valet.ts` — Valet API client + pure logic (search filtering, currency
  conversion math). No MCP imports; unit-testable offline.
- `src/index.ts` — MCP server wiring (`McpServer` + `registerTool`), bin entry.
- `test/valet.test.ts` — vitest with stubbed `fetch`; no network in CI.

## Tools

| Tool | Purpose |
|------|---------|
| `search_series(query, limit?)` | Case-insensitive substring search over the 15,906-series catalogue (name, label, description). Catalogue memoized per process. |
| `get_observations(series[], start_date?, end_date?, recent?)` | Time-series data for up to 5 series. Defaults to `recent=10` when no range is given so full histories never flood the model's context. |
| `latest_fx_rates()` | Latest daily FX rates vs CAD (group `FX_RATES_DAILY`, `recent=1`). |
| `convert_currency(amount, from, to)` | Cross-rate math via CAD: `amount × FX{from}CAD ÷ FX{to}CAD`, reporting the rate date used. |

## Error handling

Valet returns JSON `{message}` bodies on errors (unknown series → 404). The
client surfaces that message; tools return MCP `isError` results so the model
can self-correct (e.g., re-search for the right series name).

## Testing

- Unit (offline, CI-safe): search filtering, conversion math incl. CAD
  identity and unknown-currency errors, query-param construction, API error
  propagation.
- Smoke (manual, live): JSON-RPC over stdio against the real API before
  release.

## Out of scope (v1)

Statistics Canada WDS, HTTP/SSE transport, response caching beyond the series
catalogue, charts. All are roadmap items listed in the README.
