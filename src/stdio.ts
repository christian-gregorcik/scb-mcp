/** Reading newline-delimited JSON from a stream and writing answers back. */

import type { Server } from "./server.ts";

export interface Streams {
  input: AsyncIterable<string | Uint8Array>;
  write: (line: string) => void;
}

/**
 * Pump one stream through the server until it ends.
 *
 * Chunks arrive at the size the operating system feels like, so lines are reassembled
 * here. A blank line is skipped rather than reported, because a stray newline is not
 * an error worth answering.
 */
export async function serve(server: Server, streams: Streams): Promise<void> {
  let pending = "";

  for await (const chunk of streams.input) {
    pending += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line !== "") {
        const answer = await server.line(line);
        if (answer !== null) streams.write(`${answer}\n`);
      }
      newline = pending.indexOf("\n");
    }
  }

  const last = pending.trim();
  if (last !== "") {
    const answer = await server.line(last);
    if (answer !== null) streams.write(`${answer}\n`);
  }
}
