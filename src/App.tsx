import { useState } from "react";
import { PurchaseOrderRegistration } from "./features/purchase-order/PurchaseOrderRegistration";
import { ApiPurchaseOrderRegistration } from "./features/purchase-order/ApiPurchaseOrderRegistration";
import { SalesOrderRegistration } from "./features/sales-order/SalesOrderRegistration";
import { WorkOrderRegistration } from "./features/work-order/WorkOrderRegistration";
import { isApiMode } from "./api/apiClient";

export default function App() {
  const [page, setPage] = useState<"sales" | "purchase" | "work">("sales");
  return page === "sales"
    ? <SalesOrderRegistration onNavigate={setPage} />
    : page === "purchase"
      ? isApiMode() ? <ApiPurchaseOrderRegistration onNavigate={setPage} /> : <PurchaseOrderRegistration onNavigate={setPage} />
      : <WorkOrderRegistration onNavigate={setPage} />;
}
