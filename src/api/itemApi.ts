import { apiClient } from "./apiClient";
import type { Item } from "../features/common-code/item/types";

export function getItems() {
  return apiClient<Item[]>("/api/items");
}
