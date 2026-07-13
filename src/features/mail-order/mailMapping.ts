import { mockItems } from "../common-code/item/mockData";
import { mockPartners } from "../common-code/partner/mockData";
import type { SalesOrderHeader, SalesOrderLine } from "../sales-order/types";
import { calculateSalesOrderLineAmounts } from "../sales-order/utils";
import { extractMailOrder } from "./mailParser";
import type {
  FieldParseStatus,
  MailMessage,
  MailParseResult,
  ParsedField,
  ParsedMailOrderLine
} from "./types";

function field<T>(value: T | null, status: FieldParseStatus, rawValue?: string): ParsedField<T> {
  return { value, status, rawValue };
}

function normalizeDate(value: string | null) {
  if (!value) return field<string>(null, "누락");
  const normalized = value.replace(/[./]/g, "-");
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return field<string>(null, "오류", value);
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  const valid =
    date.getUTCFullYear() === Number(matched[1]) &&
    date.getUTCMonth() === Number(matched[2]) - 1 &&
    date.getUTCDate() === Number(matched[3]);
  return valid ? field(normalized, "확인됨", value) : field<string>(null, "오류", value);
}

function parseNumber(value: string | null) {
  if (!value) return field<number>(null, "누락");
  const normalized = value.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return field<number>(null, "오류", value);
  return field(Number(normalized), "확인됨", value);
}

function createLine(
  rawLine: { NO_LINE: number; CD_ITEM: string | null; NM_ITEM: string | null; QT_SO: string | null; UM_SO: string | null; DT_DLV: string | null; DC_RMK: string | null },
  firm: string
): ParsedMailOrderLine {
  const matchedItem = mockItems.find(
    (item) =>
      (!firm || item.CD_FIRM === firm) &&
      (item.CD_ITEM === rawLine.CD_ITEM || (!rawLine.CD_ITEM && item.NM_ITEM === rawLine.NM_ITEM))
  );
  const itemCode = rawLine.CD_ITEM
    ? field(rawLine.CD_ITEM, matchedItem ? "확인됨" : "오류", rawLine.CD_ITEM)
    : matchedItem
      ? field(matchedItem.CD_ITEM, "추정됨", rawLine.NM_ITEM ?? undefined)
      : field<string>(null, "누락");
  const itemName = rawLine.NM_ITEM
    ? field(rawLine.NM_ITEM, "확인됨", rawLine.NM_ITEM)
    : matchedItem
      ? field(matchedItem.NM_ITEM, "추정됨")
      : field<string>(null, "누락");

  return {
    NO_LINE: rawLine.NO_LINE,
    CD_ITEM: itemCode,
    NM_ITEM: itemName,
    QT_SO: parseNumber(rawLine.QT_SO),
    UM_SO: parseNumber(rawLine.UM_SO),
    DT_DLV: normalizeDate(rawLine.DT_DLV),
    DC_RMK: rawLine.DC_RMK ? field(rawLine.DC_RMK, "확인됨") : field("", "추정됨")
  };
}

export function parseAndMapMailOrder(mail: MailMessage): MailParseResult {
  const raw = extractMailOrder(mail);
  if (!raw) {
    return {
      mail,
      status: "실패",
      header: {
        CD_FIRM: field<string>(null, "누락"), DT_SO: field<string>(null, "누락"),
        CD_PARTNER: field<string>(null, "누락"), NM_PARTNER: field<string>(null, "누락"),
        DC_RMK: field("", "추정됨"), MAIL_ID: field(mail.MAIL_ID, "확인됨")
      },
      lines: [],
      warnings: [],
      errors: ["수주 메일 형식을 인식하지 못했습니다."],
      canApply: false,
      requiresReview: true
    };
  }

  const partner = mockPartners.find(
    (candidate) =>
      candidate.CD_PARTNER === raw.CD_PARTNER || (!raw.CD_PARTNER && candidate.NM_PARTNER === raw.NM_PARTNER)
  );
  const firm = partner?.CD_FIRM ?? null;
  const lines = raw.lines.map((line) => createLine(line, firm ?? ""));
  const partnerCode = raw.CD_PARTNER
    ? field(raw.CD_PARTNER, partner ? "확인됨" : "오류", raw.CD_PARTNER)
    : partner
      ? field(partner.CD_PARTNER, "추정됨", raw.NM_PARTNER ?? undefined)
      : field<string>(null, "누락");
  const partnerName = raw.NM_PARTNER
    ? field(raw.NM_PARTNER, partner ? "확인됨" : "오류", raw.NM_PARTNER)
    : partner
      ? field(partner.NM_PARTNER, "추정됨")
      : field<string>(null, "누락");
  const header = {
    CD_FIRM: firm ? field(firm, "확인됨") : field<string>(null, "누락"),
    DT_SO: normalizeDate(raw.DT_SO),
    CD_PARTNER: partnerCode,
    NM_PARTNER: partnerName,
    DC_RMK: raw.DC_RMK ? field(raw.DC_RMK, "확인됨") : field("", "추정됨"),
    MAIL_ID: field(raw.MAIL_ID, "확인됨")
  };
  const warnings: string[] = [];
  const errors: string[] = [];
  const fields = [header.CD_FIRM, header.DT_SO, header.CD_PARTNER, header.NM_PARTNER, ...lines.flatMap((line) => [line.CD_ITEM, line.QT_SO, line.UM_SO, line.DT_DLV])];
  if (header.CD_PARTNER.status === "누락") errors.push("거래처코드 또는 거래처명이 누락되었습니다.");
  if (lines.length === 0) errors.push("품목 행을 찾지 못했습니다.");
  for (const line of lines) {
    if (line.CD_ITEM.status === "누락") errors.push(`${line.NO_LINE}행 품목코드가 누락되었습니다.`);
    if (line.CD_ITEM.status === "오류") errors.push(`${line.NO_LINE}행 품목코드를 마스터에서 찾지 못했습니다.`);
    if (line.QT_SO.status === "오류") errors.push(`${line.NO_LINE}행 수량 형식이 올바르지 않습니다: ${line.QT_SO.rawValue}`);
    if (line.UM_SO.status === "오류") errors.push(`${line.NO_LINE}행 단가 형식이 올바르지 않습니다: ${line.UM_SO.rawValue}`);
  }
  if (fields.some((value) => value.status === "추정됨")) warnings.push("일부 값은 메일 본문 또는 mock 마스터에서 추정했습니다.");
  if (header.DT_SO.status !== "확인됨") errors.push("수주일자를 확인할 수 없습니다.");
  const canApply = errors.length === 0 && lines.every((line) => line.QT_SO.value !== null && line.QT_SO.value > 0 && line.UM_SO.value !== null && line.UM_SO.value >= 0);

  return {
    mail,
    status: canApply ? (warnings.length > 0 ? "부분성공" : "성공") : "실패",
    header,
    lines,
    warnings,
    errors,
    canApply,
    requiresReview: true
  };
}

export function mapParsedOrderToSalesOrder(result: MailParseResult, temporaryOrderNo: string) {
  if (!result.canApply) return null;
  const header = result.header;
  if (!header.CD_FIRM.value || !header.DT_SO.value || !header.CD_PARTNER.value || !header.NM_PARTNER.value || !header.MAIL_ID.value) return null;

  const salesHeader: SalesOrderHeader = {
    CD_FIRM: header.CD_FIRM.value,
    NO_SO: temporaryOrderNo,
    DT_SO: header.DT_SO.value,
    CD_PARTNER: header.CD_PARTNER.value,
    NM_PARTNER: header.NM_PARTNER.value,
    CD_EMP: "",
    ST_SO: "확정",
    DC_RMK: header.DC_RMK.value ?? "",
    MAIL_ID: header.MAIL_ID.value
  };
  const salesLines: SalesOrderLine[] = [];
  for (const line of result.lines) {
    if (!line.CD_ITEM.value || !line.NM_ITEM.value || line.QT_SO.value === null || line.UM_SO.value === null || !line.DT_DLV.value) return null;
    const item = mockItems.find((candidate) => candidate.CD_FIRM === salesHeader.CD_FIRM && candidate.CD_ITEM === line.CD_ITEM.value);
    if (!item) return null;
    salesLines.push({
      CD_FIRM: salesHeader.CD_FIRM, NO_SO: temporaryOrderNo, NO_LINE: line.NO_LINE,
      CD_ITEM: item.CD_ITEM, NM_ITEM: item.NM_ITEM, STND_ITEM: item.STND_ITEM, UNIT_ITEM: item.UNIT_ITEM,
      QT_SO: line.QT_SO.value, UM_SO: line.UM_SO.value,
      ...calculateSalesOrderLineAmounts(line.QT_SO.value, line.UM_SO.value),
      DT_DLV: line.DT_DLV.value, DC_RMK: line.DC_RMK.value ?? ""
    });
  }
  return { header: salesHeader, lines: salesLines };
}
