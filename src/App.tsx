import { useEffect, useState } from "react";
import { PurchaseOrderRegistration } from "./features/purchase-order/PurchaseOrderRegistration";
import { apiPurchaseOrderAdapter } from "./features/purchase-order/apiPurchaseOrderAdapter";
import { mockPurchaseOrderAdapter } from "./features/purchase-order/mockPurchaseOrderAdapter";
import { SalesOrderRegistration } from "./features/sales-order/SalesOrderRegistration";
import { WorkOrderRegistration } from "./features/work-order/WorkOrderRegistration";
import { isApiMode } from "./api/apiClient";
import { canShowDevelopmentDataManagerClient, developmentDataApi } from "./api/developmentDataApi";
import { DevelopmentDataManager } from "./features/development-data/DevelopmentDataManager";
import { AiSolutionCenterPage } from "./features/ai-solution-center/AiSolutionCenterPage";
import { CompactSalesOrderPage } from "./features/sales-order/CompactSalesOrderPage";

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

  if (page === "development" && showDevelopmentDataManager) return <DevelopmentDataManager onNavigate={navigate} />;
  if (page === "ai") return <AiSolutionCenterPage onNavigate={navigate} />;
  if (page === "mobileSales") return <CompactSalesOrderPage mode="mobile" onNavigate={navigate} />;
  if (page === "pdaSales") return <CompactSalesOrderPage mode="pda" onNavigate={navigate} />;
  return page === "sales"
    ? <SalesOrderRegistration onNavigate={navigate} showDevelopmentDataManager={showDevelopmentDataManager} />
    : page === "purchase"
      ? <PurchaseOrderRegistration adapter={purchaseOrderAdapter} onNavigate={navigate} showDevelopmentDataManager={showDevelopmentDataManager} />
      : <WorkOrderRegistration onNavigate={navigate} showDevelopmentDataManager={showDevelopmentDataManager} />;
}
