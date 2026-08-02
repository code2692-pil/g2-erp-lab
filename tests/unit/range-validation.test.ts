import assert from "node:assert/strict";
import test from "node:test";
import { validateDateRange, validateNumberRange } from "../../src/components/common/validation/rangeValidation.ts";

test("빈 날짜와 같은 날짜 및 정방향 날짜 범위를 허용한다", () => {
  assert.equal(validateDateRange("", "2026-08-01").valid, true);
  assert.equal(validateDateRange("2026-08-01", "2026-08-01").valid, true);
  assert.equal(validateDateRange("2026-08-01", "2026-08-10").valid, true);
});

test("역방향 날짜 범위를 차단한다", () => {
  assert.deepEqual(validateDateRange("2026-08-10", "2026-08-01"), {
    valid: false,
    message: "시작일은 종료일보다 늦을 수 없습니다."
  });
});

test("숫자 범위는 빈 값과 정방향을 허용하고 역방향을 차단한다", () => {
  assert.equal(validateNumberRange("", 10).valid, true);
  assert.equal(validateNumberRange(1, 10).valid, true);
  assert.equal(validateNumberRange(10, 1).valid, false);
});
