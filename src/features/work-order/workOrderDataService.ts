import { dataMode } from "../../api/apiClient";
import {
  createWorkOrder,
  deleteWorkOrder,
  getEquipment,
  getProcesses,
  getProductionLines,
  searchWorkOrders,
  updateWorkOrder,
  type WorkOrderDetailDto,
  type WorkOrderSearchParams
} from "../../api/workOrderApi";
import { mockEquipment } from "../common-code/equipment/mockData";
import type { Equipment } from "../common-code/equipment/types";
import { mockItems } from "../common-code/item/mockData";
import type { Item } from "../common-code/item/types";
import { mockProductionLines } from "../common-code/production-line/mockData";
import type { ProductionLine } from "../common-code/production-line/types";
import { mockProductionProcesses } from "../common-code/process/mockData";
import type { ProductionProcess } from "../common-code/process/types";
import { mockWorkOrderHeaders, mockWorkOrderProcesses } from "./mockData";
import type { WorkOrderHeader, WorkOrderProcess } from "./types";

export interface WorkOrderFilters {
  cdFirm: string;
  dateFrom: string;
  dateTo: string;
  noWo: string;
  item: string;
  line: string;
  status: string;
  urgent: string;
}

export interface WorkOrderLookups {
  items: Item[];
  productionLines: ProductionLine[];
  processes: ProductionProcess[];
  equipment: Equipment[];
}

export interface WorkOrderDataService {
  search(filters: WorkOrderFilters): Promise<WorkOrderDetailDto[]>;
  save(detail: Pick<WorkOrderDetailDto, "Header" | "Processes">, allHeaders: readonly WorkOrderHeader[]): Promise<WorkOrderDetailDto>;
  delete(companyCode: string, workOrderNo: string): Promise<void>;
  getLookups(): Promise<WorkOrderLookups>;
}

const cloneHeader = (header: WorkOrderHeader): WorkOrderHeader => ({ ...header });
const cloneProcess = (process: WorkOrderProcess): WorkOrderProcess => ({ ...process });
const cloneDetail = (detail: WorkOrderDetailDto): WorkOrderDetailDto => ({ Header: cloneHeader(detail.Header), Processes: detail.Processes.map(cloneProcess), Warnings: [...detail.Warnings] });

function matchesMockFilter(header: WorkOrderHeader, filters: WorkOrderFilters) {
  const item = `${header.CD_ITEM} ${header.NM_ITEM}`.toLocaleLowerCase();
  const line = `${header.CD_LINE} ${header.NM_LINE}`.toLocaleLowerCase();
  return (!filters.cdFirm || header.CD_FIRM.includes(filters.cdFirm))
    && (!filters.dateFrom || header.DT_WO >= filters.dateFrom)
    && (!filters.dateTo || header.DT_WO <= filters.dateTo)
    && (!filters.noWo || header.NO_WO.includes(filters.noWo))
    && (!filters.item || item.includes(filters.item.toLocaleLowerCase()))
    && (!filters.line || line.includes(filters.line.toLocaleLowerCase()))
    && (!filters.status || header.ST_WO === filters.status)
    && (!filters.urgent || header.YN_URGENT === filters.urgent);
}

function waitForMockResponse() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 1_000));
}

function createMockNumber(header: WorkOrderHeader, allHeaders: readonly WorkOrderHeader[]) {
  if (!header.NO_WO.startsWith("TEMP-WO-")) return header.NO_WO;
  const yearMonth = new Date().toISOString().slice(0, 7).replace("-", "");
  const pattern = new RegExp(`^WO${yearMonth}(\\d{4})$`);
  const sequence = [...mockWorkOrderHeaders, ...allHeaders]
    .map((candidate) => candidate.NO_WO.match(pattern)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .reduce((maximum, value) => Math.max(maximum, value), 0) + 1;
  return `WO${yearMonth}${String(sequence).padStart(4, "0")}`;
}

const mockService: WorkOrderDataService = {
  async search(filters) {
    await waitForMockResponse();
    return mockWorkOrderHeaders.filter((header) => matchesMockFilter(header, filters)).map((header) => ({
      Header: cloneHeader(header),
      Processes: mockWorkOrderProcesses.filter((process) => process.CD_FIRM === header.CD_FIRM && process.NO_WO === header.NO_WO).map(cloneProcess),
      Warnings: header.QT_WO > 0 && header.QT_RESULT > header.QT_WO ? ["실적수량이 지시수량을 초과했습니다."] : []
    }));
  },
  async save(detail, allHeaders) {
    await waitForMockResponse();
    const workOrderNo = createMockNumber(detail.Header, allHeaders);
    return cloneDetail({ Header: { ...detail.Header, NO_WO: workOrderNo }, Processes: detail.Processes.map((process) => ({ ...process, NO_WO: workOrderNo })), Warnings: detail.Header.QT_WO > 0 && detail.Header.QT_RESULT > detail.Header.QT_WO ? ["실적수량이 지시수량을 초과했습니다."] : [] });
  },
  async delete() { await waitForMockResponse(); },
  async getLookups() {
    return { items: mockItems.map((item) => ({ ...item })), productionLines: mockProductionLines.map((line) => ({ ...line })), processes: mockProductionProcesses.map((process) => ({ ...process })), equipment: mockEquipment.map((item) => ({ ...item })) };
  }
};

const apiService: WorkOrderDataService = {
  search(filters) {
    const request: WorkOrderSearchParams = { companyCode: filters.cdFirm || undefined, dateFrom: filters.dateFrom || undefined, dateTo: filters.dateTo || undefined, workOrderNo: filters.noWo || undefined, item: filters.item || undefined, productionLine: filters.line || undefined, status: filters.status || undefined, urgent: filters.urgent || undefined };
    return searchWorkOrders(request);
  },
  save(detail) {
    return detail.Header.NO_WO.startsWith("TEMP-WO-")
      ? createWorkOrder(detail)
      : updateWorkOrder(detail.Header.CD_FIRM, detail.Header.NO_WO, detail);
  },
  delete: deleteWorkOrder,
  async getLookups() {
    const [items, productionLines, processes, equipment] = await Promise.all([
      import("../../api/itemApi").then(({ getItems }) => getItems()),
      getProductionLines({ useYn: "Y" }),
      getProcesses({ useYn: "Y" }),
      getEquipment({ useYn: "Y" })
    ]);
    return { items, productionLines, processes, equipment };
  }
};

export const workOrderDataService: WorkOrderDataService = dataMode === "api" ? apiService : mockService;
