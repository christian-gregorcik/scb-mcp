/**
 * Where each thing lives in the register.
 *
 * The published contract puts the version in the path and every filter in a path
 * segment rather than a query string, which means exactly one filter can be applied
 * per call. That restriction is the API's, not this server's, and the tools say so
 * plainly instead of silently dropping the second one.
 */

export type Collection = "arbetsstallen" | "juridiskaenheter";

export const FILTERS = ["kommun", "lan", "naringsgren", "anstalldaklass"] as const;
export type Filter = (typeof FILTERS)[number];

export interface Selection {
  filter?: Filter;
  code?: string;
}

export function collectionPath(collection: Collection, selection: Selection, full = false): string {
  const parts = [`/v1/${collection}`];
  if (selection.filter && selection.code) {
    parts.push(`/${selection.filter}/${encodeURIComponent(selection.code)}`);
  }
  if (full) parts.push("/full");
  return parts.join("");
}

export function countPath(collection: Collection, selection: Selection): string {
  return `${collectionPath(collection, selection)}/count`;
}

export function itemPath(collection: Collection, id: string, full = false): string {
  return `/v1/${collection}/${encodeURIComponent(id)}${full ? "/full" : ""}`;
}

/** Pick the one filter that was given, and complain about two. */
export function selectionFrom(input: Record<string, unknown>): Selection {
  const given = FILTERS.filter((name) => {
    const value = input[name];
    return typeof value === "string" && value.trim() !== "";
  });

  if (given.length === 0) return {};
  if (given.length > 1) {
    throw new Error(
      `the register filters on one thing at a time; ${given.join(" and ")} were both given`,
    );
  }
  const filter = given[0] as Filter;
  return { filter, code: String(input[filter]).trim() };
}
