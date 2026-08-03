export interface RangeValidationResult {
  valid: boolean;
  message?: string;
}

export function validateDateRange(from: string, to: string): RangeValidationResult {
  if (!from || !to || from <= to) return { valid: true };
  return { valid: false, message: "시작일은 종료일보다 늦을 수 없습니다." };
}

export function validateNumberRange(minimum: string | number | undefined, maximum: string | number | undefined): RangeValidationResult {
  if (minimum === "" || maximum === "" || minimum === undefined || maximum === undefined) return { valid: true };
  const min = Number(minimum);
  const max = Number(maximum);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= max) return { valid: true };
  return { valid: false, message: "최솟값은 최댓값보다 클 수 없습니다." };
}
