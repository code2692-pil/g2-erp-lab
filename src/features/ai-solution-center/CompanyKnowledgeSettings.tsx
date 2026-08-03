import { useState } from "react";
import { FileText, RotateCcw } from "lucide-react";
import { createClientId } from "../../utils/clientId";
import { analyzeFile } from "./file-analysis/fileAnalysisPipeline";
import { companyKnowledgeFileLimit, validateCompanyKnowledge } from "./companyKnowledgeValidator";
import type { CompanyKnowledgeArticle } from "./solutionTypes";

interface CompanyKnowledgeSettingsProps {
  companyKnowledge: readonly CompanyKnowledgeArticle[];
  generalKnowledgeCount: number;
  onApply: (articles: readonly CompanyKnowledgeArticle[]) => void;
  onReset: () => void;
}

const acceptedKnowledgeFiles = ".txt,.md,.json,.pdf,.docx,.xlsx,.pptx,text/plain,text/markdown,application/json,application/pdf";

function articleFromText(text: string, source: string): CompanyKnowledgeArticle {
  const clean = text.replace(/\r\n/g, "\n").trim();
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = (lines[0] || source).slice(0, 200);
  const sentences = clean.split(/(?<=[.!?。]|다\.)\s+|\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
  const keywords = Array.from(new Set(clean.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [])).slice(0, 20);
  const content = sentences.length > 0 ? sentences : [clean.slice(0, 1000)];
  return {
    id: createClientId("company-knowledge"),
    title,
    category: "업무 기준",
    keywords: keywords.length > 0 ? keywords : ["회사", "업무"],
    symptoms: content,
    recommendations: content,
    alternatives: ["관련 담당자가 원문과 정리된 내용을 함께 확인합니다."],
    requiredInformation: ["적용 대상과 시행일을 확인합니다."],
    risks: ["승인 전에는 회사 지식으로 확정하지 않습니다."],
    applicableProcesses: ["공통"],
    confidenceWeight: 0.85,
    sourceType: "COMPANY",
    companySpecific: true
  };
}

export function CompanyKnowledgeSettings({ companyKnowledge, generalKnowledgeCount, onApply, onReset }: CompanyKnowledgeSettingsProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<readonly CompanyKnowledgeArticle[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const selectFiles = (selected: File[]) => {
    setError("");
    setFiles((current) => {
      const keys = new Set(current.map((file) => `${file.name}::${file.size}::${file.lastModified}`));
      return [...current, ...selected.filter((file) => !keys.has(`${file.name}::${file.size}::${file.lastModified}`))];
    });
    setDraft([]);
  };

  const analyze = async () => {
    if (!text.trim() && files.length === 0) {
      setError("직접 작성한 내용이나 분석할 파일을 입력해 주세요.");
      return;
    }
    setProcessing(true);
    setError("");
    setStatus("");
    try {
      const articles: CompanyKnowledgeArticle[] = [];
      if (text.trim()) articles.push(articleFromText(text, "직접 작성한 회사 지식"));
      for (const [index, file] of files.entries()) {
        if (file.size === 0) {
          setError(`${file.name}: 비어 있는 파일은 분석할 수 없습니다.`);
          continue;
        }
        if (file.name.toLocaleLowerCase("ko-KR").endsWith(".json") && file.size <= companyKnowledgeFileLimit) {
          try {
            const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())) as unknown;
            const validation = validateCompanyKnowledge(parsed);
            if (validation.ok) {
              articles.push(...validation.articles);
              continue;
            }
            setError((current) => [current, validation.error].filter(Boolean).join("\n"));
            continue;
          } catch {
            setError((current) => [current, "JSON 형식을 읽지 못했습니다. 쉼표와 따옴표를 확인해 주세요."].filter(Boolean).join("\n"));
            continue;
          }
        }
        const result = await analyzeFile({ file, fileId: `knowledge-${index}-${file.size}-${file.lastModified}`, userNote: "", includeInAnalysis: true });
        const extracted = result.redactedText || result.extractedText || result.summary;
        if (result.analysisSucceeded && !result.requiresUserDescription && extracted.trim()) articles.push(articleFromText(extracted, file.name));
        else setError((current) => [current, `${file.name}: ${result.summary}`].filter(Boolean).join("\n"));
      }
      setDraft(articles);
      setStatus(articles.length > 0 ? `${articles.length}개 지식 후보를 분석했습니다. 내용을 확인한 뒤 저장해 주세요.` : "등록할 수 있는 지식 후보가 없습니다.");
    } finally {
      setProcessing(false);
    }
  };

  const save = () => {
    if (draft.length === 0) return;
    const merged = [...companyKnowledge];
    for (const article of draft) {
      const index = merged.findIndex((item) => item.id === article.id);
      if (index >= 0) merged[index] = article;
      else merged.push(article);
    }
    onApply(merged);
    setStatus(`${draft.length}개 항목을 회사 지식으로 등록했습니다.`);
    setDraft([]);
    setText("");
    setFiles([]);
  };

  const reset = () => {
    onReset();
    setDraft([]);
    setText("");
    setFiles([]);
    setError("");
    setStatus("회사 지식을 초기화했습니다. 기본 지식만 사용합니다.");
  };

  return <section className="ai-solution-center__knowledge-card" data-testid="company-knowledge-settings" aria-busy={processing} aria-labelledby="company-knowledge-heading">
    <div className="ai-solution-center__knowledge-heading"><div><h2 id="company-knowledge-heading">회사 지식 설정</h2><p>메모나 업무 설명을 직접 작성하거나 파일을 등록한 뒤 내용을 확인해 회사 지식으로 저장합니다.</p></div><button className="ai-solution-center__reset-button" data-testid="company-knowledge-reset" type="button" onClick={reset}><RotateCcw size={15} />초기화</button></div>
    <label className="company-knowledge-text-label">회사 업무 내용<textarea data-testid="company-knowledge-text" placeholder="업무 규칙, 용어, 처리 절차를 자유롭게 입력해 주세요." rows={7} value={text} onChange={(event) => { setText(event.target.value); setDraft([]); }} /></label>
    <div className="company-knowledge-drop-zone" data-testid="company-knowledge-drop-zone" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); selectFiles(Array.from(event.dataTransfer.files)); }}>
      <span>파일을 이곳에 놓거나 파일등록을 선택하세요.</span>
    <div className="ai-solution-center__knowledge-actions">
      <label className="ai-solution-center__file-label" htmlFor="company-knowledge-input"><FileText size={16} />파일등록<input id="company-knowledge-input" data-testid="company-knowledge-input" type="file" accept={acceptedKnowledgeFiles} multiple aria-invalid={Boolean(error)} onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
      <button data-testid="company-knowledge-analyze" disabled={processing} onClick={() => void analyze()} type="button">{processing ? "분석 중..." : "분석"}</button>
      <button className="primary" data-testid="company-knowledge-save" disabled={draft.length === 0 || processing} onClick={save} type="button">저장</button>
    </div>
    </div>
    {files.length > 0 && <ul className="company-knowledge-file-list" data-testid="company-knowledge-files">{files.map((file) => <li key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name} · {file.size.toLocaleString("ko-KR")} bytes</li>)}</ul>}
    {draft.length > 0 && <section className="company-knowledge-preview" data-testid="company-knowledge-preview"><h3>분석 결과</h3><ul>{draft.map((article) => <li key={article.id}><strong>{article.title}</strong><span>{article.recommendations[0]}</span></li>)}</ul></section>}
    {status && <p className="ai-solution-center__file-status" data-testid="company-knowledge-status" role="status" aria-live="polite">{status}</p>}
    {error && <p className="ai-solution-center__error" data-testid="company-knowledge-error" role="alert" aria-live="assertive">{error}</p>}
    <section className="ai-solution-center__knowledge-list" aria-labelledby="company-knowledge-list-heading"><h3 id="company-knowledge-list-heading">기존 지식</h3><p><span data-testid="company-knowledge-count">회사 지식 {companyKnowledge.length}개</span> · <span data-testid="general-knowledge-count">기본 지식 {generalKnowledgeCount}개</span></p>{companyKnowledge.length === 0 ? <p>등록된 회사 지식이 없습니다.</p> : <ul data-testid="company-knowledge-list">{companyKnowledge.map((article) => <li key={article.id}><strong>{article.title}</strong><span>{article.category} · 회사 지식</span></li>)}</ul>}</section>
  </section>;
}
