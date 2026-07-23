import { createPurchaseOrder, deletePurchaseOrder, getPurchaseOrder, searchPurchaseOrders, updatePurchaseOrder } from "../../api/purchaseOrderApi";
import { getItems } from "../../api/itemApi";
import { getPartners } from "../../api/partnerApi";
import { getWarehouses } from "../../api/warehouseApi";
import type { PurchaseOrderDataAdapter } from "./purchaseOrderDataAdapter";

export const apiPurchaseOrderAdapter: PurchaseOrderDataAdapter = {
  async search(filters) {
    const documents = await searchPurchaseOrders(filters);
    return {
      headers: documents.map((document) => document.Header),
      lines: documents.flatMap((document) => document.Lines)
    };
  },

  getDetail: getPurchaseOrder,

  create: createPurchaseOrder,

  update: updatePurchaseOrder,

  delete: deletePurchaseOrder,

  getPartners,

  getItems,

  getWarehouses
};
