import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiClientError } from "../api/apiClient";
import {
  clearDemoSession,
  demoApi,
  demoEnvironment,
  storedDemoSessionToken,
  type DemoContext,
  type DemoUser
} from "../api/demoApi";

const DemoRoleContext = createContext<DemoUser["Role"] | null>(null);
export function useDemoRole() { return useContext(DemoRoleContext); }

export function DemoEnvironmentGate({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("demo-viewer");
  const [context, setContext] = useState<DemoContext | null>(null);
  const [loading, setLoading] = useState(demoEnvironment === "shared");
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetStatus, setResetStatus] = useState("");

  useEffect(() => {
    if (demoEnvironment !== "shared") return;
    let cancelled = false;
    const load = async () => {
      try {
        const availableUsers = await demoApi.users();
        if (cancelled) return;
        setUsers(availableUsers);
        if (storedDemoSessionToken()) {
          try {
            const verified = await demoApi.context();
            if (!cancelled) setContext(verified);
          } catch {
            clearDemoSession();
          }
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "시연 서버에 연결할 수 없습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.demoRole = context?.User.Role ?? "";
    return () => { delete document.documentElement.dataset.demoRole; };
  }, [context]);

  useEffect(() => {
    if (context?.User.Role !== "Viewer") return;
    const selectors = [
      "#root button[data-testid='btn-new']", "#root button[data-testid='btn-add-line']", "#root button[data-testid='btn-delete-line']",
      "#root button[data-testid='btn-save']", "#root button[data-testid='btn-delete-order']", "#root button[data-testid='btn-convert-purchase']",
      "#root button[data-testid='btn-convert-work']", "#root button[data-testid='btn-mail-import']",
      "#root button[data-testid='po-btn-new']", "#root button[data-testid='po-btn-add-line']", "#root button[data-testid='po-btn-delete-line']",
      "#root button[data-testid='po-btn-save']", "#root button[data-testid='po-btn-delete']",
      "#root button[data-testid='wo-btn-new']", "#root button[data-testid='wo-btn-add-process']", "#root button[data-testid='wo-btn-delete-process']",
      "#root button[data-testid='wo-btn-save']", "#root button[data-testid='wo-btn-delete']",
      "#root button[data-testid='mobile-sales-new']", "#root button[data-testid='mobile-sales-save']", "#root button[data-testid='mobile-sales-delete-order']",
      "#root button[data-testid='mobile-sales-add-line']", "#root button[data-testid^='mobile-sales-delete-line-']",
      "#root button[data-testid='pda-sales-new']", "#root button[data-testid='pda-sales-save']", "#root button[data-testid='pda-sales-delete-order']",
      "#root button[data-testid='pda-sales-add-line']", "#root button[data-testid^='pda-sales-delete-line-']"
    ];
    const disableMutationControls = () => {
      document.querySelectorAll<HTMLButtonElement>(selectors.join(",")).forEach((button) => {
        if (!button.dataset.demoViewerDisabled) {
          button.dataset.demoViewerOriginalDisabled = String(button.disabled);
          button.dataset.demoViewerOriginalTitle = button.getAttribute("title") ?? "";
        }
        button.disabled = true;
        button.dataset.demoViewerDisabled = "true";
        button.title = "Demo Viewer는 조회만 할 수 있습니다.";
      });
    };
    disableMutationControls();
    const observer = new MutationObserver(disableMutationControls);
    observer.observe(document.getElementById("root")!, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll<HTMLButtonElement>("[data-demo-viewer-disabled='true']").forEach((button) => {
        button.disabled = button.dataset.demoViewerOriginalDisabled === "true";
        const originalTitle = button.dataset.demoViewerOriginalTitle;
        if (originalTitle) button.title = originalTitle;
        else button.removeAttribute("title");
        delete button.dataset.demoViewerDisabled;
        delete button.dataset.demoViewerOriginalDisabled;
        delete button.dataset.demoViewerOriginalTitle;
      });
    };
  }, [context]);

  const startSession = async () => {
    setLoading(true);
    setError("");
    try {
      await demoApi.createSession(selectedUserId);
      setContext(await demoApi.context());
    } catch (reason) {
      clearDemoSession();
      setError(reason instanceof Error ? reason.message : "시연 사용자를 선택하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const resetDemo = async () => {
    if (resetText !== "DEMO RESET") return;
    setResetStatus("초기화 중입니다.");
    try {
      const result = await demoApi.reset();
      setResetStatus(`안전한 시연 데이터로 초기화했습니다. 기준 버전: ${result.SeedVersion}`);
      setResetText("");
    } catch (reason) {
      const message = reason instanceof ApiClientError && reason.traceId
        ? `${reason.message} (추적 ID: ${reason.traceId})`
        : reason instanceof Error ? reason.message : "초기화하지 못했습니다.";
      setResetStatus(message);
    }
  };

  if (demoEnvironment === "shared" && !context) {
    return (
      <main className="demo-session-gate" data-testid="demo-session-gate">
        <section aria-labelledby="demo-session-title">
          <p className="demo-environment-label">개발·사내 시연 환경</p>
          <h1 id="demo-session-title">시연 사용자 선택</h1>
          <p>실제 운영 데이터가 아닌 고정된 가상 데이터만 사용합니다. 이 선택은 실제 로그인이나 운영 권한을 의미하지 않습니다.</p>
          <label htmlFor="demo-user">시연 역할</label>
          <select id="demo-user" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} disabled={loading || users.length === 0}>
            {users.map((user) => <option key={user.Id} value={user.Id}>{user.Name} · {user.Role}</option>)}
          </select>
          {error && <p role="alert" className="demo-error">{error}</p>}
          <button type="button" onClick={() => void startSession()} disabled={loading || users.length === 0}>
            {loading ? "연결 확인 중" : "사내 시연 시작"}
          </button>
        </section>
      </main>
    );
  }

  const canReset = context?.User.Role === "Manager" || context?.User.Role === "Admin";
  return (
    <>
      <aside className="demo-environment-banner" data-testid="demo-environment-banner" aria-label="시연 환경 안내">
        <div>
          <strong>개발·사내 시연 환경 · 실제 운영 데이터가 아닙니다</strong>
          <span>{demoEnvironment === "personal"
            ? "개인 안전 시연 · 이 브라우저의 데이터는 다른 사용자와 공유되지 않습니다."
            : demoEnvironment === "development"
              ? "개발 API 검증 · 현재 개발 서버의 데이터 저장소를 사용합니다."
              : `공유 시연 · ${context?.User.Name} (${context?.User.Role}) · 서버가 역할과 작업 권한을 검증합니다.`}</span>
        </div>
        {demoEnvironment === "shared" && (
          <div className="demo-banner-actions">
            {canReset && <button type="button" onClick={() => setResetOpen((value) => !value)}>시연 데이터 초기화</button>}
            <button type="button" onClick={() => { clearDemoSession(); setContext(null); setResetOpen(false); }}>사용자 변경</button>
          </div>
        )}
      </aside>
      {resetOpen && (
        <section className="demo-reset-panel" aria-label="시연 데이터 초기화">
          <strong>공유 시연 데이터 초기화</strong>
          <p>수주·발주·작업지시를 안전한 고정 시연 데이터로 되돌립니다. 실제 운영 DB에는 연결되지 않습니다.</p>
          <label htmlFor="demo-reset-confirmation">계속하려면 DEMO RESET 입력</label>
          <div>
            <input id="demo-reset-confirmation" value={resetText} onChange={(event) => setResetText(event.target.value)} />
            <button type="button" disabled={resetText !== "DEMO RESET"} onClick={() => void resetDemo()}>초기화 실행</button>
          </div>
          {resetStatus && <p role="status">{resetStatus}</p>}
        </section>
      )}
      <DemoRoleContext.Provider value={context?.User.Role ?? null}>{children}</DemoRoleContext.Provider>
    </>
  );
}
