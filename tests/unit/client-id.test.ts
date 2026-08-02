import assert from "node:assert/strict";
import test from "node:test";
import { createClientId, type ClientCrypto } from "../../src/utils/clientId.ts";

test("uses crypto.randomUUID when available", () => {
  const source = { randomUUID: () => "00000000-0000-4000-8000-000000000001" };
  assert.equal(createClientId("history", source), "history-00000000-0000-4000-8000-000000000001");
});

test("uses a version 4 UUID from getRandomValues when randomUUID is unavailable", () => {
  const source: ClientCrypto = {
    getRandomValues(array) {
      const bytes = array as Uint8Array;
      bytes.fill(0xab);
      return array;
    }
  };
  assert.match(createClientId("request", source), /^request-abababab-abab-4bab-abab-abababababab$/);
});

test("accepts a partially implemented crypto object", () => {
  const source = { randomUUID: undefined };
  assert.match(createClientId("partial", source), /^partial-[a-z0-9]+-[a-z0-9]+$/);
});

test("falls back safely when crypto is unavailable", () => {
  const first = createClientId("fallback", null);
  const second = createClientId("fallback", null);
  assert.notEqual(first, second);
  assert.match(first, /^fallback-[a-z0-9]+-[a-z0-9]+$/);
});

test("creates 10,000 identifiers without duplicates", () => {
  let sequence = 0;
  const source: ClientCrypto = {
    getRandomValues(array) {
      const bytes = array as Uint8Array;
      const value = sequence++;
      bytes.fill(0);
      new DataView(bytes.buffer).setUint32(12, value);
      return array;
    }
  };
  const ids = new Set(Array.from({ length: 10_000 }, () => createClientId("bulk", source)));
  assert.equal(ids.size, 10_000);
});
