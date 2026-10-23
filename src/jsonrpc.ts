/**
 * The slice of JSON-RPC 2.0 that MCP uses, and nothing else.
 *
 * Framing is newline-delimited JSON on stdio, which is what the stdio transport in the
 * Model Context Protocol specifies. One message per line, no Content-Length header.
 */

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export type Id = string | number;

export interface Request {
  jsonrpc: "2.0";
  id: Id;
  method: string;
  params?: unknown;
}

export interface Notification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface ErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

export interface Response {
  jsonrpc: "2.0";
  id: Id | null;
  result?: unknown;
  error?: ErrorBody;
}

export class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

export function result(id: Id, value: unknown): Response {
  return { jsonrpc: "2.0", id, result: value };
}

export function failure(id: Id | null, error: ErrorBody): Response {
  return { jsonrpc: "2.0", id, error };
}

export function errorFrom(id: Id | null, cause: unknown): Response {
  if (cause instanceof RpcError) {
    const body: ErrorBody = { code: cause.code, message: cause.message };
    if (cause.data !== undefined) body.data = cause.data;
    return failure(id, body);
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return failure(id, { code: INTERNAL_ERROR, message });
}

/** True when the value is a request: it has an id and a method. */
export function isRequest(value: unknown): value is Request {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message["jsonrpc"] !== "2.0") return false;
  if (typeof message["method"] !== "string") return false;
  const id = message["id"];
  return typeof id === "string" || typeof id === "number";
}

/** True when the value is a notification: a method and no id. */
export function isNotification(value: unknown): value is Notification {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message["jsonrpc"] !== "2.0") return false;
  if (typeof message["method"] !== "string") return false;
  return message["id"] === undefined;
}
