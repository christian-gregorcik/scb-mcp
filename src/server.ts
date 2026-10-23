/**
 * The Model Context Protocol server: initialize, tools/list, tools/call.
 *
 * The transport is deliberately a parameter. The server reads lines and writes lines;
 * whether those lines come from stdio or from a pipe in a test is not its business,
 * and that is why the protocol is tested end to end without spawning anything.
 */

import type { Client } from "./client.ts";
import { ScbError } from "./errors.ts";
import {
  errorFrom,
  INVALID_PARAMS,
  INVALID_REQUEST,
  isNotification,
  isRequest,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  result,
  RpcError,
  failure,
} from "./jsonrpc.ts";
import type { Response } from "./jsonrpc.ts";
import { TOOLS, toolByName } from "./tools.ts";

export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_NAME = "scb-mcp";
export const SERVER_VERSION = "0.1.0";

export interface ServerOptions {
  client: Client;
  name?: string;
  version?: string;
}

export class Server {
  readonly #client: Client;
  readonly #name: string;
  readonly #version: string;
  #initialized = false;

  constructor(options: ServerOptions) {
    this.#client = options.client;
    this.#name = options.name ?? SERVER_NAME;
    this.#version = options.version ?? SERVER_VERSION;
  }

  get initialized(): boolean {
    return this.#initialized;
  }

  /** Handle one line of input. Returns the line to write back, or null for a notification. */
  async line(input: string): Promise<string | null> {
    const response = await this.message(input);
    return response === null ? null : JSON.stringify(response);
  }

  async message(input: string): Promise<Response | null> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return failure(null, { code: PARSE_ERROR, message: "the message is not JSON" });
    }

    if (isNotification(parsed)) {
      if (parsed.method === "notifications/initialized") this.#initialized = true;
      return null;
    }
    if (!isRequest(parsed)) {
      return failure(null, { code: INVALID_REQUEST, message: "not a JSON-RPC 2.0 request" });
    }

    try {
      return result(parsed.id, await this.#dispatch(parsed.method, parsed.params));
    } catch (cause) {
      return errorFrom(parsed.id, cause);
    }
  }

  async #dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.#name, version: this.#version },
        };
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };
      case "tools/call":
        return this.#call(params);
      default:
        throw new RpcError(METHOD_NOT_FOUND, `there is no method ${method}`);
    }
  }

  async #call(params: unknown): Promise<unknown> {
    if (typeof params !== "object" || params === null) {
      throw new RpcError(INVALID_PARAMS, "tools/call needs a name and arguments");
    }
    const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
    if (typeof name !== "string") {
      throw new RpcError(INVALID_PARAMS, "tools/call needs a tool name");
    }
    const tool = toolByName(name);
    if (!tool) {
      throw new RpcError(INVALID_PARAMS, `there is no tool called ${name}`);
    }
    const input = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;

    // A tool that fails is reported inside the result, the way the protocol asks, so
    // the model can read it and try something else. A protocol error would hide it.
    try {
      const value = await tool.run(input, this.#client);
      return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError: false };
    } catch (cause) {
      const message = cause instanceof ScbError || cause instanceof Error ? cause.message : String(cause);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  }
}
