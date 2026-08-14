// Live smoke test: drives the built server over stdio against the real Valet API.
// Usage: npm run build && node scripts/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"] }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const calls = [
  ["search_series", { query: "overnight rate target", limit: 3 }],
  ["get_observations", { series: ["FXUSDCAD"], recent: 2 }],
  ["latest_fx_rates", {}],
  ["convert_currency", { amount: 100, from: "USD", to: "EUR" }],
  ["get_observations", { series: ["NOT_A_SERIES"] }], // must return isError, not crash
];

for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  console.log(`\n== ${name} ${res.isError ? "(isError)" : ""}\n${text.slice(0, 400)}`);
}

await client.close();
console.log("\nSMOKE OK");
