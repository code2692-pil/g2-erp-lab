import { apiClient } from "./apiClient";
import type { Partner } from "../features/common-code/partner/types";

export function getPartners() {
  return apiClient<Partner[]>("/api/partners");
}
