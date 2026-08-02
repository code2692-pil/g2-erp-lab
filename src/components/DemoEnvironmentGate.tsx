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

const roleLabels: Record<DemoUser["Role"], string> = {
  Viewer: "조회 사용자",
  Operator: "업무 사용자",
  Manager: "관리자",
  Admin: "시스템 관리자"
};

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
        if (!cancelled) setError(reason instanceof Error ? reason.message : "서비스에 연결할 수 없습니다.");
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
        button.title = "조회 사용자는 조회 기능만 사용할 수 있습니다.";
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
      setError(reason instanceof Error ? reason.message : "사용자를 선택하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const resetDemo = async () => {
    if (resetText !== "초기 데이터 복원") return;
    setResetStatus("데이터를 복원하는 중입니다.");
    try {
      await demoApi.reset();
      setResetStatus("업무 확인용 초기 데이터로 복원했습니다.");
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
          <p className="demo-environment-label">G2 ERP</p>
          <h1 id="demo-session-title">사용자 선택</h1>
          <p>담당 업무에 맞는 사용자를 선택해 시작하세요.</p>
          <label htmlFor="demo-user">사용자 역할</label>
          <select id="demo-user" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} disabled={loading || users.length === 0}>
            {users.map((user) => <option key={user.Id} value={user.Id}>{user.Name}</option>)}
          </select>
          {error && <p role="alert" className="demo-error">{error}</p>}
          <button type="button" onClick={() => void startSession()} disabled={loading || users.length === 0}>
            {loading ? "연결 확인 중" : "업무 화면 시작"}
          </button>
        </section>
      </main>
    );
  }

  const canReset = context?.User.Role === "Manager" || context?.User.Role === "Admin";
  return (
    <>
      {demoEnvironment === "shared" && <aside className="demo-environment-banner" data-testid="current-user-menu" aria-label="현재 사용자 메뉴">
        <div>
          <strong>현재 사용자</strong>
          <span>{context ? roleLabels[context.User.Role] : ""}</span>
        </div>
        <div className="demo-banner-actions">
          {canReset && <button type="button" onClick={() => setResetOpen((value) => !value)}>초기 데이터 복원</button>}
          <button type="button" onClick={() => { clearDemoSession(); setContext(null); setResetOpen(false); }}>사용자 전환</button>
        </div>
      </aside>}
      {resetOpen && (
        <section className="demo-reset-panel" aria-label="초기 데이터 복원">
          <strong>초기 데이터 복원</strong>
          <p>수주·발주·작업지시 데이터를 업무 확인을 시작하기 전 상태로 되돌립니다.</p>
          <label htmlFor="demo-reset-confirmation">계속하려면 초기 데이터 복원 입력</label>
          <div>
            <input id="demo-reset-confirmation" value={resetText} onChange={(event) => setResetText(event.target.value)} />
            <button type="button" disabled={resetText !== "초기 데이터 복원"} onClick={() => void resetDemo()}>복원 실행</button>
          </div>
          {resetStatus && <p role="status">{resetStatus}</p>}
        </section>
      )}
      <DemoRoleContext.Provider value={context?.User.Role ?? null}>{children}</DemoRoleContext.Provider>
    </>
  );
}
