import { useEffect, useRef, useState } from "react";
import { Download, FileCheck2 } from "lucide-react";
import { createReviewRecord, emptyReviewDraft, reviewAnalysisFingerprint, reviewChecklistDefinitions, reviewDraftFromRecord, reviewerRoleLabels, reviewStatusLabels, validateReviewDraft, type ReviewDraft } from "./reviewPackage";
import { reviewerRoles, reviewStatuses, type ReviewChecklistKey, type ReviewRecord, type SolutionSession } from "./solutionTypes";

interface ReviewRecordPanelProps {
  session: SolutionSession;
  unresolved: readonly string[];
  review?: ReviewRecord;
  onRecord: (record: ReviewRecord) => void;
  onDownload: (record: ReviewRecord) => void;
}

function updateChecklist(draft: ReviewDraft, key: ReviewChecklistKey, checked: boolean): ReviewDraft {
  return { ...draft, checklist: { ...draft.checklist, [key]: checked } };
}

export function ReviewRecordPanel({ session, unresolved, review, onRecord, onDownload }: ReviewRecordPanelProps) {
  const [draft, setDraft] = useState<ReviewDraft>(() => review ? reviewDraftFromRecord(review) : emptyReviewDraft());
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const firstWins = useRef(false);
  const changedAfterReview = Boolean(review && review.analysisFingerprint !== reviewAnalysisFingerprint(session));

  useEffect(() => {
    setDraft(review ? reviewDraftFromRecord(review) : emptyReviewDraft());
    setError("");
  }, [session.originalRequest, review?.caseId, review?.updatedAt]);

  const save = () => {
    if (firstWins.current) return;
    const validationError = validateReviewDraft(draft);
    if (validationError) { setError(validationError); return; }
    firstWins.current = true;
    setRecording(true); setError("");
    try { onRecord(createReviewRecord(session, unresolved, draft, review)); }
    finally { firstWins.current = false; setRecording(false); }
  };

  const groups: readonly { id: "consultant" | "developer" | "field"; title: string }[] = [
    { id: "consultant", title: "컨설턴트 확인" },
    { id: "developer", title: "개발 담당자 확인" },
    { id: "field", title: "현장 확인" }
  ];

  return <section className="ai-solution-center__review-panel" data-testid="review-record-panel" aria-busy={recording} aria-labelledby="review-record-heading">
    <div><h3 id="review-record-heading">솔루션 검토 및 판단</h3><p>검토 상태는 실제 적용 완료·승인·전자결재를 뜻하지 않습니다.</p></div>
    {changedAfterReview && <p className="ai-solution-center__limit-notice" data-testid="review-analysis-changed" role="status">검토 시점 이후 분석 결과가 변경되었습니다. 변경된 결과를 검토하려면 상태를 다시 기록해 주세요.</p>}
    <div className="ai-solution-center__review-fields">
      <label>케이스 제목 <input data-testid="review-case-title" value={draft.caseTitle} maxLength={150} onChange={(event) => setDraft((current) => ({ ...current, caseTitle: event.target.value }))} placeholder="비워 두면 분석 유형·업무영역·생성일로 자동 제목을 사용합니다." /></label>
      <label>검토 상태 <select data-testid="review-status" value={draft.reviewStatus} onChange={(event) => { setDraft((current) => ({ ...current, reviewStatus: event.target.value as ReviewDraft["reviewStatus"] })); setError(""); }}>{reviewStatuses.map((status) => <option key={status} value={status}>{reviewStatusLabels[status]}</option>)}</select></label>
      <label>검토자 역할 <select data-testid="reviewer-role" value={draft.reviewerRole} aria-invalid={Boolean(error) && draft.reviewStatus === "APPLY" && !draft.reviewerRole} onChange={(event) => { setDraft((current) => ({ ...current, reviewerRole: event.target.value as ReviewDraft["reviewerRole"] })); setError(""); }}><option value="">선택 안 함</option>{reviewerRoles.map((role) => <option key={role} value={role}>{reviewerRoleLabels[role]}</option>)}</select></label>
      <label>검토자 표시명 (선택) <input data-testid="reviewer-display-name" value={draft.reviewerDisplayName} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, reviewerDisplayName: event.target.value }))} /></label>
      <label>컨설턴트 검토 의견 <textarea data-testid="consultant-review" value={draft.consultantReview} maxLength={2000} rows={3} onChange={(event) => setDraft((current) => ({ ...current, consultantReview: event.target.value }))} /></label>
      <label>개발 담당자 검토 의견 <textarea data-testid="developer-review" value={draft.developerReview} maxLength={2000} rows={3} onChange={(event) => setDraft((current) => ({ ...current, developerReview: event.target.value }))} /></label>
      <label>현장 확인 의견 <textarea data-testid="field-review" value={draft.fieldReview} maxLength={2000} rows={3} onChange={(event) => setDraft((current) => ({ ...current, fieldReview: event.target.value }))} /></label>
      <label>보류·반려·업무결정 필요 사유 <textarea data-testid="review-decision-reason" value={draft.decisionReason} aria-invalid={Boolean(error) && ["HOLD", "REJECT", "NEEDS_BUSINESS_DECISION"].includes(draft.reviewStatus) && !draft.decisionReason.trim()} maxLength={2000} rows={3} onChange={(event) => { setDraft((current) => ({ ...current, decisionReason: event.target.value })); setError(""); }} /></label>
    </div>
    <div className="ai-solution-center__review-checklists">{groups.map((group) => <fieldset key={group.id}><legend>{group.title}</legend>{reviewChecklistDefinitions.filter((item) => item.group === group.id).map((item) => <label key={item.key}><input type="checkbox" data-testid={`review-check-${item.key}`} checked={draft.checklist[item.key]} onChange={(event) => { setDraft((current) => updateChecklist(current, item.key, event.target.checked)); setError(""); }} />{item.label}</label>)}</fieldset>)}</div>
    {error && <p className="ai-solution-center__error" data-testid="review-error" role="alert" aria-live="assertive">{error}</p>}
    <div className="ai-solution-center__review-actions"><button className="ai-solution-center__primary-button" data-testid="review-record-save" type="button" disabled={recording} onClick={save}><FileCheck2 size={15} />{recording ? "검토 상태 기록 중..." : review ? "현재 분석 결과 기준으로 다시 기록" : "검토 상태 기록"}</button>{review && <button data-testid="review-package-download" type="button" onClick={() => onDownload(review)}><Download size={15} />분석 결과 다운로드</button>}</div>
    {review && <section className="ai-solution-center__review-summary" data-testid="review-summary"><h4>현재 검토 기록</h4><dl><div><dt>케이스</dt><dd>{review.caseTitle}</dd></div><div><dt>상태</dt><dd>{reviewStatusLabels[review.reviewStatus]}</dd></div><div><dt>추천 1순위</dt><dd>{review.recommendedOption}</dd></div><div><dt>기록 시각</dt><dd>{review.updatedAt}</dd></div></dl></section>}
  </section>;
}
