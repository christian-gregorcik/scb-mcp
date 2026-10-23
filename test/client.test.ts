import assert from "node:assert/strict";
import { test } from "node:test";

import { Client, readPage } from "../src/client.ts";
import { ConfigError, UpstreamError } from "../src/errors.ts";

function stub(answers: Array<{ status?: number; body: unknown }>) {
  const calls: string[] = [];
  const headers: Array<Record<string, string>> = [];
  const fetch = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push(url);
    headers.push(init.headers);
    const answer = answers.shift() ?? { body: null };
    const status = answer.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body)),
    };
  };
  return { fetch, calls, headers };
}

test("the key travels in a header, never in the url", async () => {
  const { fetch, calls, headers } = stub([{ body: { data: [] } }]);
  const client = new Client({ apiKey: "secret", baseUrl: "https://example.test", fetch });
  await client.get("/v1/arbetsstallen", { limit: 5 });

  assert.equal(headers[0]?.["X-API-Key"], "secret");
  assert.ok(!calls[0]?.includes("secret"));
  assert.ok(calls[0]?.endsWith("/v1/arbetsstallen?limit=5"));
});

test("empty and undefined query values are left out", async () => {
  const { fetch, calls } = stub([{ body: {} }]);
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  await client.get("/v1/arbetsstallen", { limit: 5, cursorId: undefined, other: "" });
  assert.ok(calls[0]?.endsWith("?limit=5"));
});

test("a missing key is refused before anything is sent", () => {
  assert.throws(() => new Client({ apiKey: "" }), ConfigError);
});

test("a rejected key is said in words", async () => {
  const { fetch } = stub([{ status: 401, body: "no" }]);
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  await assert.rejects(client.get("/v1/arbetsstallen"), (error: unknown) => {
    assert.ok(error instanceof UpstreamError);
    assert.equal(error.status, 401);
    assert.match(error.message, /rejected the API key/);
    return true;
  });
});

test("rate limiting is named", async () => {
  const { fetch } = stub([{ status: 429, body: "" }]);
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  await assert.rejects(client.get("/v1/x"), /rate limiting/);
});

test("html where json was expected is reported as such", async () => {
  const { fetch } = stub([{ body: "<html>maintenance</html>" }]);
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  await assert.rejects(client.get("/v1/x"), /not JSON/);
});

test("collect follows the cursor until it has what was asked for", async () => {
  const { fetch, calls } = stub([
    { body: { data: [1, 2], pagination: { hasMore: true, nextCursorId: "c1" } } },
    { body: { data: [3, 4], pagination: { hasMore: true, nextCursorId: "c2" } } },
  ]);
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  const page = await client.collect<number>("/v1/arbetsstallen", {}, 4);

  assert.deepEqual(page.items, [1, 2, 3, 4]);
  assert.equal(calls.length, 2);
  assert.ok(!calls[0]?.includes("cursorId"));
  assert.ok(calls[1]?.includes("cursorId=c1"));
});

test("collect stops when the register says there is no more", async () => {
  const { fetch, calls } = stub([{ body: { data: [1], pagination: { hasMore: false } } }]);
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  const page = await client.collect<number>("/v1/arbetsstallen", {}, 100);

  assert.deepEqual(page.items, [1]);
  assert.equal(page.hasMore, false);
  assert.equal(calls.length, 1);
});

test("collect never asks for more than the page it still needs", async () => {
  const { fetch, calls } = stub([{ body: { data: [1, 2, 3], pagination: { hasMore: false } } }]);
  const client = new Client({ apiKey: "k", baseUrl: "https://example.test", fetch });
  await client.collect("/v1/arbetsstallen", {}, 3);
  assert.ok(calls[0]?.includes("limit=3"));
});

test("a page can arrive as a bare array", () => {
  assert.deepEqual(readPage([1, 2]), { items: [1, 2], nextCursorId: null, hasMore: false });
});

test("a page can carry its pagination at the top level", () => {
  const page = readPage({ items: [1], hasMore: true, nextCursorId: "c" });
  assert.deepEqual(page, { items: [1], nextCursorId: "c", hasMore: true });
});

test("a shape nobody recognises reads as empty rather than throwing", () => {
  assert.deepEqual(readPage({ unexpected: true }), { items: [], nextCursorId: null, hasMore: false });
  assert.deepEqual(readPage(null), { items: [], nextCursorId: null, hasMore: false });
});
