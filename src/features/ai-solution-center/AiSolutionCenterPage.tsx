import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronRight, ClipboardCopy, Download, FileText, RotateCcw, Trash2 } from "lucide-react";
import { CompanyKnowledgeSettings } from "./CompanyKnowledgeSettings";
import { buildSolutionResult } from "./solutionEngine";
import { solutionKnowledge } from "./solutionKnowledge";
import { buildSolutionOptionComparison, defaultSolutionPriorities, solutionPriorityLabels, solutionPriorityPresets } from "./solutionOptions";
import { activeRevision, analysisRevision, appendSolutionRevision, buildConsultantHandoverMarkdown, buildExportFilename, buildSolutionMarkdown, canRefineSession, clarificationAnswersFor, consultantHandoverDetails, createSolutionSession, maximumAnalysisRevision, unresolvedItems, updateSolutionOptionComparison } from "./solutionSession";
import { businessDomains, solutionPriorityKeys, type BusinessDomain, type CompanyKnowledgeArticle, type SolutionPriorities, type SolutionRequest, type SolutionSession, type SolutionSource } from "./solutionTypes";

type NavigationPage = "sales" | "purchase" | "work" | "development" | "ai";
type ActiveTab = "consultant" | "customer";
type FileStatus = "text-ready" | "empty-text" | "oversize" | "unsupported" | "read-error";

interface FileAttachment {
  id: string;
  name: string;
  extension: string;
  size: number;
  status: FileStatus;
  text?: string;
  note: string;
}

interface AiSolutionCenterPageProps {
  onNavigate: (page: NavigationPage) => void;
}

interface ResultPanelProps {
  session: SolutionSession;
  answerMap: Readonly<Record<string, string>>;
  answerError: string;
  refining: boolean;
  exportStatus: string;
  handoverStatus: string;
  comparisonStatus: string;
  comparing: boolean;
  onAnswerChange: (questionId: string, answer: string) => void;
  onRefine: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onHandoverCopy: () => void;
  onRecompare: () => void;
}

const automaticTextLimit = 512 * 1024;
const fileNoteLimit = 2_000;
const supportedExtensions = new Set(["txt", "md", "csv", "json", "xml", "log"]);

function extensionOf(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "없음";
}

function isTextFile(file: File, extension: string) {
  return supportedExtensions.has(extension) || file.type.startsWith("text/");
}

function formatBytes(size: number) {
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
}

function fileStatusMessage(status: FileStatus) {
  switch (status) {
    case "text-ready": return "자동 텍스트 추출 가능";
    case "empty-text": return "읽을 수 있는 텍스트 내용이 없습니다.";
    case "oversize": return "자동 텍스트 읽기 제한(512KB)을 초과했습니다. 상황 설명이나 파일별 메모를 입력해 주세요.";
    case "unsupported": return "자동 추출 미지원";
    default: return "텍스트를 읽지 못했습니다. 상황 설명이나 파일별 메모를 입력해 주세요.";
  }
}

function List({ items, dataTestId }: { items: readonly string[]; dataTestId?: string }) {
  return <ul data-testid={dataTestId}>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function PriorityCard({ priorities, onChange, onPreset }: { priorities: SolutionPriorities; onChange: (key: keyof SolutionPriorities, value: number) => void; onPreset: (priorities: SolutionPriorities) => void }) {
  return <section className="ai-solution-center__priority-card" data-testid="priority-card" aria-labelledby="priority-card-heading">
    <div><h2 id="priority-card-heading">솔루션 선택 우선순위</h2><p>중요하게 생각하는 기준에 따라 추천 대안의 순서와 적용 방향이 달라집니다. 1은 중요도가 낮고 5는 매우 중요합니다.</p></div>
    <div className="ai-solution-center__priority-presets" aria-label="우선순위 미리 설정">{solutionPriorityPresets.map((preset) => <button key={preset.id} type="button" data-testid={`priority-preset-${preset.id}`} onClick={() => onPreset({ ...preset.priorities })}>{preset.label}</button>)}</div>
    <div className="ai-solution-center__priority-fields">{solutionPriorityKeys.map((key) => <label key={key} htmlFor={`priority-${key}`}><span>{solutionPriorityLabels[key]} <strong data-testid={`priority-value-${key}`}>{priorities[key]} / 5</strong></span><input id={`priority-${key}`} data-testid={`priority-${key}`} type="range" min="1" max="5" step="1" value={priorities[key]} aria-valuetext={`${solutionPriorityLabels[key]} ${priorities[key]} / 5`} onChange={(event) => onChange(key, Number(event.target.value))} /></label>)}</div>
  </section>;
}

function ResultPanel({ session, answerMap, answerError, refining, exportStatus, handoverStatus, comparisonStatus, comparing, onAnswerChange, onRefine, onCopy, onDownload, onHandoverCopy, onRecompare }: ResultPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revision = activeRevision(session);
  const result = session.activeResult;
  const unresolved = unresolvedItems(result, answerMap);
  const canRefine = canRefineSession(session);
  const handover = consultantHandoverDetails(session, unresolved);
  const comparison = session.optionComparison;
  const recommendedOption = comparison?.options[0];

  useEffect(() => { headingRef.current?.focus(); }, [revision?.revision]);

  return <section className="ai-solution-center__result" data-testid="ai-result" aria-live="polite">
    <div className="ai-solution-center__result-heading-row">
      <div>
        <h2 ref={headingRef} tabIndex={-1} data-testid="ai-result-heading">{revision?.revision ?? 1}차 분석 결과</h2>
        <p className="ai-solution-center__revision-status" data-testid="analysis-revision-status">현재 분석 차수: {revision?.revision ?? 1} / {maximumAnalysisRevision}</p>
      </div>
      <div className="ai-solution-center__export-actions">
        <button data-testid="result-copy" type="button" onClick={onCopy}><ClipboardCopy size={15} />결과 복사</button>
        <button data-testid="result-download" type="button" onClick={onDownload}><Download size={15} />Markdown 다운로드</button>
      </div>
    </div>
    {exportStatus && <p className="ai-solution-center__file-status" data-testid="result-export-status" role="status" aria-live="polite">{exportStatus}</p>}
    <p className="ai-solution-center__guide-notice">{result.guideNotice}</p>
    {revision && revision.revision > 1 && <section className="ai-solution-center__revision-summary" data-testid="revision-summary"><h3>{revision.revision}차 분석에 추가로 반영한 정보</h3><List items={revision.clarificationAnswers.map((answer) => `${answer.question}: ${answer.answer}`)} /><p>신뢰도: {revision.previousConfidence} → {revision.currentConfidence}</p></section>}
    <dl className="ai-solution-center__result-summary">
      <div><dt>입력 요약</dt><dd>{result.inputSummary}</dd></div>
      <div><dt>추정 업무영역</dt><dd data-testid="ai-result-domain">{result.inferredDomain}</dd></div>
      <div><dt>주요 문제</dt><dd>{result.mainProblem}</dd></div>
      <div><dt>신뢰도</dt><dd data-testid="ai-result-confidence">{result.confidence}</dd></div>
    </dl>
    <section className="ai-solution-center__recommendation-baseline"><h3 data-testid="ai-result-recommendation">{recommendedOption?.title ?? result.recommendation.title}</h3><p>{recommendedOption?.summary ?? result.recommendation.rationale}</p><List items={recommendedOption?.prerequisites ?? result.recommendation.actions} /></section>
    {comparison && recommendedOption && <section className="ai-solution-center__option-comparison" data-testid="option-comparison" aria-busy={comparing}>
      <div className="ai-solution-center__option-comparison-heading"><div><h3>솔루션 대안 비교</h3><p>현재 입력과 선택한 우선순위를 기준으로 한 추천 1순위입니다. 실제 적용은 컨설턴트·개발 담당자와 회사 업무 규칙·기술 조건을 확인해 결정해야 합니다.</p></div><button type="button" data-testid="recompare-options" disabled={comparing} onClick={onRecompare}>{comparing ? "다시 비교 중..." : "현재 우선순위로 다시 비교"}</button></div>
      {comparisonStatus && <p className="ai-solution-center__file-status" data-testid="comparison-status" role="status" aria-live="polite">{comparisonStatus}</p>}
      <p className="ai-solution-center__guide-notice" data-testid="comparison-score-notice">{comparison.scoreNotice}</p>
      <p className="ai-solution-center__option-reason" data-testid="comparison-reason">{comparison.recommendationReason}</p>
      <div className="ai-solution-center__option-grid">{comparison.options.map((option) => <article key={option.id} className="ai-solution-center__option-card" data-testid={`option-${option.id}`}><div className="ai-solution-center__option-card-heading"><p>{option.rank}순위 · 비교 점수 {option.weightedScore}</p>{option.recommended && <strong data-testid={`option-recommended-${option.id}`}>추천 1순위</strong>}</div><h4>{option.title}</h4><p>{option.summary}</p><dl><div><dt>강점</dt><dd>{option.strengths.join(" / ")}</dd></div><div><dt>유의점</dt><dd>{option.weaknesses.join(" / ")}</dd></div><div><dt>적합한 상황</dt><dd>{option.suitableWhen.join(" / ")}</dd></div><div><dt>부적합한 상황</dt><dd>{option.unsuitableWhen.join(" / ")}</dd></div><div><dt>적용 전제</dt><dd>{option.prerequisites.join(" / ")}</dd></div><div><dt>위험·주의사항</dt><dd>{option.risks.join(" / ")}</dd></div></dl><ul className="ai-solution-center__dimension-scores">{solutionPriorityKeys.map((key) => <li key={key}>{solutionPriorityLabels[key]}: {option.dimensionScores[key]} / 5</li>)}</ul></article>)}</div>
      <section className="ai-solution-center__option-roadmap" data-testid="option-roadmap"><h3>적용 로드맵 · {recommendedOption.title}</h3>{recommendedOption.roadmap.map((phase) => <article key={phase.title}><h4>{phase.title}</h4><List items={phase.steps} /></article>)}</section>
      <section className="ai-solution-center__reconsideration" data-testid="option-reconsideration"><h3>적용 중 재검토가 필요한 조건</h3><p>아래 항목은 자동 실패 판정이나 확정 업무 규칙이 아니라, 담당자의 재검토를 돕는 체크 항목입니다.</p><List items={recommendedOption.reconsiderationConditions.slice(0, 5)} /></section>
    </section>}
    <section><h3>분석에서 참고한 적용 방법</h3><List dataTestId="ai-result-phased-plan" items={result.phasedPlan} /></section>
    <section className="ai-solution-center__input-evidence" data-testid="input-evidence"><h3>분석에 사용한 입력 근거</h3><ul>{result.inputEvidence.map((evidence) => <li key={evidence.id} data-testid={`input-evidence-${evidence.id}`}><strong>{evidence.sourceLabel}</strong><span>{evidence.fileName ? `파일: ${evidence.fileName}` : "입력 구역"}</span><p>발췌: {evidence.excerpt}</p><p>관련 키워드: {evidence.relatedKeywords.length > 0 ? evidence.relatedKeywords.join(", ") : "업무영역 기준"}</p><p>추천 반영: {evidence.usedInRecommendation ? "사용됨" : "참고"}</p></li>)}</ul></section>
    <section className="ai-solution-center__evidence" data-testid="ai-result-evidence"><h3>참고한 지식 근거</h3><ul>{result.evidence.map((evidence) => <li key={evidence.id} data-testid={`ai-evidence-${evidence.id}`}><strong>{evidence.title}</strong><span>{evidence.category} · {evidence.sourceType === "COMPANY" ? "회사 지식" : "일반 지식"}</span><p>일치 주요 키워드: {evidence.matchedKeywords.length > 0 ? evidence.matchedKeywords.join(", ") : "업무영역 기준"}</p><p>{evidence.reason} (신뢰 가중치 {evidence.confidenceWeight.toFixed(2)})</p></li>)}</ul>{result.companyKnowledgeUsed && <p className="ai-solution-center__company-reference" data-testid="company-knowledge-reference">회사 지식도 실제 업무 적용 전 해당 컨설턴트와 개발자의 검토가 필요합니다.</p>}</section>
    <section className="ai-solution-center__unresolved" data-testid="unresolved-items"><h3>아직 확인이 필요한 사항</h3>{unresolved.length > 0 ? <List items={unresolved} /> : <p>현재 입력 범위에서 주요 확인사항은 충분히 답변되었습니다. 실제 적용 전 최종 검토는 필요합니다.</p>}</section>
    <section className="ai-solution-center__external-review"><h3>외부·사내 검토 항목</h3><p data-testid="ai-result-external-review">회사 업무 및 보안 검토 필요</p></section>
    <section data-testid="ai-result-questions"><h3>컨설턴트·개발 담당자 확인 질문</h3>{result.clarifyingQuestions.length > 0 ? <div className="ai-solution-center__question-columns"><div><h4>컨설턴트 확인</h4><List items={result.consultantQuestions} /></div><div><h4>개발 담당자 확인</h4><List items={result.developmentQuestions} /></div></div> : <p>입력 정보가 비교적 구체적입니다. 적용 전에도 회사의 기준과 보안 조건을 확인해 주세요.</p>}</section>
    <section className="ai-solution-center__handover" data-testid="consultant-handover"><div className="ai-solution-center__handover-heading"><div><h3>컨설턴트 인계 요약</h3><p>현재 입력과 추천 결과를 검토용 Markdown으로 정리한 PoC 요약입니다.</p></div><button data-testid="handover-copy" type="button" onClick={onHandoverCopy}><ClipboardCopy size={15} />컨설턴트 인계 요약 복사</button></div>{handoverStatus && <p className="ai-solution-center__file-status" data-testid="handover-copy-status" role="status" aria-live="polite">{handoverStatus}</p>}<dl>{handover.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
    {result.clarifyingQuestions.length > 0 && canRefine && <section className="ai-solution-center__followup" data-testid="followup-panel" aria-busy={refining}><h3>추가 정보로 추천 보완</h3><p>아래 질문에 답변하면 현재 입력과 함께 다시 분석하여 추천 내용을 보완합니다.</p>{result.clarifyingQuestions.map((question, index) => <label key={question.id} className="ai-solution-center__followup-question"><span><strong>질문 {index + 1}. {question.question}</strong><em>{question.required ? "필수" : "선택"} · {question.audience} · {question.purpose}</em></span><textarea data-testid={`followup-answer-${question.id}`} value={answerMap[question.id] ?? ""} aria-invalid={Boolean(answerError)} onChange={(event) => onAnswerChange(question.id, event.target.value)} maxLength={1000} rows={3} /></label>)}{answerError && <p className="ai-solution-center__error" data-testid="followup-error" role="alert" aria-live="assertive">{answerError}</p>}<button className="ai-solution-center__primary-button" data-testid="followup-refine" type="button" disabled={refining} onClick={onRefine}>{refining ? "보완 분석 중..." : "답변 반영 후 추천 보완"}</button></section>}
    {analysisRevision(session) >= maximumAnalysisRevision && <p className="ai-solution-center__limit-notice" data-testid="analysis-limit-notice">현재 PoC에서는 최대 3차 분석까지만 지원합니다. 추가 검토는 해당 컨설턴트에게 전달해 주세요.</p>}
  </section>;
}

export function AiSolutionCenterPage({ onNavigate }: AiSolutionCenterPageProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("consultant");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [domain, setDomain] = useState<BusinessDomain>("");
  const [situation, setSituation] = useState("");
  const [consultantError, setConsultantError] = useState("");
  const [consultantProcessing, setConsultantProcessing] = useState(false);
  const [consultantSession, setConsultantSession] = useState<SolutionSession>();
  const [consultantAnswers, setConsultantAnswers] = useState<Record<string, string>>({});
  const [consultantFollowupError, setConsultantFollowupError] = useState("");
  const [consultantRefining, setConsultantRefining] = useState(false);
  const [companyKnowledge, setCompanyKnowledge] = useState<readonly CompanyKnowledgeArticle[]>([]);
  const [inquiry, setInquiry] = useState("");
  const [currentManagement, setCurrentManagement] = useState("");
  const [desiredStandard, setDesiredStandard] = useState("");
  const [fieldConstraints, setFieldConstraints] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [customerProcessing, setCustomerProcessing] = useState(false);
  const [customerSession, setCustomerSession] = useState<SolutionSession>();
  const [customerAnswers, setCustomerAnswers] = useState<Record<string, string>>({});
  const [customerFollowupError, setCustomerFollowupError] = useState("");
  const [customerRefining, setCustomerRefining] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [handoverStatus, setHandoverStatus] = useState("");
  const [priorities, setPriorities] = useState<SolutionPriorities>({ ...defaultSolutionPriorities });
  const [comparisonStatus, setComparisonStatus] = useState("");
  const [comparing, setComparing] = useState(false);
  const comparisonLock = useRef(false);

  const hasExtractedText = useMemo(() => attachments.some((attachment) => Boolean(attachment.text?.trim())), [attachments]);
  const hasFileNote = useMemo(() => attachments.some((attachment) => attachment.note.trim().length > 0), [attachments]);
  const canAnalyzeFiles = hasExtractedText || hasFileNote || situation.trim().length > 0;

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const prepared = await Promise.all(files.map(async (file, index): Promise<FileAttachment> => {
      const extension = extensionOf(file.name);
      const base = { id: `${file.name}-${file.size}-${Date.now()}-${index}`, name: file.name, extension, size: file.size, note: "" };
      if (!isTextFile(file, extension)) return { ...base, status: "unsupported" };
      if (file.size > automaticTextLimit) return { ...base, status: "oversize" };
      try {
        const text = await file.text();
        return { ...base, status: text.trim().length > 0 ? "text-ready" : "empty-text", text };
      } catch {
        return { ...base, status: "read-error" };
      }
    }));
    setAttachments((current) => [...current, ...prepared]);
  };

  const updateAttachmentNote = (attachmentId: string, note: string) => setAttachments((current) => current.map((attachment) => attachment.id === attachmentId ? { ...attachment, note } : attachment));
  const consultantRequest = (): SolutionRequest => ({ source: "consultant-file", domain, situation, fileInputs: attachments.map((attachment, index) => ({ id: `file-${index + 1}`, fileName: attachment.name, extractedText: attachment.text, note: attachment.note, attachmentOrder: index })) });

  const analyzeConsultant = () => {
    if (consultantProcessing) return;
    if (!canAnalyzeFiles) { setConsultantError("분석할 수 있는 텍스트 내용이나 상황 설명을 입력해 주세요."); return; }
    setConsultantProcessing(true); setConsultantError(""); setExportStatus(""); setHandoverStatus("");
    try {
      const request = consultantRequest();
      const result = buildSolutionResult(request, companyKnowledge);
      setConsultantSession(createSolutionSession("consultant-file", request, result, companyKnowledge, undefined, buildSolutionOptionComparison(request, result, priorities)));
      setConsultantAnswers({}); setConsultantFollowupError("");
    } catch { setConsultantError("기본 검토 가이드를 만들지 못했습니다. 입력을 확인한 뒤 다시 시도해 주세요."); } finally { setConsultantProcessing(false); }
  };

  const fillExample = () => {
    setInquiry("자재를 추적성 단위로 관리하고 싶지만 생산부터 모든 공정에서 추적값을 입력하기 어렵습니다. 추적성을 확보하면서 현장 입력 부담을 줄일 수 있는 방법을 검토하고 싶습니다.");
    setCurrentManagement("입고 이후 일부 공정에서만 수기로 LOT 정보를 확인하고 있습니다.");
    setDesiredStandard("문제 발생 시 자재·작업·검사 이력을 확인할 수 있기를 희망합니다.");
    setFieldConstraints("모든 공정에서 별도 입력을 강제하기는 어렵고 현장 입력 시간을 줄여야 합니다.");
    setCustomerError("");
  };

  const guideCustomer = () => {
    if (customerProcessing) return;
    if (inquiry.trim().length < 20) { setCustomerError("현재 상황, 원하는 기준, 현장 제약을 조금 더 설명해 주세요."); return; }
    setCustomerProcessing(true); setCustomerError(""); setExportStatus(""); setHandoverStatus("");
    try {
      const request: SolutionRequest = { source: "customer-qa", domain: "", situation: inquiry, currentManagement, desiredStandard, fieldConstraints };
      const result = buildSolutionResult(request, companyKnowledge);
      setCustomerSession(createSolutionSession("customer-qa", request, result, companyKnowledge, undefined, buildSolutionOptionComparison(request, result, priorities)));
      setCustomerAnswers({}); setCustomerFollowupError("");
    } catch { setCustomerError("기본 검토 가이드를 만들지 못했습니다. 입력을 확인한 뒤 다시 시도해 주세요."); } finally { setCustomerProcessing(false); }
  };

  const validateAnswers = (session: SolutionSession, answerMap: Readonly<Record<string, string>>) => {
    const answers = clarificationAnswersFor(session.activeResult, answerMap);
    if (answers.length === 0) return { error: "추가 질문 중 하나 이상에 답변해 주세요." } as const;
    if (answers.some((answer) => answer.answer.length > 1000)) return { error: "질문별 답변은 최대 1,000자까지 입력할 수 있습니다." } as const;
    if (answers.reduce((length, answer) => length + answer.answer.length, 0) > 3000) return { error: "추가 답변 전체는 최대 3,000자까지 입력할 수 있습니다." } as const;
    return { answers } as const;
  };

  const refine = (mode: SolutionSource) => {
    const session = mode === "consultant-file" ? consultantSession : customerSession;
    const answerMap = mode === "consultant-file" ? consultantAnswers : customerAnswers;
    const setError = mode === "consultant-file" ? setConsultantFollowupError : setCustomerFollowupError;
    const setRefining = mode === "consultant-file" ? setConsultantRefining : setCustomerRefining;
    const setSession = mode === "consultant-file" ? setConsultantSession : setCustomerSession;
    const refining = mode === "consultant-file" ? consultantRefining : customerRefining;
    if (!session || refining || !canRefineSession(session)) return;
    const validation = validateAnswers(session, answerMap);
    if ("error" in validation) { setError(validation.error ?? "추가 답변을 확인해 주세요."); return; }
    setRefining(true); setError(""); setExportStatus(""); setHandoverStatus("");
    try {
      const request: SolutionRequest = { ...session.originalRequest, clarificationAnswers: validation.answers };
      const result = buildSolutionResult(request, session.companyKnowledgeSnapshot);
      setSession(appendSolutionRevision(session, result, validation.answers, undefined, buildSolutionOptionComparison(request, result, priorities)));
    } catch { setError("추천 보완 중 오류가 발생했습니다. 기존 결과와 입력은 유지하고 다시 시도할 수 있습니다."); } finally { setRefining(false); }
  };

  const resetAnalysisSession = () => {
    setAttachments([]); setDomain(""); setSituation(""); setInquiry(""); setCurrentManagement(""); setDesiredStandard(""); setFieldConstraints("");
    setConsultantError(""); setCustomerError(""); setConsultantFollowupError(""); setCustomerFollowupError("");
    setConsultantSession(undefined); setCustomerSession(undefined); setConsultantAnswers({}); setCustomerAnswers({}); setExportStatus(""); setHandoverStatus(""); setActiveTab("consultant");
    setPriorities({ ...defaultSolutionPriorities }); setComparisonStatus("");
  };

  const recompare = (mode: SolutionSource) => {
    const session = mode === "consultant-file" ? consultantSession : customerSession;
    const setSession = mode === "consultant-file" ? setConsultantSession : setCustomerSession;
    if (!session || comparisonLock.current) return;
    comparisonLock.current = true;
    setComparing(true); setComparisonStatus(""); setExportStatus(""); setHandoverStatus("");
    try {
      const request: SolutionRequest = { ...session.originalRequest, clarificationAnswers: activeRevision(session)?.clarificationAnswers ?? [] };
      const comparison = buildSolutionOptionComparison(request, session.activeResult, priorities);
      setSession(updateSolutionOptionComparison(session, comparison));
      setComparisonStatus("비교 기준이 변경되었습니다.");
    } finally {
      comparisonLock.current = false;
      setComparing(false);
    }
  };

  const copyResultMarkdown = async (session: SolutionSession, answerMap: Readonly<Record<string, string>>) => {
    try { await navigator.clipboard.writeText(buildSolutionMarkdown(session, unresolvedItems(session.activeResult, answerMap))); setExportStatus("결과를 클립보드에 복사했습니다."); }
    catch { setExportStatus("클립보드 복사에 실패했습니다. Markdown 다운로드를 사용해 주세요."); }
  };
  const copyHandoverMarkdown = async (session: SolutionSession, answerMap: Readonly<Record<string, string>>) => {
    try { await navigator.clipboard.writeText(buildConsultantHandoverMarkdown(session, unresolvedItems(session.activeResult, answerMap))); setHandoverStatus("컨설턴트 인계 요약을 복사했습니다."); }
    catch { setHandoverStatus("인계 요약 복사에 실패했습니다. 전체 Markdown 다운로드를 사용해 주세요."); }
  };
  const downloadMarkdown = (session: SolutionSession, answerMap: Readonly<Record<string, string>>) => {
    const objectUrl = URL.createObjectURL(new Blob([buildSolutionMarkdown(session, unresolvedItems(session.activeResult, answerMap))], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = objectUrl; link.download = buildExportFilename(session); link.click(); URL.revokeObjectURL(objectUrl); setExportStatus("Markdown 파일 다운로드를 시작했습니다.");
  };

  const consultantBusy = consultantProcessing || consultantRefining;
  const customerBusy = customerProcessing || customerRefining;
  const renderResult = (session: SolutionSession, answerMap: Record<string, string>, answerError: string, refining: boolean, mode: SolutionSource) => <ResultPanel session={session} answerMap={answerMap} answerError={answerError} refining={refining} exportStatus={exportStatus} handoverStatus={handoverStatus} comparisonStatus={comparisonStatus} comparing={comparing} onAnswerChange={(id, answer) => { if (mode === "consultant-file") { setConsultantAnswers((current) => ({ ...current, [id]: answer })); setConsultantFollowupError(""); } else { setCustomerAnswers((current) => ({ ...current, [id]: answer })); setCustomerFollowupError(""); } }} onRefine={() => refine(mode)} onCopy={() => void copyResultMarkdown(session, answerMap)} onDownload={() => downloadMarkdown(session, answerMap)} onHandoverCopy={() => void copyHandoverMarkdown(session, answerMap)} onRecompare={() => recompare(mode)} />;

  return <div className="erp-shell">
    <aside className="side-nav"><div className="brand"><Building2 size={20} /><strong>SMART ERP</strong></div><nav><div className="menu-title">영업관리</div><button className="menu-item" data-testid="nav-sales-order" onClick={() => onNavigate("sales")} type="button">수주등록</button><div className="menu-title">구매관리</div><div className="menu-group"><ChevronRight size={14} /><span>발주관리</span></div><button className="menu-item" data-testid="nav-purchase-order" onClick={() => onNavigate("purchase")} type="button">발주등록</button><div className="menu-title">생산관리</div><div className="menu-group"><ChevronRight size={14} /><span>작업지시관리</span></div><button className="menu-item" data-testid="nav-work-order" onClick={() => onNavigate("work")} type="button">작업지시등록</button><div className="menu-title">AI 도구</div><button className="menu-item active" data-testid="nav-ai-solution-center" type="button">AI 솔루션 센터</button></nav></aside>
    <main className="ai-solution-center" aria-busy={consultantBusy || customerBusy}>
      <header className="page-header"><div><h1 data-testid="ai-solution-center-title">AI 솔루션 센터</h1><p>ERP·MES 업무 상황을 정리하고 검토 가능한 기본 가이드와 추가 확인사항을 제공합니다.</p></div><button className="ai-solution-center__reset-button" data-testid="analysis-session-reset" type="button" onClick={resetAnalysisSession}><RotateCcw size={15} />분석 세션 초기화</button></header>
      <aside className="ai-solution-center__top-note" aria-label="PoC 안내">현재 버전은 로컬 지식 템플릿 기반 PoC입니다.<br />실제 회사 지식과 보안 확인 후 AI를 연결하면 확장할 수 있습니다.</aside>
      <CompanyKnowledgeSettings companyKnowledge={companyKnowledge} generalKnowledgeCount={solutionKnowledge.length} onApply={setCompanyKnowledge} onReset={() => setCompanyKnowledge([])} />
      <PriorityCard priorities={priorities} onChange={(key, value) => { setPriorities((current) => ({ ...current, [key]: value })); setComparisonStatus(""); }} onPreset={(preset) => { setPriorities(preset); setComparisonStatus(""); }} />
      <div className="ai-solution-center__tabs" role="tablist" aria-label="AI 솔루션 방식"><button type="button" role="tab" id="consultant-tab" aria-controls="consultant-panel" aria-selected={activeTab === "consultant"} className={activeTab === "consultant" ? "is-active" : ""} onClick={() => setActiveTab("consultant")}>컨설턴트 파일 분석</button><button type="button" role="tab" id="customer-tab" aria-controls="customer-panel" aria-selected={activeTab === "customer"} className={activeTab === "customer" ? "is-active" : ""} onClick={() => setActiveTab("customer")}>고객 업무 Q&amp;A</button></div>
      {activeTab === "consultant" ? <section id="consultant-panel" role="tabpanel" aria-labelledby="consultant-tab" className="ai-solution-center__panel"><div className="ai-solution-center__form-card"><h2>컨설턴트 파일 분석</h2><label className="ai-solution-center__file-label" htmlFor="ai-file-input"><FileText size={16} />파일 선택 또는 추가<input id="ai-file-input" data-testid="ai-file-input" type="file" multiple onChange={(event) => void handleFiles(event)} /></label><p className="ai-solution-center__muted">선택한 파일은 서버로 업로드하지 않으며 브라우저 메모리에서만 처리합니다.</p>{attachments.length > 0 && <ul className="ai-solution-center__file-list" data-testid="ai-file-list">{attachments.map((attachment) => <li key={attachment.id}><div><strong>{attachment.name}</strong><span>{attachment.extension.toUpperCase()} · {formatBytes(attachment.size)} · {fileStatusMessage(attachment.status)}</span>{attachment.status === "text-ready" ? <p className="ai-solution-center__file-note-guide">자동 추출 내용을 추가 설명이나 파일별 메모와 함께 분석에 반영합니다.</p> : <p>현재 PoC에서는 내용을 자동 추출하지 않습니다. 이 파일의 내용은 자동 분석도 하지 않습니다.<br />요약·주요 의사결정·업무 상황을 직접 입력해 주세요.</p>}<label className="ai-solution-center__file-note-label" htmlFor={`file-note-${attachment.id}`}>파일별 주요 내용·의사결정<textarea id={`file-note-${attachment.id}`} data-testid={`file-note-${attachment.id}`} value={attachment.note} maxLength={fileNoteLimit} aria-invalid={attachment.note.length > fileNoteLimit} onChange={(event) => updateAttachmentNote(attachment.id, event.target.value)} rows={3} /></label><span className="ai-solution-center__file-note-count">{attachment.note.length.toLocaleString()} / {fileNoteLimit.toLocaleString()}자</span>{attachment.note.length > fileNoteLimit && <p className="ai-solution-center__error" role="alert" aria-live="assertive">파일별 메모는 최대 2,000자까지 입력할 수 있습니다.</p>}</div><button type="button" aria-label={`${attachment.name} 제거`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><Trash2 size={15} />제거</button></li>)}</ul>}<p className="ai-solution-center__file-status" data-testid="ai-file-status" aria-live="polite">{attachments.length === 0 ? "파일을 선택하면 자동 추출 가능 여부를 안내합니다." : `첨부 파일 ${attachments.length}건`}</p><div className="ai-solution-center__fields"><label>업무영역<select data-testid="ai-domain-select" value={domain} onChange={(event) => setDomain(event.target.value as BusinessDomain)}><option value="">자동 추정</option>{businessDomains.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>공통 상황 설명<textarea data-testid="ai-situation-input" value={situation} aria-invalid={Boolean(consultantError) && !canAnalyzeFiles} onChange={(event) => { setSituation(event.target.value); setConsultantError(""); }} placeholder="업무 상황, 현재 문제, 확인하고 싶은 기준을 적어 주세요." rows={6} /></label></div>{consultantError && <p className="ai-solution-center__error" role="alert">{consultantError}</p>}<button className="ai-solution-center__primary-button" data-testid="ai-consultant-analyze" type="button" disabled={consultantBusy} onClick={analyzeConsultant}>{consultantProcessing ? "분석 중..." : "기본 가이드 분석"}</button></div>{consultantSession && renderResult(consultantSession, consultantAnswers, consultantFollowupError, consultantRefining, "consultant-file")}</section> : <section id="customer-panel" role="tabpanel" aria-labelledby="customer-tab" className="ai-solution-center__panel"><div className="ai-solution-center__form-card"><h2>고객 업무 Q&amp;A</h2><div className="ai-solution-center__fields"><label>문의 또는 문제<textarea data-testid="ai-customer-inquiry" value={inquiry} aria-invalid={Boolean(customerError)} onChange={(event) => { setInquiry(event.target.value); setCustomerError(""); }} rows={4} /></label><label>현재 관리 방식<textarea data-testid="ai-customer-current-management" value={currentManagement} onChange={(event) => setCurrentManagement(event.target.value)} rows={3} /></label><label>희망하는 기준<textarea data-testid="ai-customer-desired-standard" value={desiredStandard} onChange={(event) => setDesiredStandard(event.target.value)} rows={3} /></label><label>현장 제약<textarea data-testid="ai-customer-field-constraints" value={fieldConstraints} onChange={(event) => setFieldConstraints(event.target.value)} rows={3} /></label></div>{customerError && <p className="ai-solution-center__error" role="alert">{customerError}</p>}<div className="ai-solution-center__actions"><button type="button" onClick={fillExample}>예시 질문 넣기</button><button className="ai-solution-center__primary-button" data-testid="ai-customer-guide" type="button" disabled={customerBusy} onClick={guideCustomer}>{customerProcessing ? "가이드 작성 중..." : "기본 가이드 받기"}</button></div></div>{customerSession && renderResult(customerSession, customerAnswers, customerFollowupError, customerRefining, "customer-qa")}</section>}
      <section className="ai-solution-center__security" aria-label="보안 안내"><h2>보안 및 사용 안내</h2><ul><li>선택한 파일은 서버로 업로드하지 않습니다.</li><li>파일 내용과 분석 세션은 브라우저 메모리에서만 처리합니다.</li><li>개인정보, 비밀번호, 고객 실무정보를 첨부하거나 질문에 입력하지 마세요.</li><li>실제 도입 전에는 회사 보안 검토가 필요합니다.</li><li>현재 출력은 기본 검토 가이드이므로 해당 담당자 확인이 필요합니다.</li></ul></section>
    </main>
  </div>;
}
