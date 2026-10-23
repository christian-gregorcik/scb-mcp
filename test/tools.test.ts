import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "../src/client.ts";
import { toolByName, TOOLS } from "../src/tools.ts";

function clientWith(answers: unknown[]) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => JSON.stringify(answers.shift() ?? null) };
  };
  return { client: new Client({ apiKey: "k", baseUrl: "https://example.test", fetch }), calls };
}

const search = toolByName("search_workplaces")!;
const count = toolByName("count_workplaces")!;

test("every tool has a unique name", () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
});

test("the default limit is used when none is given", async () => {
  const { client, calls } = clientWith([{ data: [], pagination: { hasMore: false } }]);
  await search.run({}, client);
  assert.ok(calls[0]?.includes("limit=25"));
});

test("a limit above the cap is refused with a reason", async () => {
  const { client } = clientWith([]);
  await assert.rejects(search.run({ limit: 5000 }, client), /capped at 200/);
});

test("a limit that is not a whole number is refused", async () => {
  const { client } = clientWith([]);
  await assert.rejects(search.run({ limit: 2.5 }, client), /whole number/);
  await assert.rejects(search.run({ limit: 0 }, client), /whole number/);
});

test("a limit sent as a string is accepted", async () => {
  const { client, calls } = clientWith([{ data: [], pagination: { hasMore: false } }]);
  await search.run({ limit: "5" }, client);
  assert.ok(calls[0]?.includes("limit=5"));
});

test("full switches to the wider path", async () => {
  const { client, calls } = clientWith([{ data: [], pagination: { hasMore: false } }]);
  await search.run({ full: true }, client);
  assert.ok(calls[0]?.includes("/v1/arbetsstallen/full"));
});

test("full sent as a string is accepted, anything else is refused", async () => {
  const { client, calls } = clientWith([{ data: [], pagination: { hasMore: false } }]);
  await search.run({ full: "true" }, client);
  assert.ok(calls[0]?.includes("/full"));
  await assert.rejects(search.run({ full: "maybe" }, client), /must be true or false/);
});

test("the search reports whether there is more behind the answer", async () => {
  const { client } = clientWith([{ data: [1, 2], pagination: { hasMore: true, nextCursorId: "c" } }]);
  const result = (await search.run({ limit: 2 }, client)) as Record<string, unknown>;
  assert.equal(result["count"], 2);
  assert.equal(result["hasMore"], true);
});

test("a count can arrive as a bare number", async () => {
  const { client } = clientWith([42]);
  assert.deepEqual(await count.run({}, client), { count: 42 });
});

test("a count can arrive under a swedish key", async () => {
  const { client } = clientWith([{ antal: 7 }]);
  assert.deepEqual(await count.run({}, client), { count: 7 });
});

test("a count with no number in it is reported", async () => {
  const { client } = clientWith([{ unexpected: true }]);
  await assert.rejects(count.run({}, client), /holds no number/);
});
