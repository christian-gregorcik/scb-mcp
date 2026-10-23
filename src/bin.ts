#!/usr/bin/env node
/**
 * The executable: wire the register client to stdio and wait.
 *
 * Nothing is written to stdout except protocol messages. Anything a person needs to
 * read goes to stderr, because stdout is the transport.
 */

import process from "node:process";

import { Client, DEFAULT_BASE_URL } from "./client.ts";
import { Server } from "./server.ts";
import { serve } from "./stdio.ts";

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const apiKey = env["SCB_API_KEY"];
  if (!apiKey) {
    process.stderr.write(
      "scb-mcp: set SCB_API_KEY to the key you were given for Statistics Sweden's business register\n",
    );
    return 2;
  }

  const client = new Client({
    apiKey,
    baseUrl: env["SCB_BASE_URL"] ?? DEFAULT_BASE_URL,
  });

  process.stderr.write(`scb-mcp listening on stdio, register at ${env["SCB_BASE_URL"] ?? DEFAULT_BASE_URL}\n`);
  await serve(new Server({ client }), {
    input: process.stdin,
    write: (line) => process.stdout.write(line),
  });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
