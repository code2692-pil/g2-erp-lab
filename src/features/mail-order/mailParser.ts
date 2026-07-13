import type { MailMessage, RawMailOrder, RawMailOrderLine } from "./types";

function readLabel(body: string, label: string) {
  const expression = new RegExp(`^${label}:\\s*(.*)$`, "m");
  return body.match(expression)?.[1]?.trim() || null;
}

function readLineValue(segment: string, label: string) {
  const expression = new RegExp(`${label}:\\s*([^|]+)`);
  return segment.match(expression)?.[1]?.trim() || null;
}

function parseLines(body: string) {
  return body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("품목:"))
    .map<RawMailOrderLine>((line, index) => {
      const [itemCode, itemName] = line
        .replace(/^품목:\s*/, "")
        .split("|")
        .slice(0, 2)
        .map((value) => value.trim());

      return {
        NO_LINE: index + 1,
        CD_ITEM: itemCode || null,
        NM_ITEM: itemName || null,
        QT_SO: readLineValue(line, "수량"),
        UM_SO: readLineValue(line, "단가"),
        DT_DLV: readLineValue(line, "납기"),
        DC_RMK: readLineValue(line, "비고")
      };
    });
}

export function extractMailOrder(message: MailMessage): RawMailOrder | null {
  if (!message.SUBJECT.includes("수주") || !message.BODY_TEXT.includes("품목:")) return null;

  return {
    MAIL_ID: message.MAIL_ID,
    CD_PARTNER: readLabel(message.BODY_TEXT, "거래처코드"),
    NM_PARTNER: readLabel(message.BODY_TEXT, "거래처명"),
    DT_SO: readLabel(message.BODY_TEXT, "수주일자"),
    DC_RMK: readLabel(message.BODY_TEXT, "비고"),
    lines: parseLines(message.BODY_TEXT)
  };
}
