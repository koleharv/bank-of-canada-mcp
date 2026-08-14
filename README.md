# bank-of-canada-mcp

An [MCP](https://modelcontextprotocol.io) server that gives Claude and other LLMs live access to **Canadian economic data** via the Bank of Canada's free [Valet API](https://www.bankofcanada.ca/valet/docs) — ~16,000 time series covering exchange rates, the policy interest rate, CPI, bond yields, commodity prices, and more.

FRED, the World Bank, and the IMF all have MCP servers. Canada didn't — now it does.

No API key required.

## Quick start

**Claude Code**

```bash
claude mcp add bank-of-canada -- npx -y bank-of-canada-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bank-of-canada": {
      "command": "npx",
      "args": ["-y", "bank-of-canada-mcp"]
    }
  }
}
```

The same `npx` invocation works in Cursor, Windsurf, and any other MCP client.

## Tools

| Tool | What it does |
|------|--------------|
| `search_series` | Keyword search across the full series catalogue — find the series name for anything ("overnight rate target", "CPI", "5-year bond") |
| `get_observations` | Time-series data for up to 5 series, by date range or N most recent |
| `latest_fx_rates` | Today's official daily exchange rates vs CAD |
| `convert_currency` | Convert between any two supported currencies using today's rates |

## Example prompts

- *"What's the Bank of Canada's current policy rate, and how has it moved this year?"*
- *"Plot USD/CAD for the last 90 days."*
- *"Convert 2,500 EUR to CAD at today's official rate."*
- *"How does core CPI compare to headline CPI over the past two years?"*

## Development

```bash
npm install
npm test        # offline unit tests (vitest)
npm run build   # tsc → dist/
```

Architecture: [`src/valet.ts`](src/valet.ts) is a plain API client with pure, unit-tested logic (search, conversion math); [`src/index.ts`](src/index.ts) is the MCP wiring. Errors from the Valet API (e.g. an unknown series name) are returned as MCP tool errors with the API's own message, so the model can self-correct by re-searching.

## Notes

- Rates are the Bank of Canada's **indicative daily averages**, published once per business day — not transactional quotes.
- Data is © Bank of Canada, used under their [terms](https://www.bankofcanada.ca/terms/). This project is not affiliated with or endorsed by the Bank of Canada.

## Roadmap

- Statistics Canada Web Data Service tools
- Group browsing (`lists/groups`)
- Streamable HTTP transport for remote deployment

## License

MIT
