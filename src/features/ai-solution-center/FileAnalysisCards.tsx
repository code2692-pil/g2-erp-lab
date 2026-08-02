import { FileCheck2, ShieldAlert, Trash2 } from "lucide-react";
import { sensitiveCategoryLabels, sensitiveRiskLevel } from "./file-analysis/sensitiveDataRedactor";
import type { FileAnalysisAttachment, FileProcessingStatus, FileProcessingSummary, FileSupportLevel, SensitiveFinding } from "./file-analysis/fileAnalysisTypes";

export const fileSupportLevelLabels: Readonly<Record<FileSupportLevel, string>> = {
  CONTENT_SUPPORTED: "자동 텍스트 추출 가능",
  STRUCTURE_SUPPORTED: "구조 분석 지원",
  METADATA_ONLY: "메타정보만 지원",
  REQUIRES_DESCRIPTION: "사용자 설명 필요",
  BLOCKED: "보안상 차단"
};

const processingStatusLabels: Readonly<Record<FileProcessingStatus, string>> = {
  ATTACHED: "첨부됨",
  PROCESSING: "파일 처리 중",
  READY: "분석 준비 완료",
  READY_WITH_WARNING: "경고와 함께 준비 완료",
  REQUIRES_DESCRIPTION: "설명 필요",
  EXCLUDED: "분석 제외",
  ERROR: "처리 오류"
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function findingsFor(attachment: FileAnalysisAttachment) {
  return attachment.sensitiveFindings;
}

export function SensitiveDataNotice({ findings, dataTestId = "sensitive-data-notice" }: { findings: readonly SensitiveFinding[]; dataTestId?: string }) {
  const risk = sensitiveRiskLevel(findings);
  const labels = { NONE: "감지 없음", REVIEW_RECOMMENDED: "확인 권장", REVIEW_REQUIRED: "공유 전 필수 확인" } as const;
  return <section className={`ai-solution-center__sensitive-notice risk-${risk.toLocaleLowerCase()}`} data-testid={dataTestId} aria-live="polite">
    <div><ShieldAlert size={17} /><strong>민감정보 기초 탐지: {labels[risk]}</strong></div>
    <p>기초 패턴 탐지이며 모든 개인정보·기밀정보를 완전히 찾거나 제거한다고 보장하지 않습니다. 실제 공유 전 담당자가 직접 검토해야 합니다.</p>
    {findings.length > 0 && <ul>{findings.map((finding) => <li key={finding.category}>{sensitiveCategoryLabels[finding.category]} · {finding.count}건 · 자동 가림 적용 · {finding.confidence === "HIGH_PATTERN" ? "높은 우선 확인" : "오탐 가능성 확인"}</li>)}</ul>}
  </section>;
}

export interface FileAnalysisCardsProps {
  attachments: readonly FileAnalysisAttachment[];
  error: string;
  processing: boolean;
  onNoteChange: (fileId: string, note: string) => void;
  onIncludeChange: (fileId: string, include: boolean) => void;
  onRemove: (fileId: string) => void;
}

export function FileAnalysisCards({ attachments, error, processing, onNoteChange, onIncludeChange, onRemove }: FileAnalysisCardsProps) {
  if (attachments.length === 0) return <p className="ai-solution-center__file-status" data-testid="ai-file-status" aria-live="polite">파일을 선택하면 지원 형식과 분석 상태를 안내합니다.</p>;
  return <>
    <p className="ai-solution-center__file-status" data-testid="ai-file-status" aria-live="polite">첨부 파일 {attachments.length}건 · 외부 전송 0건 · {processing ? "파일 처리 중" : "파일 처리 완료"}</p>
    {error && <p className="ai-solution-center__error" data-testid="ai-file-error" role="alert">{error}</p>}
    <ul className="ai-solution-center__file-list ai-solution-center__analysis-files" data-testid="ai-file-list">{attachments.map((attachment) => {
      const blocked = attachment.supportLevel === "BLOCKED";
      const noteRequired = attachment.requiresUserDescription;
      const canInclude = !blocked && attachment.processingStatus !== "ERROR" && (!noteRequired || attachment.note.trim().length > 0);
      return <li key={attachment.fileId} data-testid={`file-analysis-${attachment.fileId}`}>
        <div className="ai-solution-center__file-analysis-content">
          <div className="ai-solution-center__file-analysis-heading"><div><strong>{attachment.fileName}</strong><span>{attachment.category} · {formatBytes(attachment.fileSize)} · {fileSupportLevelLabels[attachment.supportLevel]} · {processingStatusLabels[attachment.processingStatus]}</span></div><FileCheck2 size={18} /></div>
          <p data-testid={`file-summary-${attachment.fileId}`}>{attachment.summary}</p>
          <p className="ai-solution-center__file-structure" data-testid={`file-structure-${attachment.fileId}`}>{attachment.structureSummary}</p>
          {attachment.category === "IMAGE" && <p>이미지 메타정보만 확인했습니다. OCR이나 장면 분석은 지원하지 않습니다.</p>}
          {(attachment.category === "AUDIO" || attachment.category === "VIDEO") && <p>재생 시간과 파일 정보만 확인합니다. 내용 자동 추출, 음성 전사, 영상 장면 분석은 지원하지 않습니다.</p>}
          {blocked ? <p className="ai-solution-center__blocked-file" data-testid={`file-blocked-${attachment.fileId}`}>보안상 실행 가능한 파일은 분석에 사용할 수 없습니다.</p> : <>
            <label className="ai-solution-center__file-include"><input type="checkbox" data-testid={`file-include-${attachment.fileId}`} checked={attachment.includeInAnalysis} disabled={!canInclude} onChange={(event) => onIncludeChange(attachment.fileId, event.target.checked)} />분석에 포함</label>
            <label className="ai-solution-center__file-note-label" htmlFor={`file-note-${attachment.fileId}`}>파일별 주요 내용·의사결정<textarea id={`file-note-${attachment.fileId}`} data-testid={`file-note-${attachment.fileId}`} value={attachment.note} maxLength={2_000} onChange={(event) => onNoteChange(attachment.fileId, event.target.value)} rows={3} /></label>
            <span className="ai-solution-center__file-note-count">{attachment.note.length.toLocaleString()} / 2,000자</span>
          </>}
          {attachment.warnings.length > 0 && <ul className="ai-solution-center__file-warnings">{attachment.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          {findingsFor(attachment).length > 0 && <SensitiveDataNotice findings={findingsFor(attachment)} dataTestId={`file-sensitive-${attachment.fileId}`} />}
        </div>
        <button type="button" aria-label={`${attachment.fileName} 제거`} onClick={() => onRemove(attachment.fileId)}><Trash2 size={15} />제거</button>
      </li>;
    })}</ul>
  </>;
}

export function FileProcessingResult({ files, selectedScenarioTitle }: { files: readonly FileProcessingSummary[]; selectedScenarioTitle?: string }) {
  if (files.length === 0 && !selectedScenarioTitle) return null;
  return <section className="ai-solution-center__file-processing-result" data-testid="file-processing-result">
    <h3>첨부 파일 처리 결과</h3>
    {selectedScenarioTitle && <p data-testid="result-selected-scenario">선택한 ERP·MES 업무 예시: <strong>{selectedScenarioTitle}</strong></p>}
    {files.length > 0 && <ul>{files.map((file) => <li key={file.fileId} data-testid={`result-file-${file.fileId}`}>
      <div><strong>{file.displayName}</strong><span>{file.category} · {fileSupportLevelLabels[file.supportLevel]} · {processingStatusLabels[file.processingStatus]}</span></div>
      <p>{file.structureSummary}</p>
      <p>분석 {file.includeInAnalysis ? "포함" : "제외"} · 사용자 메모 {file.userDescriptionUsed ? "사용" : "미사용"} · 민감정보 {file.sensitiveFindingCount > 0 ? `${file.sensitiveFindingCount}건 자동 가림` : "감지 없음"}</p>
      {file.warnings.length > 0 && <p className="ai-solution-center__file-result-warning">{file.warnings.join(" / ")}</p>}
    </li>)}</ul>}
    <p className="ai-solution-center__scenario-notice">구조화 파일 요약은 컨설턴트 검토를 위한 보조정보이며, 자동으로 회사 업무 규칙을 확정하지 않습니다.</p>
  </section>;
}
