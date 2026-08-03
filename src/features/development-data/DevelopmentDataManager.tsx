import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Eye, RefreshCw, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { PageToolbar } from "../../components/common/PageToolbar";
import { useConfirm } from "../../hooks/useConfirm";
import { useNotification } from "../../hooks/useNotification";
import {
  developmentDataApi,
  type DevelopmentE2ERemnants,
  type DevelopmentOperation,
  type DevelopmentPreview,
  type DevelopmentScope,
  type DevelopmentSummary
} from "../../api/developmentDataApi";

type NavigationPage = "sales" | "purchase" | "work" | "development";

interface Props {
  onNavigate: (page: NavigationPage) => void;
}

const seedTargets: { scope: Exclude<DevelopmentScope, "all">; label: string; description: string }[] = [
  { scope: "production-masters", label: "생산 기준정보", description: "품목·생산라인·공정·설비" },
  { scope: "sales-orders", label: "수주", description: "수주정보와 수주상세" },
  { scope: "purchase-orders", label: "발주", description: "발주정보와 발주상세" },
  { scope: "work-orders", label: "작업지시", description: "작업지시정보와 공정상세" }
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

export function DevelopmentDataManager({ onNavigate }: Props) {
  const { confirm } = useConfirm();
  const { notify } = useNotification();
  const [summary, setSummary] = useState<DevelopmentSummary>();
  const [preview, setPreview] = useState<DevelopmentPreview>();
  const [e2e, setE2e] = useState<DevelopmentE2ERemnants>();
  const [confirmationText, setConfirmationText] = useState("");
  const [logs, setLogs] = useState<DevelopmentOperation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("데이터 관리 상태를 확인하는 중입니다.");

  const refresh = async () => {
    setBusy(true);
    try {
      const [nextSummary, nextE2e] = await Promise.all([developmentDataApi.summary(), developmentDataApi.e2eRemnants()]);
      setSummary(nextSummary); setE2e(nextE2e); setMessage(nextSummary.Environment.Message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태를 조회할 수 없습니다.");
    } finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const cards = useMemo(() => summary ? [
    ["기준 품목", summary.SampleItems], ["생산라인", summary.SampleProductionLines], ["공정", summary.SampleProcesses], ["설비", summary.SampleEquipment],
    ["수주 Header / Line", `${summary.SampleSalesOrders} / ${summary.SampleSalesOrderLines}`],
    ["발주 Header / Line", `${summary.SamplePurchaseOrders} / ${summary.SamplePurchaseOrderLines}`],
    ["작업지시 Header / 공정", `${summary.SampleWorkOrders} / ${summary.SampleWorkOrderProcesses}`],
    ["자동화 잔존 행", summary.E2ERemnantRows]
  ] : [], [summary]);

  const appendOperation = async (operation: Promise<DevelopmentOperation>) => {
    setBusy(true);
    try {
      const result = await operation;
      setLogs((current) => [result, ...current].slice(0, 20));
      setMessage(result.Message);
      notify(result.Status === "Success" ? "success" : result.Status === "Blocked" ? "warning" : "error", result.Message);
      await refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "요청을 처리할 수 없습니다.";
      setMessage(detail); notify("error", detail);
    } finally { setBusy(false); }
  };

  const previewScope = (scope: DevelopmentScope) => void (async () => {
    setBusy(true);
    try {
      const result = await developmentDataApi.preview(scope); setPreview(result); setMessage(`변경 예상: 신규 ${result.NewRows}건, 기존 ${result.ExistingRows}건`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "변경 예상 결과를 조회할 수 없습니다."); }
    finally { setBusy(false); }
  })();

  const cleanup = async (scope: DevelopmentScope) => {
    if (confirmationText !== "기준 데이터 삭제") { setMessage("계속하려면 기준 데이터 삭제를 정확히 입력하세요."); return; }
    if (!await confirm({ title: "기준 데이터 초기화", message: "선택한 기준 데이터를 삭제하시겠습니까?", description: "지정된 기준 데이터만 삭제하며 업무 데이터는 삭제하지 않습니다.", confirmLabel: "초기화", danger: true })) return;
    await appendOperation(developmentDataApi.cleanup(scope, "SAMPLE DELETE"));
    setConfirmationText("");
  };

  const allowed = summary?.Environment.IsAllowed ?? false;
  return <div className="development-data-page" aria-busy={busy}>
    <header className="development-data-page__header">
      <div>
        <p className="development-data-page__eyebrow">운영 지원</p>
        <h1 data-testid="development-data-page-title">기준 데이터 관리</h1>
        <p>업무 확인에 필요한 기준 데이터를 생성·조회·초기화합니다.</p>
      </div>
      <PageToolbar processing={busy} actions={[
        { dataTestId: "tdm-btn-refresh", label: busy ? "조회 중..." : "새로고침", icon: <RefreshCw size={15} />, onClick: () => void refresh(), disabled: busy },
        { dataTestId: "tdm-btn-preview-all", label: "전체 변경 예상", icon: <Eye size={15} />, onClick: () => previewScope("all"), disabled: busy || !allowed },
        { dataTestId: "tdm-btn-seed-all", label: "전체 기준 데이터 생성", icon: <Sparkles size={15} />, onClick: () => void appendOperation(developmentDataApi.seed("all")), disabled: busy || !allowed, variant: "primary" }
      ]} />
    </header>

    <section className={`development-data-safety ${allowed ? "is-allowed" : "is-blocked"}`} data-testid="tdm-safety-status">
      {allowed ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
      <div><strong>{allowed ? "데이터 관리 사용 가능" : "접근 불가"}</strong><span>{message}</span></div>
    </section>

    <section className="development-data-summary" aria-label="기준 데이터 현황">
      {cards.map(([label, value]) => <div className="development-data-summary__card" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
    </section>

    <section className="development-data-actions">
      <div className="section-title"><h2>기준 데이터 생성</h2><span>동일한 내용은 건너뛰고, 식별자 충돌 시 중단합니다.</span></div>
      <div className="development-data-actions__grid">
        {seedTargets.map((target) => <article key={target.scope}><Database size={18} /><div><strong>{target.label}</strong><span>{target.description}</span></div><button data-testid={`tdm-btn-preview-${target.scope}`} disabled={busy || !allowed} onClick={() => previewScope(target.scope)} type="button">변경 예상</button><button data-testid={`tdm-btn-seed-${target.scope}`} disabled={busy || !allowed} onClick={() => void appendOperation(developmentDataApi.seed(target.scope))} type="button">생성</button></article>)}
      </div>
    </section>

    {preview && <section className="development-data-preview" data-testid="tdm-preview-result">
      <div className="section-title"><h2>변경 예상 결과</h2><span>데이터 변경 없음</span></div>
      <div><strong>기존 {preview.ExistingRows}</strong><strong>신규 {preview.NewRows}</strong><strong className={preview.ConflictRows ? "is-conflict" : ""}>충돌 {preview.ConflictRows}</strong></div>
      <p>영향 테이블: {preview.AffectedTables.join(", ") || "없음"}</p>
      {preview.Conflicts.length > 0 && <ul>{preview.Conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>}
    </section>}

    <section className="development-data-cleanup">
      <div className="section-title"><h2>기준 데이터 초기화</h2><span>업무 데이터는 삭제하지 않습니다.</span></div>
      <label>확인 문구<input data-testid="tdm-cleanup-confirmation" value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} placeholder="기준 데이터 삭제" /></label>
      <div><button data-testid="tdm-btn-cleanup-work-orders" disabled={busy || !allowed} onClick={() => void cleanup("work-orders")} type="button">작업지시 기준 데이터 초기화</button><button data-testid="tdm-btn-cleanup-all" disabled={busy || !allowed || confirmationText !== "기준 데이터 삭제"} onClick={() => void cleanup("all")} type="button">전체 기준 데이터 초기화</button></div>
    </section>

    <section className="development-data-e2e">
      <div className="section-title"><h2>자동화 잔존 데이터</h2><span>{e2e?.TotalRows ?? 0}건 · 화면에서 삭제하지 않음</span></div>
      {e2e?.Rows.length ? <ul>{e2e.Rows.map((row) => <li key={`${row.Table}-${row.Key}`}>{row.Table} / {row.Key}</li>)}</ul> : <p>자동화 잔존 데이터가 없습니다.</p>}
    </section>

    <section className="development-data-log">
      <div className="section-title"><h2>최근 실행 결과</h2><span>현재 화면 세션의 기록입니다.</span></div>
      {logs.length === 0 ? <p>아직 실행한 작업이 없습니다.</p> : <table><thead><tr><th>시간</th><th>작업</th><th>결과</th><th>생성</th><th>삭제</th><th>건너뜀</th><th>메시지</th></tr></thead><tbody>{logs.map((log, index) => <tr key={`${log.ExecutedAt}-${index}`}><td>{formatDate(log.ExecutedAt)}</td><td>{log.Operation} / {log.Scope}</td><td>{log.Status}</td><td>{log.CreatedRows}</td><td>{log.DeletedRows}</td><td>{log.SkippedRows}</td><td>{log.Message}</td></tr>)}</tbody></table>}
    </section>

    <footer className="development-data-page__footer"><button onClick={() => onNavigate("sales")} type="button">수주등록으로 돌아가기</button><RotateCcw size={14} /><span>일부 실행 방식에서는 서버 재시작 시 생성 데이터가 초기화됩니다.</span></footer>
  </div>;
}
