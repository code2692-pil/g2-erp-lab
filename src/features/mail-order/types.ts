export type MailParseStatus = "대기" | "성공" | "부분성공" | "실패" | "반영완료";
export type FieldParseStatus = "확인됨" | "추정됨" | "누락" | "오류";

export interface MailAttachment {
  FILE_NAME: string;
  MIME_TYPE: string;
  SIZE: number;
  MOCK_CONTENT: string;
}

export interface MailMessage {
  MAIL_ID: string;
  FROM_ADDRESS: string;
  FROM_NAME: string;
  SUBJECT: string;
  RECEIVED_AT: string;
  BODY_TEXT: string;
  ATTACHMENTS: readonly MailAttachment[];
  PARSE_STATUS: MailParseStatus;
  ERROR_MESSAGE: string | null;
}

export interface ParsedField<T> {
  value: T | null;
  status: FieldParseStatus;
  rawValue?: string;
}

export interface ParsedMailOrderHeader {
  CD_FIRM: ParsedField<string>;
  DT_SO: ParsedField<string>;
  CD_PARTNER: ParsedField<string>;
  NM_PARTNER: ParsedField<string>;
  DC_RMK: ParsedField<string>;
  MAIL_ID: ParsedField<string>;
}

export interface ParsedMailOrderLine {
  NO_LINE: number;
  CD_ITEM: ParsedField<string>;
  NM_ITEM: ParsedField<string>;
  QT_SO: ParsedField<number>;
  UM_SO: ParsedField<number>;
  DT_DLV: ParsedField<string>;
  DC_RMK: ParsedField<string>;
}

export interface RawMailOrderLine {
  NO_LINE: number;
  CD_ITEM: string | null;
  NM_ITEM: string | null;
  QT_SO: string | null;
  UM_SO: string | null;
  DT_DLV: string | null;
  DC_RMK: string | null;
}

export interface RawMailOrder {
  MAIL_ID: string;
  CD_PARTNER: string | null;
  NM_PARTNER: string | null;
  DT_SO: string | null;
  DC_RMK: string | null;
  lines: readonly RawMailOrderLine[];
}

export interface MailParseResult {
  mail: MailMessage;
  status: MailParseStatus;
  header: ParsedMailOrderHeader;
  lines: readonly ParsedMailOrderLine[];
  warnings: readonly string[];
  errors: readonly string[];
  canApply: boolean;
  requiresReview: boolean;
}
