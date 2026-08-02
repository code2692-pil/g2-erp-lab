import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { apiPurchaseOrderAdapter } from "./features/purchase-order/apiPurchaseOrderAdapter";
import { mockPurchaseOrderAdapter } from "./features/purchase-order/mockPurchaseOrderAdapter";
import { SalesOrderRegistration } from "./features/sales-order/SalesOrderRegistration";
import { isApiMode } from "./api/apiClient";
import { canShowDevelopmentDataManagerClient, developmentDataApi } from "./api/developmentDataApi";
import { preloadScreenModule, screenModules, type ScreenModuleId } from "./screenModules";
import { DirtyNavigationProvider, useDirtyNavigation } from "./navigation/DirtyNavigationProvider";
import { navigationDelta, readAppHistoryEntry, type AppHistoryEntry, withAppHistoryEntry } from "./navigation/appHistory";
import { DemoEnvironmentGate, useDemoRole } from "./components/DemoEnvironmentGate";
import { demoEnvironment } from "./api/demoApi";

const PurchaseOrderRegistration = screenModules.purchase.component;
const WorkOrderRegistration = screenModules.work.component;
const DevelopmentDataManager = screenModules.development.component;
const AiSolutionCenterPage = screenModules.ai.component;
const CompactSalesOrderPage = screenModules.mobileSales.component;

type AppPage = "sales" | "mobileSales" | "pdaSales" | "purchase" | "work" | "development" | "ai";

function pageFromPath(pathname: string): AppPage {
  if (pathname === "/mobile/sales-orders") return "mobileSales";
  if (pathname === "/pda/sales-orders") return "pdaSales";
  if (pathname === "/purchase-orders") return "purchase";
  if (pathname === "/work-orders") return "work";
  if (pathname === "/development-data") return "development";
  if (pathname === "/ai-solution-center") return "ai";
  return "sales";
}

function pathForPage(page: AppPage) {
  if (page === "mobileSales") return "/mobile/sales-orders";
  if (page === "pdaSales") return "/pda/sales-orders";
  if (page === "purchase") return "/purchase-orders";
  if (page === "work") return "/work-orders";
  if (page === "development") return "/development-data";
  if (page === "ai") return "/ai-solution-center";
  return "/";
}

function historyEntry(page: AppPage, index: number): AppHistoryEntry<AppPage> {
  return { version: 1, id: `g2erp-${crypto.randomUUID()}`, index, page };
}

function PageLoadingFallback() {
  return (
    <main className="app-page-loading" data-testid="app-page-loading" aria-busy="true">
      <p role="status">화면을 불러오는 중입니다.</p>
    </main>
  );
}

class PageLoadErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  private retry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-page-loading" data-testid="app-page-load-error">
          <p role="alert">화면을 불러오지 못했습니다. 네트워크를 확인한 후 다시 시도해 주세요.</p>
          <button type="button" onClick={this.retry}>다시 시도</button>
        </main>
      );
    }

    return this.props.children;
  }
}

function AppRouter() {
  const [page, setPage] = useState<AppPage>(() => pageFromPath(window.location.pathname));
  const [showDevelopmentDataManager, setShowDevelopmentDataManager] = useState(false);
  const currentEntryRef = useRef<AppHistoryEntry<AppPage> | null>(null);
  const restoreTargetRef = useRef<AppHistoryEntry<AppPage> | null>(null);
  const replayTargetRef = useRef<AppHistoryEntry<AppPage> | null>(null);
  const { requestNavigation } = useDirtyNavigation();
  const demoRole = useDemoRole();
  const purchaseOrderAdapter = isApiMode() ? apiPurchaseOrderAdapter : mockPurchaseOrderAdapter;
  const sharedDevelopmentDataBlocked = demoEnvironment === "shared" && demoRole !== "Manager" && demoRole !== "Admin";
  const developmentDataRouteBlocked = page === "development" && (!canShowDevelopmentDataManagerClient() || sharedDevelopmentDataBlocked);
  const activePage = developmentDataRouteBlocked ? "sales" : page;

  useLayoutEffect(() => {
    if (!developmentDataRouteBlocked) return;
    const existing = readAppHistoryEntry<AppPage>(window.history.state);
    const fallback = historyEntry("sales", existing?.index ?? currentEntryRef.current?.index ?? 0);
    window.history.replaceState(withAppHistoryEntry(window.history.state, fallback), "", pathForPage("sales"));
    currentEntryRef.current = fallback;
    setPage("sales");
  }, [developmentDataRouteBlocked]);

  useEffect(() => {
    let cancelled = false;
    if (!canShowDevelopmentDataManagerClient() || sharedDevelopmentDataBlocked) { setShowDevelopmentDataManager(false); return () => { cancelled = true; }; }
    if (!isApiMode()) { setShowDevelopmentDataManager(true); return () => { cancelled = true; }; }
    void developmentDataApi.status().then((status) => { if (!cancelled) setShowDevelopmentDataManager(status.IsAllowed); }).catch(() => { if (!cancelled) setShowDevelopmentDataManager(false); });
    return () => { cancelled = true; };
  }, [sharedDevelopmentDataBlocked]);

  useEffect(() => {
    const existing = readAppHistoryEntry<AppPage>(window.history.state);
    const initial = existing ?? historyEntry(pageFromPath(window.location.pathname), 0);
    if (!existing) window.history.replaceState(withAppHistoryEntry(window.history.state, initial), "", window.location.href);
    currentEntryRef.current = initial;

    const applyTarget = (target: AppHistoryEntry<AppPage>) => {
      currentEntryRef.current = target;
      setPage(target.page);
    };

    const handlePopState = (event: PopStateEvent) => {
      const target = readAppHistoryEntry<AppPage>(event.state);
      const current = currentEntryRef.current;
      if (!target || !current) {
        setPage(pageFromPath(window.location.pathname));
        return;
      }
      if (replayTargetRef.current?.id === target.id) {
        replayTargetRef.current = null;
        applyTarget(target);
        return;
      }
      if (restoreTargetRef.current && target.id === current.id) {
        const intendedTarget = restoreTargetRef.current;
        restoreTargetRef.current = null;
        requestNavigation({
          id: `history-${intendedTarget.id}`,
          targetLabel: "이전 화면",
          execute: () => {
            replayTargetRef.current = intendedTarget;
            window.history.go(navigationDelta(current, intendedTarget));
          }
        });
        return;
      }
      if (target.id === current.id) return;
      restoreTargetRef.current = target;
      window.history.go(-navigationDelta(current, target));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [requestNavigation]);

  const commitNavigation = useCallback((nextPage: AppPage) => {
    const current = currentEntryRef.current ?? historyEntry(page, 0);
    const nextPath = pathForPage(nextPage);
    if (window.location.pathname !== nextPath) {
      const nextEntry = historyEntry(nextPage, current.index + 1);
      window.history.pushState(withAppHistoryEntry(window.history.state, nextEntry), "", nextPath);
      currentEntryRef.current = nextEntry;
    }
    setPage(nextPage);
  }, [page]);

  const navigate = useCallback((nextPage: AppPage) => {
    if (nextPage === page) return;
    requestNavigation({ id: `app-${nextPage}`, targetLabel: nextPage, execute: () => commitNavigation(nextPage) });
  }, [commitNavigation, page, requestNavigation]);

  const handleScreenIntent = (screen: ScreenModuleId) => {
    void preloadScreenModule(screen).catch(() => {
      // A failed intent preload must not interrupt the current page. Actual navigation owns visible recovery.
    });
  };

  if (activePage === "sales") return <SalesOrderRegistration onNavigate={navigate} onScreenIntent={handleScreenIntent} showDevelopmentDataManager={showDevelopmentDataManager} />;

  return (
    <PageLoadErrorBoundary>
      <Suspense fallback={<PageLoadingFallback />}>
        {activePage === "development" && showDevelopmentDataManager
          ? <DevelopmentDataManager onNavigate={navigate} />
          : activePage === "ai"
            ? <AiSolutionCenterPage onNavigate={navigate} onScreenIntent={handleScreenIntent} />
            : activePage === "mobileSales"
              ? <CompactSalesOrderPage mode="mobile" onNavigate={navigate} />
              : activePage === "pdaSales"
                ? <CompactSalesOrderPage mode="pda" onNavigate={navigate} />
                : activePage === "purchase"
                  ? <PurchaseOrderRegistration adapter={purchaseOrderAdapter} onNavigate={navigate} onScreenIntent={handleScreenIntent} showDevelopmentDataManager={showDevelopmentDataManager} />
                  : <WorkOrderRegistration onNavigate={navigate} onScreenIntent={handleScreenIntent} showDevelopmentDataManager={showDevelopmentDataManager} />}
      </Suspense>
    </PageLoadErrorBoundary>
  );
}

export default function App() {
  return <DemoEnvironmentGate><DirtyNavigationProvider><AppRouter /></DirtyNavigationProvider></DemoEnvironmentGate>;
}
