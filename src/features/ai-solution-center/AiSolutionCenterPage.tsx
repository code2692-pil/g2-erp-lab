import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronRight, FileText, Trash2 } from "lucide-react";
import { businessDomains, type BusinessDomain, type CompanyKnowledgeArticle, type SolutionRequest, type SolutionResult } from "./solutionTypes";
import { buildSolutionResult } from "./solutionEngine";
import { CompanyKnowledgeSettings } from "./CompanyKnowledgeSettings";
import { solutionKnowledge } from "./solutionKnowledge";

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
}

interface AiSolutionCenterPageProps {
  onNavigate: (page: NavigationPage) => void;
}

const automaticTextLimit = 512 * 1024;
const supportedExtensions = new Set(["txt", "md", "csv", "json", "xml", "log"]);

function extensionOf(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "없음";
}

function isTextFile(file: File, extension: string) {
  return supportedExtensions.has(extension) || file.type.startsWith("text/");
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function fileStatusMessage(status: FileStatus) {
  switch (status) {
    case "text-ready": return "자동 텍스트 추출 가능";
    case "empty-text": return "읽을 수 있는 텍스트 내용이 없습니다.";
    case "oversize": return "자동 텍스트 읽기 제한(512KB)을 초과했습니다. 상황 설명을 입력해 주세요.";
    case "unsupported": return "자동 추출 미지원";
    default: return "텍스트를 읽지 못했습니다. 상황 설명을 입력해 주세요.";
  }
}

function ResultPanel({ result }: { result: SolutionResult }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [result]);

  return <section className="ai-solution-center__result" data-testid="ai-result" aria-live="polite">
    <h2 ref={headingRef} tabIndex={-1} data-testid="ai-result-heading">검토 가이드</h2>
    <p className="ai-solution-center__guide-notice">{result.guideNotice}</p>
    <dl className="ai-solution-center__result-summary">
      <div><dt>입력 요약</dt><dd>{result.inputSummary}</dd></div>
      <div><dt>추정 업무영역</dt><dd data-testid="ai-result-domain">{result.inferredDomain}</dd></div>
      <div><dt>주요 문제</dt><dd>{result.mainProblem}</dd></div>
      <div><dt>신뢰도</dt><dd data-testid="ai-result-confidence">{result.confidence}</dd></div>
      <div><dt>외부·내부 검토</dt><dd data-testid="ai-result-external-review">회사 내부 및 보안 검토 필요</dd></div>
    </dl>
    <section><h3 data-testid="ai-result-recommendation">{result.recommendation.title}</h3><p>{result.recommendation.rationale}</p><List items={result.recommendation.actions} /></section>
    <section><h3>단계적 적용 방법</h3><List dataTestId="ai-result-phased-plan" items={result.phasedPlan} /></section>
    <div className="ai-solution-center__result-columns">
      <section><h3>우선순위</h3><List items={result.priorities} /></section>
      <section><h3>추가 확인 정보</h3><List items={result.additionalInfo} /></section>
      <section><h3>위험·주의사항</h3><List items={result.risks} /></section>
    </div>
    <section data-testid="ai-result-questions"><h3>컨설턴트·개발 담당자 확인 질문</h3>{result.clarifyingQuestions.length > 0 ? <div className="ai-solution-center__question-columns"><div><h4>컨설턴트 확인</h4><List items={result.consultantQuestions} /></div><div><h4>개발 담당자 확인</h4><List items={result.developmentQuestions} /></div></div> : <p>입력 정보가 비교적 구체적입니다. 적용 전에도 회사의 기준과 보안 조건을 확인해 주세요.</p>}</section>
    <section className="ai-solution-center__evidence" data-testid="ai-result-evidence"><h3>참고한 지식 근거</h3><ul>{result.evidence.map((evidence) => <li key={evidence.id} data-testid={`ai-evidence-${evidence.id}`}><strong>{evidence.title}</strong><span>{evidence.category} · {evidence.sourceType === "COMPANY" ? "회사 지식" : "일반 지식"}</span><p>일치 주요 키워드: {evidence.matchedKeywords.length > 0 ? evidence.matchedKeywords.join(", ") : "업무영역 기준"}</p><p>{evidence.reason} (신뢰 가중치 {evidence.confidenceWeight.toFixed(2)})</p></li>)}</ul>{result.companyKnowledgeUsed && <p className="ai-solution-center__company-reference" data-testid="company-knowledge-reference">회사 지식도 실제 업무 적용 전 해당 컨설턴트와 개발자의 검토가 필요합니다.</p>}</section>
  </section>;
}

function List({ items, dataTestId }: { items: readonly string[]; dataTestId?: string }) {
  return <ul data-testid={dataTestId}>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function AiSolutionCenterPage({ onNavigate }: AiSolutionCenterPageProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("consultant");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [domain, setDomain] = useState<BusinessDomain>("");
  const [situation, setSituation] = useState("");
  const [consultantError, setConsultantError] = useState("");
  const [consultantProcessing, setConsultantProcessing] = useState(false);
  const [consultantResult, setConsultantResult] = useState<SolutionResult>();
  const [companyKnowledge, setCompanyKnowledge] = useState<readonly CompanyKnowledgeArticle[]>([]);
  const [inquiry, setInquiry] = useState("");
  const [currentManagement, setCurrentManagement] = useState("");
  const [desiredStandard, setDesiredStandard] = useState("");
  const [fieldConstraints, setFieldConstraints] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [customerProcessing, setCustomerProcessing] = useState(false);
  const [customerResult, setCustomerResult] = useState<SolutionResult>();

  const extractedText = useMemo(() => attachments.filter((attachment) => attachment.status === "text-ready").map((attachment) => attachment.text ?? "").join("\n"), [attachments]);
  const canAnalyzeFiles = extractedText.trim().length > 0 || situation.trim().length > 0;

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const prepared = await Promise.all(files.map(async (file, index): Promise<FileAttachment> => {
      const extension = extensionOf(file.name);
      const base = { id: `${file.name}-${file.size}-${Date.now()}-${index}`, name: file.name, extension, size: file.size };
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

  const analyzeConsultant = () => {
    if (consultantProcessing) return;
    if (!canAnalyzeFiles) {
      setConsultantError("분석할 수 있는 텍스트 내용이나 상황 설명을 입력해 주세요.");
      return;
    }
    setConsultantProcessing(true);
    setConsultantError("");
    try {
      const request: SolutionRequest = { source: "consultant-file", domain, situation, extractedText };
      setConsultantResult(buildSolutionResult(request, companyKnowledge));
    } catch {
      setConsultantError("기본 검토 가이드를 만들지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.");
    } finally {
      setConsultantProcessing(false);
    }
  };

  const fillExample = () => {
    setInquiry("자재를 추적성 단위로 관리하고 싶은데 생산부터 모든 공정에서 추적성을 입력하기 어렵습니다. 추적성을 확보하면서 현장 입력 부담을 줄이려면 어떤 방식으로 관리하는 것이 좋을까요?");
    setCurrentManagement("입고 이후 일부 공정에서만 수기로 LOT 정보를 확인하고 있습니다.");
    setDesiredStandard("문제 발생 시 자재·작업·검사 이력을 확인할 수 있기를 원합니다.");
    setFieldConstraints("모든 공정에서 별도 입력을 강제하기는 어렵고, 현장 입력 시간을 줄여야 합니다.");
    setCustomerError("");
  };

  const guideCustomer = () => {
    if (customerProcessing) return;
    if (inquiry.trim().length < 20) {
      setCustomerError("현재 상황, 원하는 기준, 현장 제약을 조금 더 설명해 주세요.");
      return;
    }
    setCustomerProcessing(true);
    setCustomerError("");
    try {
      setCustomerResult(buildSolutionResult({ source: "customer-qa", domain: "", situation: inquiry, currentManagement, desiredStandard, fieldConstraints }, companyKnowledge));
    } catch {
      setCustomerError("기본 검토 가이드를 만들지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.");
    } finally {
      setCustomerProcessing(false);
    }
  };

  const applyCompanyKnowledge = (articles: readonly CompanyKnowledgeArticle[]) => {
    setCompanyKnowledge(articles);
    setConsultantResult(undefined);
    setCustomerResult(undefined);
  };

  const resetCompanyKnowledge = () => {
    setCompanyKnowledge([]);
    setConsultantResult(undefined);
    setCustomerResult(undefined);
  };

  return <div className="erp-shell">
    <aside className="side-nav">
      <div className="brand"><Building2 size={20} /><strong>SMART ERP</strong></div>
      <nav>
        <div className="menu-title">영업관리</div><button className="menu-item" data-testid="nav-sales-order" onClick={() => onNavigate("sales")} type="button">수주등록</button>
        <div className="menu-title">구매관리</div><div className="menu-group"><ChevronRight size={14} /><span>발주관리</span></div><button className="menu-item" data-testid="nav-purchase-order" onClick={() => onNavigate("purchase")} type="button">발주등록</button>
        <div className="menu-title">생산관리</div><div className="menu-group"><ChevronRight size={14} /><span>작업지시관리</span></div><button className="menu-item" data-testid="nav-work-order" onClick={() => onNavigate("work")} type="button">작업지시등록</button>
        <div className="menu-title">AI 솔루션</div><button className="menu-item active" data-testid="nav-ai-solution-center" type="button">AI 솔루션 센터</button>
      </nav>
    </aside>
    <main className="ai-solution-center" aria-busy={consultantProcessing || customerProcessing}>
      <header className="page-header"><div><h1 data-testid="ai-solution-center-title">AI 솔루션 센터</h1><p>ERP·MES 업무 상황을 정리하고 검토 가능한 기본 가이드와 추가 확인사항을 제공합니다.</p></div></header>
      <aside className="ai-solution-center__top-note" aria-label="PoC 안내">현재 버전은 로컬 지식 템플릿 기반 PoC입니다.<br />실제 회사 지식과 보안 확인 후 AI를 연결하면 확장할 수 있습니다.</aside>
      <CompanyKnowledgeSettings companyKnowledge={companyKnowledge} generalKnowledgeCount={solutionKnowledge.length} onApply={applyCompanyKnowledge} onReset={resetCompanyKnowledge} />
      <div className="ai-solution-center__tabs" role="tablist" aria-label="AI 솔루션 방식">
        <button type="button" role="tab" id="consultant-tab" aria-controls="consultant-panel" aria-selected={activeTab === "consultant"} className={activeTab === "consultant" ? "is-active" : ""} onClick={() => setActiveTab("consultant")}>컨설턴트 파일 분석</button>
        <button type="button" role="tab" id="customer-tab" aria-controls="customer-panel" aria-selected={activeTab === "customer"} className={activeTab === "customer" ? "is-active" : ""} onClick={() => setActiveTab("customer")}>고객 업무 Q&amp;A</button>
      </div>
      {activeTab === "consultant" ? <section id="consultant-panel" role="tabpanel" aria-labelledby="consultant-tab" className="ai-solution-center__panel">
        <div className="ai-solution-center__form-card">
          <h2>컨설턴트 파일 분석</h2>
          <label className="ai-solution-center__file-label" htmlFor="ai-file-input"><FileText size={16} />파일 선택 또는 추가<input id="ai-file-input" data-testid="ai-file-input" type="file" multiple onChange={(event) => void handleFiles(event)} /></label>
          <p className="ai-solution-center__muted">선택한 파일은 서버로 업로드하지 않으며 브라우저 메모리에서만 처리합니다.</p>
          {attachments.length > 0 && <ul className="ai-solution-center__file-list" data-testid="ai-file-list">{attachments.map((attachment) => <li key={attachment.id}><div><strong>{attachment.name}</strong><span>{attachment.extension.toUpperCase()} · {formatBytes(attachment.size)} · {fileStatusMessage(attachment.status)}</span>{attachment.status === "unsupported" && <p>파일은 첨부 상태로 유지되지만 현재 PoC에서는 내용을 자동 추출하지 않습니다.<br />주요 내용이나 요약문을 아래 상황 설명란에 입력해 주세요.</p>}</div><button type="button" aria-label={`${attachment.name} 제거`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><Trash2 size={15} />제거</button></li>)}</ul>}
          <p className="ai-solution-center__file-status" data-testid="ai-file-status" aria-live="polite">{attachments.length === 0 ? "파일을 선택하면 자동 추출 가능 여부를 안내합니다." : `첨부 파일 ${attachments.length}건`}</p>
          <div className="ai-solution-center__fields">
            <label>업무영역<select data-testid="ai-domain-select" value={domain} onChange={(event) => setDomain(event.target.value as BusinessDomain)}><option value="">자동 추정</option>{businessDomains.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>공통 상황 설명<textarea data-testid="ai-situation-input" value={situation} aria-invalid={Boolean(consultantError) && !canAnalyzeFiles} onChange={(event) => { setSituation(event.target.value); setConsultantError(""); }} placeholder="업무 상황, 현재 문제, 확인하고 싶은 기준을 적어 주세요." rows={6} /></label>
          </div>
          {consultantError && <p className="ai-solution-center__error" role="alert">{consultantError}</p>}
          <button className="ai-solution-center__primary-button" data-testid="ai-consultant-analyze" type="button" disabled={consultantProcessing} onClick={analyzeConsultant}>{consultantProcessing ? "분석 중..." : "기본 가이드 분석"}</button>
        </div>
        {consultantResult && <ResultPanel result={consultantResult} />}
      </section> : <section id="customer-panel" role="tabpanel" aria-labelledby="customer-tab" className="ai-solution-center__panel">
        <div className="ai-solution-center__form-card">
          <h2>고객 업무 Q&amp;A</h2>
          <div className="ai-solution-center__fields">
            <label>문의 또는 문제<textarea data-testid="ai-customer-inquiry" value={inquiry} aria-invalid={Boolean(customerError)} onChange={(event) => { setInquiry(event.target.value); setCustomerError(""); }} rows={4} /></label>
            <label>현재 관리 방식<textarea data-testid="ai-customer-current-management" value={currentManagement} onChange={(event) => setCurrentManagement(event.target.value)} rows={3} /></label>
            <label>원하는 기준<textarea data-testid="ai-customer-desired-standard" value={desiredStandard} onChange={(event) => setDesiredStandard(event.target.value)} rows={3} /></label>
            <label>현장 제약<textarea data-testid="ai-customer-field-constraints" value={fieldConstraints} onChange={(event) => setFieldConstraints(event.target.value)} rows={3} /></label>
          </div>
          {customerError && <p className="ai-solution-center__error" role="alert">{customerError}</p>}
          <div className="ai-solution-center__actions"><button type="button" onClick={fillExample}>예시 질문 넣기</button><button className="ai-solution-center__primary-button" data-testid="ai-customer-guide" type="button" disabled={customerProcessing} onClick={guideCustomer}>{customerProcessing ? "가이드 작성 중..." : "기본 가이드 받기"}</button></div>
        </div>
        {customerResult && <ResultPanel result={customerResult} />}
      </section>}
      <section className="ai-solution-center__security" aria-label="보안 안내"><h2>보안 및 사용 안내</h2><ul><li>선택한 파일은 서버로 업로드하지 않습니다.</li><li>파일 내용은 브라우저 메모리에서만 처리합니다.</li><li>개인정보, 비밀번호, 고객 재무정보는 첨부하지 마세요.</li><li>실제 도입 전에는 회사 보안 검토가 필요합니다.</li><li>현재 출력은 기본 검토 가이드이므로 담당자 확인이 필요합니다.</li></ul></section>
    </main>
  </div>;
}
