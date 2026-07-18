import { useEffect, useState } from "react";
import { PurchaseOrderRegistration } from "./features/purchase-order/PurchaseOrderRegistration";
import { ApiPurchaseOrderRegistration } from "./features/purchase-order/ApiPurchaseOrderRegistration";
import { SalesOrderRegistration } from "./features/sales-order/SalesOrderRegistration";
import { WorkOrderRegistration } from "./features/work-order/WorkOrderRegistration";
import { isApiMode } from "./api/apiClient";
import { canShowDevelopmentDataManagerClient, developmentDataApi } from "./api/developmentDataApi";
import { DevelopmentDataManager } from "./features/development-data/DevelopmentDataManager";

export default function App() {
  const [page, setPage] = useState<"sales" | "purchase" | "work" | "development">("sales");
  const [showDevelopmentDataManager, setShowDevelopmentDataManager] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!canShowDevelopmentDataManagerClient()) return () => { cancelled = true; };
    if (!isApiMode()) { setShowDevelopmentDataManager(true); return () => { cancelled = true; }; }
    void developmentDataApi.status().then((status) => { if (!cancelled) setShowDevelopmentDataManager(status.IsAllowed); }).catch(() => { if (!cancelled) setShowDevelopmentDataManager(false); });
    return () => { cancelled = true; };
  }, []);

  if (page === "development" && showDevelopmentDataManager) return <DevelopmentDataManager onNavigate={setPage} />;
  return page === "sales"
    ? <SalesOrderRegistration onNavigate={setPage} showDevelopmentDataManager={showDevelopmentDataManager} />
    : page === "purchase"
      ? isApiMode() ? <ApiPurchaseOrderRegistration onNavigate={setPage} showDevelopmentDataManager={showDevelopmentDataManager} /> : <PurchaseOrderRegistration onNavigate={setPage} showDevelopmentDataManager={showDevelopmentDataManager} />
      : <WorkOrderRegistration onNavigate={setPage} showDevelopmentDataManager={showDevelopmentDataManager} />;
}
