import { mockItems } from "../common-code/item/mockData";
import { mockPartners } from "../common-code/partner/mockData";
import { mockWarehouses } from "../common-code/warehouse/mockData";
import { mockPurchaseOrderHeaders, mockPurchaseOrderLines } from "./mockData";
import type {
  PurchaseOrderDataAdapter,
  PurchaseOrderDocument,
  PurchaseOrderSaveResult
} from "./purchaseOrderDataAdapter";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cloneDocument(document: PurchaseOrderDocument): PurchaseOrderDocument {
  return {
    Header: { ...document.Header },
    Lines: document.Lines.map((line) => ({ ...line }))
  };
}

export const mockPurchaseOrderAdapter: PurchaseOrderDataAdapter = {
  async search() {
    return {
      headers: mockPurchaseOrderHeaders.map((header) => ({ ...header })),
      lines: mockPurchaseOrderLines.map((line) => ({ ...line }))
    };
  },

  async save(document): Promise<PurchaseOrderSaveResult> {
    const savedNo = document.Header.NO_PO.startsWith("TEMP_PO_")
      ? `PO${today().replaceAll("-", "")}${document.Header.NO_PO.slice(-4)}`
      : document.Header.NO_PO;
    const saved = cloneDocument(document);

    saved.Header.NO_PO = savedNo;
    if (document.Header.NO_PO.startsWith("TEMP_PO_")) saved.Header.ST_PO = "확정";
    saved.Lines = saved.Lines.map((line) => ({ ...line, NO_PO: savedNo }));

    return { document: saved };
  },

  async delete() {},

  async getPartners() {
    return mockPartners.map((partner) => ({ ...partner }));
  },

  async getItems() {
    return mockItems.map((item) => ({ ...item }));
  },

  async getWarehouses() {
    return mockWarehouses.map((warehouse) => ({ ...warehouse }));
  }
};
