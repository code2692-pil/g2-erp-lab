import type { Item } from "../common-code/item/types";
import type { Partner } from "../common-code/partner/types";
import type { Warehouse } from "../common-code/warehouse/types";
import type { PurchaseOrderHeader, PurchaseOrderLine } from "./types";

export interface PurchaseOrderDocument {
  Header: PurchaseOrderHeader;
  Lines: PurchaseOrderLine[];
}

export interface PurchaseOrderSearchResult {
  headers: PurchaseOrderHeader[];
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderSaveResult {
  document: PurchaseOrderDocument;
}

export interface PurchaseOrderDataAdapter {
  search(): Promise<PurchaseOrderSearchResult>;
  save(document: PurchaseOrderDocument): Promise<PurchaseOrderSaveResult>;
  delete(companyCode: string, purchaseOrderNo: string): Promise<void>;
  getPartners(): Promise<Partner[]>;
  getItems(): Promise<Item[]>;
  getWarehouses(): Promise<Warehouse[]>;
}
