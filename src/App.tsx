import { useState } from "react";
import { PurchaseOrderRegistration } from "./features/purchase-order/PurchaseOrderRegistration";
import { SalesOrderRegistration } from "./features/sales-order/SalesOrderRegistration";

export default function App() {
  const [page, setPage] = useState<"sales" | "purchase">("sales");
  return page === "sales"
    ? <SalesOrderRegistration onNavigate={setPage} />
    : <PurchaseOrderRegistration onNavigate={setPage} />;
}
