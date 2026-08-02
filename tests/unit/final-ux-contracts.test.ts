import assert from "node:assert/strict";
import test from "node:test";
import { initialCompanyCode } from "../../src/utils/companyContext.ts";
import { demoRoleLabels } from "../../src/utils/demoRoleLabels.ts";
import { validateDateRange, validateNumberRange } from "../../src/components/common/validation/rangeValidation.ts";

test("네 사용자 역할은 제품 표시명과 정확히 대응한다", () => {
  assert.deepEqual(demoRoleLabels, { Viewer: "조회 사용자", Operator: "일반 사용자", Manager: "일반 관리자", Admin: "시스템 관리자" });
});

test("세 업무 화면이 공유하는 단일 회사코드는 1000이다", () => {
  assert.equal(initialCompanyCode(), "1000");
  assert.equal(initialCompanyCode(["2000"]), "2000");
});

test("빈 범위는 허용하고 역방향 날짜·숫자는 거부한다", () => {
  assert.equal(validateDateRange("", "").valid, true);
  assert.equal(validateDateRange("2026-08-10", "2026-08-01").valid, false);
  assert.equal(validateNumberRange(undefined, undefined).valid, true);
  assert.equal(validateNumberRange(10, 1).valid, false);
});
