import { useMemo, useState } from "react";
import { ErpDialog } from "../../components/common/ErpDialog";
import { mockEmails } from "./mockEmails";
import { parseAndMapMailOrder } from "./mailMapping";
import type { MailParseResult } from "./types";

interface MailOrderImportDialogProps {
  open: boolean;
  appliedMailIds: readonly string[];
  onClose: () => void;
  onApply: (result: MailParseResult) => Promise<{ success: boolean; message: string }>;
}

function displayValue(value: string | number | null) {
  return value === null ? "-" : String(value);
}

export function MailOrderImportDialog({
  open,
  appliedMailIds,
  onClose,
  onApply
}: MailOrderImportDialogProps) {
  const [selectedMailId, setSelectedMailId] = useState(mockEmails[0].MAIL_ID);
  const [result, setResult] = useState<MailParseResult | null>(null);
  const [notice, setNotice] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const selectedMail = useMemo(
    () => mockEmails.find((mail) => mail.MAIL_ID === selectedMailId) ?? mockEmails[0],
    [selectedMailId]
  );

  const selectMail = (mailId: string) => {
    setSelectedMailId(mailId);
    setResult(null);
    setNotice("");
  };

  const analyze = () => {
    setResult(parseAndMapMailOrder(selectedMail));
    setNotice("");
  };

  const apply = async () => {
    if (!result) return;
    setIsApplying(true);
    const response = await onApply(result);
    setIsApplying(false);
    setNotice(response.message);
    if (response.success) onClose();
  };

  return (
    <ErpDialog
      dataTestId="mail-order-import-dialog"
      footer={
        <div className="mail-order-import__actions">
          <button data-testid="mail-import-analyze" onClick={analyze} type="button">메일 분석</button>
          <button
            className="mail-order-import__apply"
            data-testid="mail-import-apply"
            disabled={!result?.canApply || isApplying}
            onClick={apply}
            type="button"
          >
            수주등록 반영
          </button>
          <button data-testid="mail-import-cancel" onClick={onClose} type="button">취소</button>
        </div>
      }
      height={690}
      onClose={onClose}
      open={open}
      title="메일 수주 불러오기"
      width={1180}
    >
      <div className="mail-order-import">
        <aside className="mail-order-import__mail-list" aria-label="샘플 메일 목록">
          <h3>샘플 메일</h3>
          {mockEmails.map((mail) => {
            const applied = appliedMailIds.includes(mail.MAIL_ID);
            return (
              <button
                className={`mail-order-import__mail${mail.MAIL_ID === selectedMailId ? " is-selected" : ""}`}
                data-testid={`mail-import-mail-${mail.MAIL_ID}`}
                key={mail.MAIL_ID}
                onClick={() => selectMail(mail.MAIL_ID)}
                type="button"
              >
                <strong>{mail.SUBJECT}</strong>
                <span>{mail.FROM_NAME} · {mail.RECEIVED_AT}</span>
                <em>{applied ? "반영완료" : result?.mail.MAIL_ID === mail.MAIL_ID ? result.status : mail.PARSE_STATUS}</em>
              </button>
            );
          })}
        </aside>

        <section className="mail-order-import__detail">
          <div className="mail-order-import__mail-body">
            <h3>메일 본문</h3>
            <p data-testid="mail-import-mail-meta">{selectedMail.FROM_ADDRESS} · {selectedMail.RECEIVED_AT}</p>
            <pre data-testid="mail-import-body">{selectedMail.BODY_TEXT}</pre>
          </div>

          {result && (
            <div className="mail-order-import__preview" data-testid="mail-import-preview">
              <div className="mail-order-import__result-heading">
                <strong data-testid="mail-import-result-status">분석 결과: {result.status}</strong>
                <span data-testid="mail-import-can-apply">{result.canApply ? "반영 가능" : "반영 불가"}</span>
                <span data-testid="mail-import-review-status">{result.requiresReview ? "담당자 확인 필요" : "자동 확인 가능"}</span>
              </div>
              <h3>수주정보 미리보기</h3>
              <div className="mail-order-import__fields" data-testid="mail-import-header-preview">
                {([
                  ["회사", result.header.CD_FIRM], ["수주일자", result.header.DT_SO],
                  ["거래처코드", result.header.CD_PARTNER], ["거래처명", result.header.NM_PARTNER],
                  ["메일 ID", result.header.MAIL_ID]
                ] as const).map(([label, parsed]) => (
                  <span key={label}>{label}: <b data-status={parsed.status}>{displayValue(parsed.value)}</b></span>
                ))}
              </div>
              <h3>수주상세 미리보기</h3>
              <table className="mail-order-import__line-table">
                <thead><tr><th>행</th><th>품목코드</th><th>품목명</th><th>수량</th><th>단가</th><th>납기일자</th></tr></thead>
                <tbody>
                  {result.lines.map((line) => (
                    <tr data-testid={`mail-import-preview-line-${line.NO_LINE}`} key={line.NO_LINE}>
                      <td>{line.NO_LINE}</td>
                      <td data-status={line.CD_ITEM.status}>{displayValue(line.CD_ITEM.value)}</td>
                      <td data-status={line.NM_ITEM.status}>{displayValue(line.NM_ITEM.value)}</td>
                      <td data-status={line.QT_SO.status} data-testid={`mail-import-quantity-${line.NO_LINE}`}>{displayValue(line.QT_SO.value)}</td>
                      <td data-status={line.UM_SO.status}>{displayValue(line.UM_SO.value)}</td>
                      <td data-status={line.DT_DLV.status}>{displayValue(line.DT_DLV.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mail-order-import__messages">
                {result.warnings.map((warning) => <p data-testid="mail-import-warning" key={warning}>경고: {warning}</p>)}
                {result.errors.map((error) => <p className="is-error" data-testid="mail-import-error" key={error}>오류: {error}</p>)}
              </div>
            </div>
          )}
          {notice && <p className="mail-order-import__notice" data-testid="mail-import-notice">{notice}</p>}
        </section>
      </div>
    </ErpDialog>
  );
}
