/**
 * A small client for Statistics Sweden's business register (Allmänna företagsregistret).
 *
 * Two things are worth knowing about the API, and both are handled here so that a
 * model never has to learn them:
 *
 *   - every call needs an API key in the `X-API-Key` header;
 *   - collections are traversed with `limit` and `cursorId`, and the answer says
 *     whether there is more.
 *
 * `fetch` is injected, so every test in this repository runs without a network.
 */

import { ConfigError, UpstreamError } from "./errors.ts";

export const DEFAULT_BASE_URL = "https://apiafr.scb.se";

/** The largest page the register will return. */
export const MAX_PAGE = 5000;

export type Fetch = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface Page<T> {
  items: T[];
  nextCursorId: string | null;
  hasMore: boolean;
}

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

export class Client {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: Fetch;
  readonly #timeoutMs: number;

  constructor(options: ClientOptions) {
    if (!options.apiKey) {
      throw new ConfigError("an API key is required; set SCB_API_KEY");
    }
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#fetch = options.fetch ?? (globalThis.fetch as unknown as Fetch);
    this.#timeoutMs = options.timeoutMs ?? 20_000;
  }

  /** One request. The key goes in a header and is never put in the path or the log. */
  async get(path: string, query: Record<string, string | number | undefined> = {}): Promise<unknown> {
    const url = new URL(`${this.#baseUrl}${path}`);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(url.toString(), {
        headers: { "X-API-Key": this.#apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new UpstreamError(response.status, describe(response.status, body));
      }
      return body ? (JSON.parse(body) as unknown) : null;
    } catch (cause) {
      if (cause instanceof UpstreamError) throw cause;
      if (cause instanceof SyntaxError) {
        throw new UpstreamError(502, "the register answered with something that is not JSON");
      }
      if (cause instanceof Error && cause.name === "AbortError") {
        throw new UpstreamError(504, `the register did not answer within ${this.#timeoutMs} ms`);
      }
      throw cause;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Read a collection, following the cursor until `want` items are in hand or the
   * register says there is no more.
   */
  async collect<T>(path: string, query: Record<string, string | number | undefined>, want: number): Promise<Page<T>> {
    const items: T[] = [];
    let cursorId: string | undefined;
    let hasMore = false;
    let nextCursorId: string | null = null;

    while (items.length < want) {
      const page = readPage<T>(
        await this.get(path, { ...query, limit: Math.min(want - items.length, MAX_PAGE), cursorId }),
      );
      items.push(...page.items);
      hasMore = page.hasMore;
      nextCursorId = page.nextCursorId;
      if (!page.hasMore || page.nextCursorId === null || page.items.length === 0) break;
      cursorId = page.nextCursorId;
    }

    return { items: items.slice(0, want), nextCursorId, hasMore: hasMore || items.length > want };
  }
}

function describe(status: number, body: string): string {
  const hint =
    status === 401 || status === 403
      ? "the register rejected the API key"
      : status === 404
        ? "no such resource in the register"
        : status === 429
          ? "the register is rate limiting this key"
          : `the register answered ${status}`;
  const detail = body.trim().slice(0, 200);
  return detail ? `${hint}: ${detail}` : hint;
}

/** Read one page out of whatever shape the answer arrived in. */
export function readPage<T>(payload: unknown): Page<T> {
  if (Array.isArray(payload)) {
    return { items: payload as T[], nextCursorId: null, hasMore: false };
  }
  if (typeof payload !== "object" || payload === null) {
    return { items: [], nextCursorId: null, hasMore: false };
  }

  const body = payload as Record<string, unknown>;
  const items = firstArray(body["data"], body["items"], body["arbetsstallen"], body["result"]);
  const pagination = (body["pagination"] ?? body) as Record<string, unknown>;
  const cursor = pagination["nextCursorId"];
  const more = pagination["hasMore"];

  return {
    items: (items ?? []) as T[],
    nextCursorId: typeof cursor === "string" && cursor !== "" ? cursor : null,
    hasMore: more === true,
  };
}

function firstArray(...candidates: unknown[]): unknown[] | null {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}
