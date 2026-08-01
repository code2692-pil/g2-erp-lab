export type DocumentNumberPrefix = "SOR" | "POR" | "WMO";

const MAX_MONTHLY_SERIAL = 9_999;
const highWaterMarks = new Map<string, number>();

function getBusinessYearMonth(businessDate: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(businessDate);
  if (!match) throw new Error("업무일자는 YYYY-MM-DD 형식이어야 합니다.");
  return `${match[1]}${match[2]}`;
}

export function allocateMockDocumentNumber(
  prefix: DocumentNumberPrefix,
  companyCode: string,
  businessDate: string,
  existingNumbers: readonly string[]
) {
  const yearMonth = getBusinessYearMonth(businessDate);
  const key = `${companyCode}:${prefix}:${yearMonth}`;
  const pattern = new RegExp(`^${prefix}${yearMonth}(\\d{4})$`);
  const observedMaximum = existingNumbers.reduce((maximum, number) => {
    const serial = Number(number.match(pattern)?.[1] ?? 0);
    return Math.max(maximum, serial);
  }, 0);
  const current = Math.max(highWaterMarks.get(key) ?? 0, observedMaximum);

  if (current >= MAX_MONTHLY_SERIAL) {
    throw new Error(`${prefix}${yearMonth} 문서번호가 월 최대 일련번호 9999에 도달했습니다.`);
  }

  const next = current + 1;
  highWaterMarks.set(key, next);
  return `${prefix}${yearMonth}${String(next).padStart(4, "0")}`;
}
