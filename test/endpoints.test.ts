import assert from "node:assert/strict";
import { test } from "node:test";

import { collectionPath, countPath, itemPath, selectionFrom } from "../src/endpoints.ts";

test("a collection with no filter", () => {
  assert.equal(collectionPath("arbetsstallen", {}), "/v1/arbetsstallen");
});

test("a filter becomes a path segment", () => {
  assert.equal(
    collectionPath("arbetsstallen", { filter: "kommun", code: "0486" }),
    "/v1/arbetsstallen/kommun/0486",
  );
});

test("full is appended last", () => {
  assert.equal(
    collectionPath("juridiskaenheter", { filter: "lan", code: "04" }, true),
    "/v1/juridiskaenheter/lan/04/full",
  );
});

test("a count hangs off the filtered collection", () => {
  assert.equal(
    countPath("arbetsstallen", { filter: "naringsgren", code: "41200" }),
    "/v1/arbetsstallen/naringsgren/41200/count",
  );
});

test("one entry, by identifier", () => {
  assert.equal(itemPath("juridiskaenheter", "5560001234"), "/v1/juridiskaenheter/5560001234");
  assert.equal(itemPath("arbetsstallen", "12345", true), "/v1/arbetsstallen/12345/full");
});

test("an identifier is escaped", () => {
  assert.equal(itemPath("arbetsstallen", "a/b"), "/v1/arbetsstallen/a%2Fb");
});

test("no filter given is no filter", () => {
  assert.deepEqual(selectionFrom({ limit: 10 }), {});
});

test("an empty filter counts as absent", () => {
  assert.deepEqual(selectionFrom({ kommun: "  " }), {});
});

test("the one filter given is the one used", () => {
  assert.deepEqual(selectionFrom({ kommun: " 0486 " }), { filter: "kommun", code: "0486" });
});

test("two filters are refused, and both are named", () => {
  assert.throws(() => selectionFrom({ kommun: "0486", lan: "04" }), /kommun and lan/);
});
