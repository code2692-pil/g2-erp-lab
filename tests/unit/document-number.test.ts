import assert from "node:assert/strict";
import test from "node:test";
import { allocateMockDocumentNumber } from "../../src/utils/documentNumber.ts";

test("Mock document numbers use business month and independent type counters", () => {
  const sales = allocateMockDocumentNumber("SOR", "1000", "2091-03-31", []);
  const purchase = allocateMockDocumentNumber("POR", "1000", "2091-03-31", []);
  const work = allocateMockDocumentNumber("WMO", "1000", "2091-03-31", []);

  assert.equal(sales, "SOR2091030001");
  assert.equal(purchase, "POR2091030001");
  assert.equal(work, "WMO2091030001");
});

test("Mock counter does not reuse a number removed from the live document list", () => {
  const first = allocateMockDocumentNumber("SOR", "1000", "2092-04-01", []);
  const second = allocateMockDocumentNumber("SOR", "1000", "2092-04-02", []);

  assert.equal(first, "SOR2092040001");
  assert.equal(second, "SOR2092040002");
});

test("Mock counter reports the monthly 9999 limit explicitly", () => {
  assert.throws(
    () => allocateMockDocumentNumber("POR", "1000", "2093-05-01", ["POR2093059999"]),
    /9999/
  );
});
