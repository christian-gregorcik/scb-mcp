import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "../src/client.ts";
import { PROTOCOL_VERSION, Server } from "../src/server.ts";

function serverWith(answers: Array<{ status?: number; body: unknown }>) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const answer = answers.shift() ?? { body: null };
    const status = answer.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(answer.body),
    };
  };
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  return { server: new Server({ client }), calls };
}

async function ask(server: Server, method: string, params?: unknown, id: number | string = 1) {
  const message = await server.message(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  assert.ok(message !== null);
  return message;
}

test("initialize answers with the protocol version and the server name", async () => {
  const { server } = serverWith([]);
  const response = await ask(server, "initialize");
  const body = response.result as Record<string, any>;

  assert.equal(response.id, 1);
  assert.equal(body["protocolVersion"], PROTOCOL_VERSION);
  assert.equal(body["serverInfo"].name, "scb-mcp");
  assert.ok(body["capabilities"].tools);
});

test("the initialized notification is recorded and not answered", async () => {
  const { server } = serverWith([]);
  assert.equal(server.initialized, false);
  const answer = await server.message(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  assert.equal(answer, null);
  assert.equal(server.initialized, true);
});

test("ping answers", async () => {
  const { server } = serverWith([]);
  assert.deepEqual((await ask(server, "ping")).result, {});
});

test("tools/list names every tool and gives each one a schema", async () => {
  const { server } = serverWith([]);
  const tools = (await ask(server, "tools/list")).result as { tools: Array<Record<string, any>> };

  const names = tools.tools.map((tool) => tool["name"]);
  assert.deepEqual(names, [
    "search_workplaces",
    "count_workplaces",
    "get_workplace",
    "search_legal_entities",
    "count_legal_entities",
    "get_legal_entity",
  ]);
  for (const tool of tools.tools) {
    assert.equal(tool["inputSchema"]["type"], "object");
    assert.ok(typeof tool["description"] === "string" && tool["description"].length > 20);
  }
});

test("a tool call returns text content and hits the right path", async () => {
  const { server, calls } = serverWith([{ body: { data: [{ namn: "Nordvik" }], pagination: { hasMore: false } } }]);
  const response = await ask(server, "tools/call", {
    name: "search_workplaces",
    arguments: { kommun: "0486", limit: 2 },
  });
  const body = response.result as { content: Array<{ text: string }>; isError: boolean };

  assert.equal(body.isError, false);
  assert.ok(calls[0]?.includes("/v1/arbetsstallen/kommun/0486"));
  const payload = JSON.parse(body.content[0]!.text) as Record<string, unknown>;
  assert.equal(payload["count"], 1);
});

test("a count is read out of the answer", async () => {
  const { server } = serverWith([{ body: { count: 1403 } }]);
  const response = await ask(server, "tools/call", { name: "count_workplaces", arguments: { lan: "04" } });
  const body = response.result as { content: Array<{ text: string }> };
  assert.equal(JSON.parse(body.content[0]!.text).count, 1403);
});

test("a failing tool is reported inside the result, not as a protocol error", async () => {
  const { server } = serverWith([{ status: 404, body: {} }]);
  const response = await ask(server, "tools/call", {
    name: "get_workplace",
    arguments: { cfarNr: "nope" },
  });
  const body = response.result as { content: Array<{ text: string }>; isError: boolean };

  assert.equal(response.error, undefined);
  assert.equal(body.isError, true);
  assert.match(body.content[0]!.text, /no such resource/);
});

test("two filters are refused as a tool error the model can read", async () => {
  const { server } = serverWith([]);
  const response = await ask(server, "tools/call", {
    name: "search_workplaces",
    arguments: { kommun: "0486", lan: "04" },
  });
  const body = response.result as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(body.isError, true);
  assert.match(body.content[0]!.text, /one thing at a time/);
});

test("a missing required argument is a tool error", async () => {
  const { server } = serverWith([]);
  const response = await ask(server, "tools/call", { name: "get_workplace", arguments: {} });
  const body = response.result as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(body.isError, true);
  assert.match(body.content[0]!.text, /cfarNr is required/);
});

test("an unknown tool is a protocol error", async () => {
  const { server } = serverWith([]);
  const response = await ask(server, "tools/call", { name: "nope", arguments: {} });
  assert.equal(response.error?.code, -32602);
});

test("an unknown method is a protocol error", async () => {
  const { server } = serverWith([]);
  assert.equal((await ask(server, "resources/list")).error?.code, -32601);
});

test("a broken line is a parse error with a null id", async () => {
  const { server } = serverWith([]);
  const response = await server.message("{not json");
  assert.equal(response?.error?.code, -32700);
  assert.equal(response?.id, null);
});

test("a message that is neither request nor notification is an invalid request", async () => {
  const { server } = serverWith([]);
  const response = await server.message(JSON.stringify({ jsonrpc: "1.0", id: 1, method: "x" }));
  assert.equal(response?.error?.code, -32600);
});

test("tools/call without params is an invalid params error", async () => {
  const { server } = serverWith([]);
  assert.equal((await ask(server, "tools/call")).error?.code, -32602);
});

test("the id is echoed, string or number", async () => {
  const { server } = serverWith([]);
  assert.equal((await ask(server, "ping", undefined, "abc")).id, "abc");
});

test("line returns a string, or null for a notification", async () => {
  const { server } = serverWith([]);
  const answer = await server.line(JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" }));
  assert.equal(JSON.parse(answer!).id, 9);
  assert.equal(await server.line(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled" })), null);
});
