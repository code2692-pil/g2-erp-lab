import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { apiPurchaseOrderAdapter } from "./features/purchase-order/apiPurchaseOrderAdapter";
import { mockPurchaseOrderAdapter } from "./features/purchase-order/mockPurchaseOrderAdapter";
import { SalesOrderRegistration } from "./features/sales-order/SalesOrderRegistration";
import { isApiMode } from "./api/apiClient";
import { canShowDevelopmentDataManagerClient, developmentDataApi } from "./api/developmentDataApi";

const PurchaseOrderRegistration = lazy(() => import("./features/purchase-order/PurchaseOrderRegistration").then(({ PurchaseOrderRegistration }) => ({ default: PurchaseOrderRegistration })));
const WorkOrderRegistration = lazy(() => import("./features/work-order/WorkOrderRegistration").then(({ WorkOrderRegistration }) => ({ default: WorkOrderRegistration })));
const DevelopmentDataManager = lazy(() => import("./features/development-data/DevelopmentDataManager").then(({ DevelopmentDataManager }) => ({ default: DevelopmentDataManager })));
const AiSolutionCenterPage = lazy(() => import("./features/ai-solution-center/AiSolutionCenterPage").then(({ AiSolutionCenterPage }) => ({ default: AiSolutionCenterPage })));
const CompactSalesOrderPage = lazy(() => import("./features/sales-order/CompactSalesOrderPage").then(({ CompactSalesOrderPage }) => ({ default: CompactSalesOrderPage })));

type AppPage = "sales" | "mobileSales" | "pdaSales" | "purchase" | "work" | "development" | "ai";

function pageFromPath(pathname: string): AppPage {
  if (pathname === "/mobile/sales-orders") return "mobileSales";
  if (pathname === "/pda/sales-orders") return "pdaSales";
  return "sales";
}

function pathForPage(page: AppPage) {
  if (page === "mobileSales") return "/mobile/sales-orders";
  if (page === "pdaSales") return "/pda/sales-orders";
  return "/";
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

export default function App() {
  const [page, setPage] = useState<AppPage>(() => pageFromPath(window.location.pathname));
  const [showDevelopmentDataManager, setShowDevelopmentDataManager] = useState(false);
  const purchaseOrderAdapter = isApiMode() ? apiPurchaseOrderAdapter : mockPurchaseOrderAdapter;

  useEffect(() => {
    let cancelled = false;
    if (!canShowDevelopmentDataManagerClient()) return () => { cancelled = true; };
    if (!isApiMode()) { setShowDevelopmentDataManager(true); return () => { cancelled = true; }; }
    void developmentDataApi.status().then((status) => { if (!cancelled) setShowDevelopmentDataManager(status.IsAllowed); }).catch(() => { if (!cancelled) setShowDevelopmentDataManager(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handlePopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (nextPage: AppPage) => {
    const nextPath = pathForPage(nextPage);
    if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
    setPage(nextPage);
  };

  if (page === "sales") return <SalesOrderRegistration onNavigate={navigate} showDevelopmentDataManager={showDevelopmentDataManager} />;

  return (
    <PageLoadErrorBoundary>
      <Suspense fallback={<PageLoadingFallback />}>
        {page === "development" && showDevelopmentDataManager
          ? <DevelopmentDataManager onNavigate={navigate} />
          : page === "ai"
            ? <AiSolutionCenterPage onNavigate={navigate} />
            : page === "mobileSales"
              ? <CompactSalesOrderPage mode="mobile" onNavigate={navigate} />
              : page === "pdaSales"
                ? <CompactSalesOrderPage mode="pda" onNavigate={navigate} />
                : page === "purchase"
                  ? <PurchaseOrderRegistration adapter={purchaseOrderAdapter} onNavigate={navigate} showDevelopmentDataManager={showDevelopmentDataManager} />
                  : <WorkOrderRegistration onNavigate={navigate} showDevelopmentDataManager={showDevelopmentDataManager} />}
      </Suspense>
    </PageLoadErrorBoundary>
  );
}
