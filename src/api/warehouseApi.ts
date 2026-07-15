import { apiClient } from "./apiClient";
import type { Warehouse } from "../features/common-code/warehouse/types";

export function getWarehouses() {
  return apiClient<Warehouse[]>("/api/warehouses");
}
