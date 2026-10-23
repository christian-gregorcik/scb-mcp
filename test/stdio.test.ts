import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "../src/client.ts";
import { Server } from "../src/server.ts";
import { serve } from "../src/stdio.ts";

function newServer() {
  const fetch = async () => ({ ok: true, status: 200, text: async () => "{}" });
  return new Server({ client: new Client({ apiKey: "k", baseUrl: "https://example.test", fetch }) });
}

async function* chunks(...parts: string[]) {
  for (const part of parts) yield part;
}

function request(id: number, method: string) {
  return JSON.stringify({ jsonrpc: "2.0", id, method });
}

test("a line split across chunks is reassembled", async () => {
  const written: string[] = [];
  const line = request(1, "ping");
  await serve(newServer(), {
    input: chunks(line.slice(0, 10), line.slice(10), "\n"),
    write: (value) => written.push(value),
  });

  assert.equal(written.length, 1);
  assert.equal(JSON.parse(written[0]!).id, 1);
});

test("several lines in one chunk are all answered, in order", async () => {
  const written: string[] = [];
  await serve(newServer(), {
    input: chunks(`${request(1, "ping")}\n${request(2, "tools/list")}\n`),
    write: (value) => written.push(value),
  });

  assert.deepEqual(written.map((line) => JSON.parse(line).id), [1, 2]);
});

test("a last line without a trailing newline is still answered", async () => {
  const written: string[] = [];
  await serve(newServer(), { input: chunks(request(7, "ping")), write: (v) => written.push(v) });
  assert.equal(JSON.parse(written[0]!).id, 7);
});

test("blank lines are skipped", async () => {
  const written: string[] = [];
  await serve(newServer(), { input: chunks("\n\n  \n"), write: (v) => written.push(v) });
  assert.equal(written.length, 0);
});

test("a notification produces no output", async () => {
  const written: string[] = [];
  const notification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
  await serve(newServer(), { input: chunks(`${notification}\n`), write: (v) => written.push(v) });
  assert.equal(written.length, 0);
});

test("bytes work as well as strings", async () => {
  const written: string[] = [];
  const bytes = new TextEncoder().encode(`${request(3, "ping")}\n`);
  await serve(newServer(), { input: chunks(bytes as unknown as string), write: (v) => written.push(v) });
  assert.equal(JSON.parse(written[0]!).id, 3);
});

test("every answer ends with a newline", async () => {
  const written: string[] = [];
  await serve(newServer(), { input: chunks(`${request(1, "ping")}\n`), write: (v) => written.push(v) });
  assert.ok(written[0]!.endsWith("\n"));
});
