/**
 * The protocol, end to end, against a fake register.
 *
 *     node --experimental-strip-types examples/handshake.ts
 *
 * No API key and no network: the fetch is a stub, so what you see is the real
 * handshake and the real tool call, with invented data behind them.
 */

import { Client } from "../src/client.ts";
import { Server } from "../src/server.ts";

const REGISTER: Record<string, unknown> = {
  "/v1/arbetsstallen/kommun/0486/count": { count: 1403 },
  "/v1/arbetsstallen/kommun/0486": {
    data: [
      { cfarNr: "10000001", namn: "Nordvik Bygg AB", kommun: "0486", naringsgren: "41200" },
      { cfarNr: "10000002", namn: "Sjöberg El AB", kommun: "0486", naringsgren: "43210" },
    ],
    pagination: { hasMore: true, nextCursorId: "c2" },
  },
};

const fetch = async (url: string) => {
  const path = new URL(url).pathname;
  const body = REGISTER[path];
  return {
    ok: body !== undefined,
    status: body === undefined ? 404 : 200,
    text: async () => JSON.stringify(body ?? { message: "unknown path" }),
  };
};

const server = new Server({
  client: new Client({ apiKey: "a-test-key", baseUrl: "https://register.test", fetch }),
});

const conversation = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "count_workplaces", arguments: { kommun: "0486" } } },
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "search_workplaces", arguments: { kommun: "0486", limit: 2 } },
  },
  { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_workplace", arguments: { cfarNr: "999" } } },
];

for (const message of conversation) {
  const line = JSON.stringify(message);
  console.log(`-> ${line.length > 96 ? `${line.slice(0, 96)}...` : line}`);
  const answer = await server.line(line);
  if (answer === null) {
    console.log("   (notification, nothing to answer)");
    continue;
  }
  const parsed = JSON.parse(answer) as Record<string, any>;
  if (parsed["error"]) {
    console.log(`<- error ${parsed["error"].code}: ${parsed["error"].message}`);
  } else if (parsed["result"]?.content) {
    const text = parsed["result"].content[0].text as string;
    const mark = parsed["result"].isError ? "tool error" : "ok";
    console.log(`<- ${mark}: ${text.replace(/\s+/g, " ").slice(0, 110)}`);
  } else if (parsed["result"]?.tools) {
    console.log(`<- ${parsed["result"].tools.length} tools: ${parsed["result"].tools.map((t: any) => t.name).join(", ")}`);
  } else {
    console.log(`<- ${JSON.stringify(parsed["result"])}`);
  }
}
