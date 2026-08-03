import { mockItems } from "../common-code/item/mockData";
import { mockPartners } from "../common-code/partner/mockData";
import { mockWarehouses } from "../common-code/warehouse/mockData";
import { mockPurchaseOrderHeaders, mockPurchaseOrderLines } from "./mockData";
import type {
  PurchaseOrderDataAdapter,
  PurchaseOrderDocument
} from "./purchaseOrderDataAdapter";
import { allocateMockDocumentNumber } from "../../utils/documentNumber";

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

  async getDetail(companyCode, purchaseOrderNo) {
    const header = mockPurchaseOrderHeaders.find((row) => row.CD_FIRM === companyCode && row.NO_PO === purchaseOrderNo);
    if (!header) throw new Error("발주 정보를 찾을 수 없습니다.");
    return {
      Header: { ...header },
      Lines: mockPurchaseOrderLines
        .filter((line) => line.CD_FIRM === companyCode && line.NO_PO === purchaseOrderNo)
        .map((line) => ({ ...line }))
    };
  },

  async create(document) {
    const savedNo = document.Header.NO_PO.startsWith("TEMP_PO_")
      ? allocateMockDocumentNumber(
          "POR",
          document.Header.CD_FIRM,
          document.Header.DT_PO,
          mockPurchaseOrderHeaders.map((header) => header.NO_PO)
        )
      : document.Header.NO_PO;
    const saved = cloneDocument(document);

    saved.Header.NO_PO = savedNo;
    if (document.Header.NO_PO.startsWith("TEMP_PO_")) saved.Header.ST_PO = "확정";
    saved.Lines = saved.Lines.map((line) => ({ ...line, NO_PO: savedNo }));

    return saved;
  },

  async update(_companyCode, _purchaseOrderNo, document) {
    return cloneDocument(document);
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
