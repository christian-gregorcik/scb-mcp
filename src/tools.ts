/**
 * The tools an assistant sees.
 *
 * Each one is a small, named job with a schema a model can fill in without reading the
 * register's documentation: no cursors, no version segment, no API key.
 */

import type { Client } from "./client.ts";
import { collectionPath, countPath, FILTERS, itemPath, selectionFrom } from "./endpoints.ts";
import type { Collection } from "./endpoints.ts";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>, client: Client) => Promise<unknown>;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

const filterProperties: Record<string, unknown> = {
  kommun: { type: "string", description: "Municipality code, four digits, for example 0486 for Strängnäs." },
  lan: { type: "string", description: "County code, two digits, for example 04 for Södermanland." },
  naringsgren: { type: "string", description: "Industry code (SNI), for example 41200 for building construction." },
  anstalldaklass: { type: "string", description: "Size class code for the number of employees." },
};

const listSchema = (noun: string): Record<string, unknown> => ({
  type: "object",
  properties: {
    ...filterProperties,
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_LIMIT,
      default: DEFAULT_LIMIT,
      description: `How many ${noun} to return. Paging is followed for you.`,
    },
    full: {
      type: "boolean",
      default: false,
      description: "Return every available variable instead of the usual selection.",
    },
  },
  additionalProperties: false,
});

const countSchema: Record<string, unknown> = {
  type: "object",
  properties: filterProperties,
  additionalProperties: false,
};

function limitOf(input: Record<string, unknown>): number {
  const raw = input["limit"];
  if (raw === undefined) return DEFAULT_LIMIT;
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`limit must be a whole number of 1 or more, got ${JSON.stringify(raw)}`);
  }
  if (value > MAX_LIMIT) {
    throw new Error(`limit is capped at ${MAX_LIMIT}; ask for a count instead of a longer list`);
  }
  return value;
}

function flagOf(input: Record<string, unknown>, name: string): boolean {
  const value = input[name];
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false, got ${JSON.stringify(value)}`);
}

function idOf(input: Record<string, unknown>, name: string): string {
  const value = input[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function readCount(payload: unknown): number {
  if (typeof payload === "number") return payload;
  if (typeof payload === "object" && payload !== null) {
    for (const key of ["count", "antal", "total", "value"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "number") return value;
    }
  }
  throw new Error("the register answered a count that holds no number");
}

function listTool(collection: Collection, name: string, noun: string): Tool {
  return {
    name,
    description:
      `Search ${noun} in Statistics Sweden's business register. Filter on one of ` +
      `${FILTERS.join(", ")}, or leave the filters out to read from the top of the register.`,
    inputSchema: listSchema(noun),
    run: async (input, client) => {
      const selection = selectionFrom(input);
      const want = limitOf(input);
      const page = await client.collect<unknown>(
        collectionPath(collection, selection, flagOf(input, "full")),
        {},
        want,
      );
      return { count: page.items.length, hasMore: page.hasMore, items: page.items };
    },
  };
}

function countTool(collection: Collection, name: string, noun: string): Tool {
  return {
    name,
    description: `Count ${noun} in the register, with the same filters as the search. Cheaper than listing them.`,
    inputSchema: countSchema,
    run: async (input, client) => {
      const selection = selectionFrom(input);
      return { count: readCount(await client.get(countPath(collection, selection))) };
    },
  };
}

function itemTool(collection: Collection, name: string, idName: string, idDescription: string): Tool {
  return {
    name,
    description: `Read one entry from the register by its ${idName}.`,
    inputSchema: {
      type: "object",
      properties: {
        [idName]: { type: "string", description: idDescription },
        full: { type: "boolean", default: false, description: "Return every available variable." },
      },
      required: [idName],
      additionalProperties: false,
    },
    run: async (input, client) =>
      client.get(itemPath(collection, idOf(input, idName), flagOf(input, "full"))),
  };
}

export const TOOLS: Tool[] = [
  listTool("arbetsstallen", "search_workplaces", "workplaces"),
  countTool("arbetsstallen", "count_workplaces", "workplaces"),
  itemTool("arbetsstallen", "get_workplace", "cfarNr", "The workplace identifier used by the register."),
  listTool("juridiskaenheter", "search_legal_entities", "legal entities"),
  countTool("juridiskaenheter", "count_legal_entities", "legal entities"),
  itemTool("juridiskaenheter", "get_legal_entity", "peOrgNr", "The organisation number of the legal entity."),
];

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((entry) => entry.name === name);
}
