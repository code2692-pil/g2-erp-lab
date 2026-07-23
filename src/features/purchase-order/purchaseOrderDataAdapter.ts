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

export interface PurchaseOrderSearchFilters {
  companyCode?: string;
  dateFrom?: string;
  dateTo?: string;
  purchaseOrderNo?: string;
  partner?: string;
  status?: string;
}

export interface PurchaseOrderDataAdapter {
  search(filters: PurchaseOrderSearchFilters): Promise<PurchaseOrderSearchResult>;
  getDetail(companyCode: string, purchaseOrderNo: string): Promise<PurchaseOrderDocument>;
  create(document: PurchaseOrderDocument): Promise<PurchaseOrderDocument>;
  update(companyCode: string, purchaseOrderNo: string, document: PurchaseOrderDocument): Promise<PurchaseOrderDocument>;
  delete(companyCode: string, purchaseOrderNo: string): Promise<void>;
  getPartners(): Promise<Partner[]>;
  getItems(): Promise<Item[]>;
  getWarehouses(): Promise<Warehouse[]>;
}
