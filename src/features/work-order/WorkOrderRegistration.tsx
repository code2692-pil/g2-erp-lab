import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, Plus, Rows3, Save, Search, Trash2 } from "lucide-react";
import { ErpDataGrid } from "../../components/common/ErpDataGrid";
import type { ErpDataGridCellValue, ErpDataGridColumn } from "../../components/common/ErpDataGrid";
import { ErpDialog } from "../../components/common/ErpDialog";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import { PageToolbar } from "../../components/common/PageToolbar";
import { SearchPanel } from "../../components/common/SearchPanel";
import { toValidationCellErrors, type ValidationIssue } from "../../components/common/validation/validation";
import { useConfirm } from "../../hooks/useConfirm";
import { useCrudPage } from "../../hooks/useCrudPage";
import { useDirtyState } from "../../hooks/useDirtyState";
import { useMasterDetailSelection } from "../../hooks/useMasterDetailSelection";
import { useNotification } from "../../hooks/useNotification";
import type { Equipment } from "../common-code/equipment/types";
import type { Item } from "../common-code/item/types";
import type { ProductionLine } from "../common-code/production-line/types";
import type { ProductionProcess } from "../common-code/process/types";
import { workOrderDataService, type WorkOrderLookups } from "./workOrderDataService";
import type { ProcessStatus, WorkOrderHeader, WorkOrderProcess, WorkOrderStatus, YesNo } from "./types";
import {
  calculateWorkOrderProcessTotals,
  createWorkOrderHeaderKey,
  createWorkOrderProcessKey,
  formatWorkOrderProgress
} from "./utils";
import { getWorkOrderWarnings, validateWorkOrders } from "./validation";

type NavigationPage = "sales" | "purchase" | "work" | "development";
type HeaderEditableField = Exclude<keyof WorkOrderHeader, "NO_WO">;
type ProcessEditableField = Exclude<keyof WorkOrderProcess, "CD_FIRM" | "NO_WO" | "NO_PROC">;

interface WorkOrderRegistrationProps {
  onNavigate: (page: NavigationPage) => void;
  showDevelopmentDataManager?: boolean;
}

const workOrderStatuses: readonly WorkOrderStatus[] = ["미확정", "확정", "진행", "완료", "마감", "취소"];
const processStatuses: readonly ProcessStatus[] = ["대기", "진행", "완료", "보류"];
const urgentOptions: readonly YesNo[] = ["N", "Y"];
const quantity = new Intl.NumberFormat("ko-KR");

const itemColumns: readonly ErpDataGridColumn<Item>[] = [
  { field: "CD_FIRM", headerName: "회사코드", width: 82 },
  { field: "CD_ITEM", headerName: "품목코드", width: 118, dataType: "code" },
  { field: "NM_ITEM", headerName: "품목명", width: 180 },
  { field: "STND_ITEM", headerName: "규격", width: 150 },
  { field: "UNIT_ITEM", headerName: "단위", width: 65, align: "center" }
];
const productionLineColumns: readonly ErpDataGridColumn<ProductionLine>[] = [
  { field: "CD_FIRM", headerName: "회사코드", width: 82 },
  { field: "CD_LINE", headerName: "생산라인코드", width: 135, dataType: "code" },
  { field: "NM_LINE", headerName: "생산라인명", width: 180 },
  { field: "YN_USE", headerName: "사용", width: 65, align: "center" }
];
const processLookupColumns: readonly ErpDataGridColumn<ProductionProcess>[] = [
  { field: "CD_FIRM", headerName: "회사코드", width: 82 },
  { field: "CD_PROC", headerName: "공정코드", width: 115, dataType: "code" },
  { field: "NM_PROC", headerName: "공정명", width: 160 },
  { field: "NO_SEQ", headerName: "표준순번", width: 84, dataType: "number", align: "right" },
  { field: "YN_USE", headerName: "사용", width: 65, align: "center" }
];
const equipmentColumns: readonly ErpDataGridColumn<Equipment>[] = [
  { field: "CD_FIRM", headerName: "회사코드", width: 82 },
  { field: "CD_EQUIP", headerName: "설비코드", width: 118, dataType: "code" },
  { field: "NM_EQUIP", headerName: "설비명", width: 165 },
  { field: "CD_LINE", headerName: "생산라인", width: 100, dataType: "code" },
  { field: "YN_USE", headerName: "사용", width: 65, align: "center" }
];

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function toNumber(value: ErpDataGridCellValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createTempWorkOrderNo(sequence: number) {
  return `TEMP-WO-${String(sequence).padStart(3, "0")}`;
}


function createEmptyHeader(noWo: string): WorkOrderHeader {
  const issueDate = today();
  return {
    CD_FIRM: "1000",
    NO_WO: noWo,
    DT_WO: issueDate,
    CD_ITEM: "",
    NM_ITEM: "",
    STND_ITEM: "",
    UNIT_ITEM: "",
    QT_WO: 0,
    QT_RESULT: 0,
    DT_PLAN_START: issueDate,
    DT_PLAN_END: issueDate,
    CD_LINE: "",
    NM_LINE: "",
    ST_WO: "미확정",
    YN_URGENT: "N",
    DC_RMK: ""
  };
}

function createEmptyProcess(header: WorkOrderHeader, noProc: number): WorkOrderProcess {
  return {
    CD_FIRM: header.CD_FIRM,
    NO_WO: header.NO_WO,
    NO_PROC: noProc,
    CD_PROC: "",
    NM_PROC: "",
    CD_EQUIP: "",
    NM_EQUIP: "",
    QT_PLAN: header.QT_WO,
    QT_RESULT: 0,
    TM_PLAN_START: `${header.DT_PLAN_START || today()}T08:00`,
    TM_PLAN_END: `${header.DT_PLAN_END || today()}T17:00`,
    ST_PROC: "대기",
    DC_RMK: ""
  };
}

function statusClass(status: WorkOrderStatus) {
  const classes: Record<WorkOrderStatus, string> = {
    미확정: "status-new",
    확정: "status-confirmed",
    진행: "status-progress",
    완료: "status-confirmed",
    마감: "status-closed",
    취소: "status-closed"
  };
  return classes[status];
}

function isHeaderEditableField(field: keyof WorkOrderHeader): field is HeaderEditableField {
  return field !== "NO_WO";
}

function isProcessEditableField(field: keyof WorkOrderProcess): field is ProcessEditableField {
  return field !== "CD_FIRM" && field !== "NO_WO" && field !== "NO_PROC";
}

export function WorkOrderRegistration({ onNavigate, showDevelopmentDataManager = false }: WorkOrderRegistrationProps) {
  const [headers, setHeaders] = useState<WorkOrderHeader[]>([]);
  const [processes, setProcesses] = useState<WorkOrderProcess[]>([]);
  const [filters, setFilters] = useState({
    cdFirm: "",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    noWo: "",
    item: "",
    line: "",
    status: "",
    urgent: ""
  });
  const [checkedProcessKeys, setCheckedProcessKeys] = useState<string[]>([]);
  const [tempSequence, setTempSequence] = useState(1);
  const [featureMessage, setFeatureMessage] = useState("");
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [itemLookupOpen, setItemLookupOpen] = useState(false);
  const [productionLineLookupOpen, setProductionLineLookupOpen] = useState(false);
  const [processLookupOpen, setProcessLookupOpen] = useState(false);
  const [equipmentLookupOpen, setEquipmentLookupOpen] = useState(false);
  const [lookups, setLookups] = useState<WorkOrderLookups>({ items: [], productionLines: [], processes: [], equipment: [] });
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  const {
    selectedMasterKey,
    selectedDetailKey: selectedProcessNo,
    selectMaster,
    selectDetail
  } = useMasterDetailSelection<string, number | null>("", null);
  const {
    isLoading,
    isSaving,
    error,
    successMessage,
    clearMessage,
    executeDelete,
    executeSave,
    executeSearch
  } = useCrudPage();
  const { isDirty, markDirty, clearDirty } = useDirtyState();
  const { confirm } = useConfirm();
  const { notify } = useNotification();
  const markWorkOrderDirty = () => { setServerWarnings([]); markDirty(); };

  useEffect(() => {
    let cancelled = false;
    void workOrderDataService.getLookups()
      .then((nextLookups) => { if (!cancelled) setLookups(nextLookups); })
      .catch(() => { if (!cancelled) notify("error", "작업지시 Lookup을 불러오지 못했습니다."); });
    return () => { cancelled = true; };
  }, [notify]);

  const processing = isLoading || isSaving;
  const message = error ?? successMessage ?? featureMessage;
  const setMessage = (nextMessage: string) => {
    clearMessage();
    setFeatureMessage(nextMessage);
  };
  const selectedHeader = headers.find(
    (header) => createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO) === selectedMasterKey
  );
  const selectedProcesses = useMemo(
    () => selectedHeader
      ? processes
        .filter((process) => process.CD_FIRM === selectedHeader.CD_FIRM && process.NO_WO === selectedHeader.NO_WO)
        .sort((left, right) => left.NO_PROC - right.NO_PROC)
      : [],
    [processes, selectedHeader]
  );
  const selectedProcess = selectedProcesses.find((process) => process.NO_PROC === selectedProcessNo);
  const checkedProcesses = selectedProcesses.filter((process) =>
    checkedProcessKeys.includes(createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC))
  );
  const deleteTargetProcesses = checkedProcesses.length > 0 ? checkedProcesses : selectedProcess ? [selectedProcess] : [];
  const validationIssues = useMemo(() => validateWorkOrders(headers, processes), [headers, processes]);
  const validationWarnings = useMemo(() => getWorkOrderWarnings(headers), [headers]);
  const displayedWarning = serverWarnings[0] ?? validationWarnings[0];
  const validationCellErrors = useMemo(() => toValidationCellErrors(validationIssues), [validationIssues]);
  const processTotals = calculateWorkOrderProcessTotals(selectedProcesses);
  const itemLookupRows = lookups.items.filter((item) =>
    item.YN_USE === "Y" && (!selectedHeader || item.CD_FIRM === selectedHeader.CD_FIRM)
  );
  const productionLineLookupRows = lookups.productionLines.filter((line) =>
    line.YN_USE === "Y" && (!selectedHeader || line.CD_FIRM === selectedHeader.CD_FIRM)
  );
  const processLookupRows = lookups.processes.filter((process) =>
    process.YN_USE === "Y" && (!selectedHeader || process.CD_FIRM === selectedHeader.CD_FIRM)
  );
  const equipmentLookupRows = lookups.equipment
    .filter((equipment) => equipment.YN_USE === "Y" && (!selectedHeader || equipment.CD_FIRM === selectedHeader.CD_FIRM))
    .sort((left, right) => Number(right.CD_LINE === selectedHeader?.CD_LINE) - Number(left.CD_LINE === selectedHeader?.CD_LINE));

  const confirmDiscardChanges = () => isDirty
    ? confirm({
      title: "저장하지 않은 변경사항",
      message: "저장하지 않은 변경사항이 있습니다.",
      description: "계속하면 변경사항이 사라집니다.",
      confirmLabel: "변경사항 폐기",
      cancelLabel: "계속 편집",
      danger: true
    })
    : Promise.resolve(true);

  const focusValidationIssue = (issue: ValidationIssue) => {
    if (!issue.rowKey || !issue.field) return;
    const grid = issue.scope === "header" ? "work-order-header-grid" : "work-order-process-grid";
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(
        `[data-testid="${grid}-cell-${issue.rowKey}-${issue.field}"], [data-testid="${grid}-cell-container-${issue.rowKey}-${issue.field}"]`
      )?.focus();
    });
  };

  const handleSearch = async () => {
    if (!(await confirmDiscardChanges())) return;
    setFeatureMessage("");
    await executeSearch({
      execute: async () => {
        const details = await workOrderDataService.search(filters);
        return { headers: details.map((detail) => detail.Header), processes: details.flatMap((detail) => detail.Processes) };
      },
      onSuccess: (result) => {
        setHeaders(result.headers);
        setProcesses(result.processes);
        selectMaster(result.headers[0] ? createWorkOrderHeaderKey(result.headers[0].CD_FIRM, result.headers[0].NO_WO) : "");
        setCheckedProcessKeys([]);
        setServerWarnings([]);
        clearDirty();
        notify(result.headers.length > 0 ? "success" : "info", result.headers.length > 0 ? "조회되었습니다." : "조회된 작업지시가 없습니다.");
      },
      successMessage: (result) => result.headers.length > 0 ? "조회되었습니다." : "조회된 작업지시가 없습니다.",
      errorMessage: "작업지시 조회 중 오류가 발생했습니다."
    });
  };

  const selectHeader = async (header: WorkOrderHeader) => {
    const nextKey = createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO);
    if (nextKey !== selectedMasterKey && !(await confirmDiscardChanges())) return;
    if (nextKey !== selectedMasterKey) clearDirty();
    selectMaster(nextKey);
    setCheckedProcessKeys([]);
  };

  const updateHeader = (header: WorkOrderHeader, field: HeaderEditableField, value: ErpDataGridCellValue) => {
    const originalKey = createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO);
    const nextValue = field === "QT_WO" || field === "QT_RESULT" ? toNumber(value) : String(value ?? "");
    markWorkOrderDirty();
    setHeaders((current) => current.map((candidate) =>
      createWorkOrderHeaderKey(candidate.CD_FIRM, candidate.NO_WO) === originalKey
        ? ({ ...candidate, [field]: nextValue } as WorkOrderHeader)
        : candidate
    ));
    if (field === "CD_FIRM") {
      const nextFirm = String(nextValue);
      setProcesses((current) => current.map((process) =>
        process.CD_FIRM === header.CD_FIRM && process.NO_WO === header.NO_WO
          ? { ...process, CD_FIRM: nextFirm }
          : process
      ));
      selectMaster(createWorkOrderHeaderKey(nextFirm, header.NO_WO));
      setCheckedProcessKeys([]);
    }
  };

  const updateProcess = (process: WorkOrderProcess, field: ProcessEditableField, value: ErpDataGridCellValue) => {
    const targetKey = createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC);
    const nextValue = field === "QT_PLAN" || field === "QT_RESULT" ? toNumber(value) : String(value ?? "");
    markWorkOrderDirty();
    setProcesses((current) => current.map((candidate) =>
      createWorkOrderProcessKey(candidate.CD_FIRM, candidate.NO_WO, candidate.NO_PROC) === targetKey
        ? ({ ...candidate, [field]: nextValue } as WorkOrderProcess)
        : candidate
    ));
  };

  const handleNew = async () => {
    if (!(await confirmDiscardChanges())) return;
    const header = createEmptyHeader(createTempWorkOrderNo(tempSequence));
    const firstProcess = createEmptyProcess(header, 10);
    setFeatureMessage("");
    setHeaders((current) => [header, ...current]);
    setProcesses((current) => [firstProcess, ...current]);
    selectMaster(createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO));
    selectDetail(firstProcess.NO_PROC);
    setCheckedProcessKeys([]);
    setTempSequence((sequence) => sequence + 1);
    clearDirty();
  };

  const handleAddProcess = () => {
    if (!selectedHeader) {
      const notice = "작업지시를 먼저 선택하거나 신규 작업지시를 생성하세요.";
      setMessage(notice);
      notify("info", notice);
      return;
    }
    const nextNoProc = selectedProcesses.length === 0 ? 10 : Math.max(...selectedProcesses.map((process) => process.NO_PROC)) + 10;
    const nextProcess = createEmptyProcess(selectedHeader, nextNoProc);
    setProcesses((current) => [...current, nextProcess]);
    selectDetail(nextNoProc);
    setCheckedProcessKeys([]);
    markWorkOrderDirty();
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(
        `[data-testid="work-order-process-grid-cell-${createWorkOrderProcessKey(nextProcess.CD_FIRM, nextProcess.NO_WO, nextProcess.NO_PROC)}-CD_PROC"]`
      )?.focus();
    });
  };

  const handleDeleteProcess = async () => {
    if (deleteTargetProcesses.length === 0) {
      const notice = "삭제할 공정상세를 선택하거나 체크하세요.";
      setMessage(notice);
      notify("info", "선택된 항목이 없습니다.");
      return;
    }
    if (!(await confirm({
      title: "공정상세 삭제",
      message: `선택한 공정상세 ${deleteTargetProcesses.length}건을 삭제하시겠습니까?`,
      description: "삭제 후 작업지시를 저장해야 최종 반영됩니다.",
      confirmLabel: "삭제",
      danger: true
    }))) return;

    const targetKeys = new Set(deleteTargetProcesses.map((process) => createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC)));
    setProcesses((current) => current.filter((process) => !targetKeys.has(createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC))));
    setCheckedProcessKeys([]);
    if (selectedProcess && targetKeys.has(createWorkOrderProcessKey(selectedProcess.CD_FIRM, selectedProcess.NO_WO, selectedProcess.NO_PROC))) selectDetail(null);
    markWorkOrderDirty();
    notify("success", `선택한 공정상세 ${deleteTargetProcesses.length}건이 삭제되었습니다.`);
  };

  const handleSave = async () => {
    if (!selectedHeader) {
      const notice = "저장할 작업지시를 먼저 선택하세요.";
      setMessage(notice);
      notify("info", notice);
      return;
    }
    const issues = validateWorkOrders(headers, processes);
    if (issues.length > 0) {
      setValidationDialogOpen(true);
      setMessage(`저장할 수 없습니다. 입력값 ${issues.length}건을 확인하세요.`);
      focusValidationIssue(issues[0]);
      notify("warning", `저장할 수 없습니다. 입력값 ${issues.length}건을 확인하세요.`);
      return;
    }
    if (!(await confirm({ title: "작업지시 저장", message: "입력한 작업지시를 저장하시겠습니까?", confirmLabel: "저장" }))) return;
    setFeatureMessage("");
    const sourceHeader = selectedHeader;
    await executeSave({
      execute: () => workOrderDataService.save({ Header: sourceHeader, Processes: selectedProcesses }, headers),
      onSuccess: (saved) => {
        const sourceKey = createWorkOrderHeaderKey(sourceHeader.CD_FIRM, sourceHeader.NO_WO);
        setHeaders((current) => [saved.Header, ...current.filter((header) => createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO) !== sourceKey)]);
        setProcesses((current) => [...current.filter((process) => createWorkOrderHeaderKey(process.CD_FIRM, process.NO_WO) !== sourceKey), ...saved.Processes]);
        selectMaster(createWorkOrderHeaderKey(saved.Header.CD_FIRM, saved.Header.NO_WO));
        setServerWarnings(saved.Warnings);
        clearDirty();
        const warnings = [...new Set(saved.Warnings)];
        notify(
          warnings.length > 0 ? "warning" : "success",
          warnings.length > 0
            ? `작업지시가 저장되었습니다. 단, ${warnings.join(" ")}`
            : "작업지시가 저장되었습니다."
        );
      },
      successMessage: "작업지시가 저장되었습니다.",
      errorMessage: (caughtError) => caughtError instanceof Error ? caughtError.message : "작업지시를 저장할 수 없습니다. 입력값을 확인하거나 다시 시도하세요."
    });
  };

  const handleDeleteWorkOrder = async () => {
    if (!selectedHeader) {
      const notice = "선택된 작업지시가 없습니다.";
      setMessage(notice);
      notify("info", notice);
      return;
    }
    const targetHeader = selectedHeader;
    if (!(await confirm({
      title: "작업지시 삭제",
      message: `작업지시번호 ${targetHeader.NO_WO}을 삭제하시겠습니까?`,
      description: "연결된 공정상세도 함께 삭제됩니다.",
      confirmLabel: "삭제",
      danger: true
    }))) return;
    setFeatureMessage("");
    await executeDelete({
      execute: () => workOrderDataService.delete(targetHeader.CD_FIRM, targetHeader.NO_WO),
      onSuccess: () => {
        const targetKey = createWorkOrderHeaderKey(targetHeader.CD_FIRM, targetHeader.NO_WO);
        setHeaders((current) => current.filter((header) => createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO) !== targetKey));
        setProcesses((current) => current.filter((process) => !(process.CD_FIRM === targetHeader.CD_FIRM && process.NO_WO === targetHeader.NO_WO)));
        selectMaster("");
        setCheckedProcessKeys([]);
        setServerWarnings([]);
        clearDirty();
        notify("success", "작업지시가 삭제되었습니다.");
      },
      successMessage: "작업지시가 삭제되었습니다.",
      errorMessage: "작업지시 삭제 중 오류가 발생했습니다."
    });
  };

  const handleOpenItemLookup = () => {
    if (!selectedHeader) {
      const notice = "생산품목을 적용할 작업지시를 먼저 선택하세요.";
      setMessage(notice);
      notify("info", "선택된 항목이 없습니다.");
      return;
    }
    setItemLookupOpen(true);
  };
  const handleOpenProductionLineLookup = () => {
    if (!selectedHeader) {
      const notice = "생산라인을 적용할 작업지시를 먼저 선택하세요.";
      setMessage(notice);
      notify("info", "선택된 항목이 없습니다.");
      return;
    }
    setProductionLineLookupOpen(true);
  };
  const handleOpenProcessLookup = () => {
    if (!selectedProcess) {
      const notice = "공정을 적용할 공정상세 행을 먼저 선택하세요.";
      setMessage(notice);
      notify("info", "대상 상세행이 없습니다.");
      return;
    }
    setProcessLookupOpen(true);
  };
  const handleOpenEquipmentLookup = () => {
    if (!selectedProcess) {
      const notice = "설비를 적용할 공정상세 행을 먼저 선택하세요.";
      setMessage(notice);
      notify("info", "대상 상세행이 없습니다.");
      return;
    }
    setEquipmentLookupOpen(true);
  };

  const handleSelectItem = (item: Item) => {
    if (!selectedHeader) return;
    const targetKey = createWorkOrderHeaderKey(selectedHeader.CD_FIRM, selectedHeader.NO_WO);
    setHeaders((current) => current.map((header) => createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO) === targetKey
      ? { ...header, CD_ITEM: item.CD_ITEM, NM_ITEM: item.NM_ITEM, STND_ITEM: item.STND_ITEM, UNIT_ITEM: item.UNIT_ITEM }
      : header));
    markWorkOrderDirty();
    notify("success", "생산품목 선택이 반영되었습니다.");
  };
  const handleSelectProductionLine = (line: ProductionLine) => {
    if (!selectedHeader) return;
    const targetKey = createWorkOrderHeaderKey(selectedHeader.CD_FIRM, selectedHeader.NO_WO);
    setHeaders((current) => current.map((header) => createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO) === targetKey
      ? { ...header, CD_LINE: line.CD_LINE, NM_LINE: line.NM_LINE }
      : header));
    markWorkOrderDirty();
    notify("success", "생산라인 선택이 반영되었습니다.");
  };
  const handleSelectProcess = (processCode: ProductionProcess) => {
    if (!selectedProcess) return;
    const targetKey = createWorkOrderProcessKey(selectedProcess.CD_FIRM, selectedProcess.NO_WO, selectedProcess.NO_PROC);
    setProcesses((current) => current.map((process) => createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC) === targetKey
      ? { ...process, CD_PROC: processCode.CD_PROC, NM_PROC: processCode.NM_PROC }
      : process));
    markWorkOrderDirty();
    notify("success", "공정 선택이 반영되었습니다.");
  };
  const handleSelectEquipment = (equipment: Equipment) => {
    if (!selectedProcess) return;
    const targetKey = createWorkOrderProcessKey(selectedProcess.CD_FIRM, selectedProcess.NO_WO, selectedProcess.NO_PROC);
    setProcesses((current) => current.map((process) => createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC) === targetKey
      ? { ...process, CD_EQUIP: equipment.CD_EQUIP, NM_EQUIP: equipment.NM_EQUIP }
      : process));
    markWorkOrderDirty();
    notify("success", "설비 선택이 반영되었습니다.");
  };

  const handleNavigate = async (page: NavigationPage) => {
    if (!(await confirmDiscardChanges())) return;
    clearDirty();
    onNavigate(page);
  };

  const headerColumns: readonly ErpDataGridColumn<WorkOrderHeader>[] = [
    { field: "CD_FIRM", headerName: "회사", width: 78, dataType: "code", editable: true, required: true },
    { field: "NO_WO", headerName: "작업지시번호", width: 140, dataType: "code", readOnly: true },
    { field: "DT_WO", headerName: "지시일자", width: 114, dataType: "date", editable: true, required: true },
    { field: "CD_ITEM", headerName: "품목코드", width: 112, dataType: "code", editable: true, required: true },
    { field: "NM_ITEM", headerName: "품목명", width: 150, editable: true },
    { field: "STND_ITEM", headerName: "규격", width: 135, editable: true },
    { field: "UNIT_ITEM", headerName: "단위", width: 58, editable: true },
    { field: "QT_WO", headerName: "지시수량", width: 92, dataType: "number", editable: true, required: true, align: "right" },
    { field: "QT_RESULT", headerName: "실적수량", width: 92, dataType: "number", editable: true, align: "right" },
    { field: "PROGRESS", headerName: "진척률", width: 80, readOnly: true, align: "right", formatter: (_value, row) => formatWorkOrderProgress(row) },
    { field: "DT_PLAN_START", headerName: "계획시작일", width: 114, dataType: "date", editable: true, required: true },
    { field: "DT_PLAN_END", headerName: "계획종료일", width: 114, dataType: "date", editable: true, required: true },
    { field: "CD_LINE", headerName: "생산라인", width: 100, dataType: "code", editable: true, required: true },
    { field: "NM_LINE", headerName: "생산라인명", width: 125, editable: true },
    { field: "ST_WO", headerName: "상태", width: 126, editable: true, editor: ({ value, onChange }) => <div className="erp-data-grid__status-editor"><select className="erp-data-grid__editor" onChange={(event) => onChange(event.target.value)} value={String(value)}>{workOrderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><span className={`badge ${statusClass(value as WorkOrderStatus)}`}>{String(value)}</span></div> },
    { field: "YN_URGENT", headerName: "긴급", width: 72, editable: true, editor: ({ value, onChange }) => <select className="erp-data-grid__editor" onChange={(event) => onChange(event.target.value)} value={String(value)}>{urgentOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select> },
    { field: "DC_RMK", headerName: "비고", width: 180, editable: true }
  ];
  const processColumns: readonly ErpDataGridColumn<WorkOrderProcess>[] = [
    { field: "NO_PROC", headerName: "공정순번", width: 78, dataType: "number", readOnly: true, align: "right" },
    { field: "CD_PROC", headerName: "공정코드", width: 110, dataType: "code", editable: true, required: true },
    { field: "NM_PROC", headerName: "공정명", width: 145, editable: true },
    { field: "CD_EQUIP", headerName: "설비코드", width: 110, dataType: "code", editable: true },
    { field: "NM_EQUIP", headerName: "설비명", width: 145, editable: true },
    { field: "QT_PLAN", headerName: "계획수량", width: 92, dataType: "number", editable: true, required: true, sum: true, align: "right" },
    { field: "QT_RESULT", headerName: "실적수량", width: 92, dataType: "number", editable: true, sum: true, align: "right" },
    { field: "TM_PLAN_START", headerName: "계획시작일시", width: 145, editable: true, required: true },
    { field: "TM_PLAN_END", headerName: "계획종료일시", width: 145, editable: true, required: true },
    { field: "ST_PROC", headerName: "공정상태", width: 94, editable: true, editor: ({ value, onChange }) => <select className="erp-data-grid__editor" onChange={(event) => onChange(event.target.value)} value={String(value)}>{processStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select> },
    { field: "DC_RMK", headerName: "비고", width: 170, editable: true }
  ];

  return <>
    <div className="erp-shell">
      <aside className="side-nav">
        <div className="brand"><Building2 size={20} /><strong>SMART ERP</strong></div>
        <nav>
          <div className="menu-title">영업관리</div>
          <div className="menu-group"><ChevronRight size={14} /><span>수주관리</span></div>
          <button className="menu-item" data-testid="nav-sales-order" onClick={() => void handleNavigate("sales")} type="button">수주등록</button>
          <div className="menu-title">구매관리</div>
          <div className="menu-group"><ChevronRight size={14} /><span>발주관리</span></div>
          <button className="menu-item" data-testid="nav-purchase-order" onClick={() => void handleNavigate("purchase")} type="button">발주등록</button>
          <div className="menu-title">생산관리</div>
          <div className="menu-group"><ChevronRight size={14} /><span>작업지시관리</span></div>
          <button className="menu-item active" data-testid="nav-work-order" type="button">작업지시등록</button>
          {showDevelopmentDataManager && <><div className="menu-title">개발 도구</div><button className="menu-item" data-testid="nav-development-data" onClick={() => void handleNavigate("development")} type="button">테스트 데이터 관리</button></>}
        </nav>
      </aside>
      <main aria-busy={processing} className="workbench">
        <header className="page-header">
          <div><h1 data-testid="work-order-page-title">작업지시등록</h1><p>PRT_WO / PRT_WOPROC Frontend Mock PoC</p></div>
          <PageToolbar processing={processing} actions={[
            { dataTestId: "wo-btn-search", label: isLoading ? "조회 중..." : "조회", icon: <Search size={15} />, onClick: () => void handleSearch(), disabled: isLoading },
            { dataTestId: "wo-btn-new", label: "신규", icon: <Plus size={15} />, onClick: () => void handleNew(), disabled: isSaving },
            { dataTestId: "wo-btn-add-process", label: "행추가", icon: <Rows3 size={15} />, onClick: handleAddProcess, disabled: isSaving },
            { dataTestId: "wo-btn-delete-process", label: "행삭제", icon: <Trash2 size={15} />, onClick: () => void handleDeleteProcess(), disabled: isSaving },
            { dataTestId: "wo-btn-save", label: isSaving ? "저장 중..." : "저장", icon: <Save size={15} />, onClick: () => void handleSave(), disabled: isSaving, variant: "primary" },
            { dataTestId: "wo-btn-delete", label: isSaving ? "삭제 중..." : "삭제", icon: <Trash2 size={15} />, onClick: () => void handleDeleteWorkOrder(), disabled: isSaving, variant: "danger" }
          ]} />
        </header>
        <SearchPanel message={message}>
          <label>회사코드<input data-testid="wo-filter-firm" value={filters.cdFirm} onChange={(event) => setFilters({ ...filters, cdFirm: event.target.value })} /></label>
          <label>지시일자 From<input data-testid="wo-filter-date-from" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
          <label>지시일자 To<input data-testid="wo-filter-date-to" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
          <label>작업지시번호<input data-testid="wo-filter-no" value={filters.noWo} onChange={(event) => setFilters({ ...filters, noWo: event.target.value })} /></label>
          <label>생산품목<input data-testid="wo-filter-item" value={filters.item} onChange={(event) => setFilters({ ...filters, item: event.target.value })} /></label>
          <label>생산라인<input data-testid="wo-filter-line" value={filters.line} onChange={(event) => setFilters({ ...filters, line: event.target.value })} /></label>
          <label>작업지시상태<select data-testid="wo-filter-status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">전체</option>{workOrderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>긴급지시 여부<select data-testid="wo-filter-urgent" value={filters.urgent} onChange={(event) => setFilters({ ...filters, urgent: event.target.value })}><option value="">전체</option>{urgentOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          {validationIssues.length > 0 && <span data-testid="work-order-validation-count">오류 {validationIssues.length}건</span>}
          {displayedWarning && <span data-testid="work-order-warning">경고: {displayedWarning}</span>}
        </SearchPanel>
        <section className="grid-section top-grid">
          <div className="section-title"><h2>작업지시 Header</h2><div className="section-title-actions"><span>PRT_WO · PK CD_FIRM + NO_WO</span><button className="section-lookup-button" data-testid="wo-btn-item-lookup" disabled={processing} onClick={handleOpenItemLookup} type="button"><Search size={14} />품목 도움</button><button className="section-lookup-button" data-testid="wo-btn-line-lookup" disabled={processing} onClick={handleOpenProductionLineLookup} type="button"><Search size={14} />라인 도움</button></div></div>
          <ErpDataGrid<WorkOrderHeader> ariaLabel="작업지시 Header" cellErrors={validationCellErrors} className="work-order-header-grid" columns={headerColumns} dataTestId="work-order-header-grid" emptyMessage="조회된 작업지시가 없습니다." onCellValueChange={(row, field, value) => { if (isHeaderEditableField(field)) updateHeader(row, field, value); }} onRowClick={(header) => void selectHeader(header)} rowKey={(header) => createWorkOrderHeaderKey(header.CD_FIRM, header.NO_WO)} rows={headers} selectedRowKey={selectedHeader ? createWorkOrderHeaderKey(selectedHeader.CD_FIRM, selectedHeader.NO_WO) : undefined} selectionMode="single" showFooter showRowNumbers />
        </section>
        <section className="grid-section bottom-grid">
          <div className="section-title"><h2>공정상세</h2><div className="section-title-actions"><span>PRT_WOPROC · PK CD_FIRM + NO_WO + NO_PROC</span><button className="section-lookup-button" data-testid="wo-btn-process-lookup" disabled={processing} onClick={handleOpenProcessLookup} type="button"><Search size={14} />공정 도움</button><button className="section-lookup-button" data-testid="wo-btn-equipment-lookup" disabled={processing} onClick={handleOpenEquipmentLookup} type="button"><Search size={14} />설비 도움</button></div></div>
          <ErpDataGrid<WorkOrderProcess> ariaLabel="공정상세" cellErrors={validationCellErrors} checkedRowKeys={checkedProcessKeys} className="work-order-process-grid" columns={processColumns} dataTestId="work-order-process-grid" emptyMessage="작업지시 행을 선택하면 공정상세가 표시됩니다." onCellValueChange={(row, field, value) => { if (isProcessEditableField(field)) updateProcess(row, field, value); }} onCheckedRowKeysChange={setCheckedProcessKeys} onRowClick={(process) => selectDetail(process.NO_PROC)} rowKey={(process) => createWorkOrderProcessKey(process.CD_FIRM, process.NO_WO, process.NO_PROC)} rows={selectedProcesses} selectedRowKey={selectedProcess ? createWorkOrderProcessKey(selectedProcess.CD_FIRM, selectedProcess.NO_WO, selectedProcess.NO_PROC) : undefined} selectionMode="multiple" showCheckboxes showFooter showRowNumbers />
        </section>
        <div className="sales-order-total-summary" data-testid="work-order-process-total-summary"><span>공정 건수 {quantity.format(selectedProcesses.length)}</span><span>계획수량 {quantity.format(processTotals.QT_PLAN)}</span><strong>실적수량 {quantity.format(processTotals.QT_RESULT)}</strong></div>
      </main>
    </div>

    <ErpLookupDialog<Item> columns={itemColumns} dataTestId="wo-item-lookup" emptyMessage="조회된 생산품목이 없습니다." onClose={() => setItemLookupOpen(false)} onSelect={handleSelectItem} open={itemLookupOpen} rowKey={(item) => `${item.CD_FIRM}::${item.CD_ITEM}`} rows={itemLookupRows} searchFields={["CD_ITEM", "NM_ITEM", "STND_ITEM"]} title="생산품목 도움" />
    <ErpLookupDialog<ProductionLine> columns={productionLineColumns} dataTestId="wo-line-lookup" emptyMessage="조회된 생산라인이 없습니다." onClose={() => setProductionLineLookupOpen(false)} onSelect={handleSelectProductionLine} open={productionLineLookupOpen} rowKey={(line) => `${line.CD_FIRM}::${line.CD_LINE}`} rows={productionLineLookupRows} searchFields={["CD_LINE", "NM_LINE"]} title="생산라인 도움" />
    <ErpLookupDialog<ProductionProcess> columns={processLookupColumns} dataTestId="wo-process-lookup" emptyMessage="조회된 공정이 없습니다." onClose={() => setProcessLookupOpen(false)} onSelect={handleSelectProcess} open={processLookupOpen} rowKey={(process) => `${process.CD_FIRM}::${process.CD_PROC}`} rows={processLookupRows} searchFields={["CD_PROC", "NM_PROC"]} title="공정 도움" />
    <ErpLookupDialog<Equipment> columns={equipmentColumns} dataTestId="wo-equipment-lookup" emptyMessage="조회된 설비가 없습니다." onClose={() => setEquipmentLookupOpen(false)} onSelect={handleSelectEquipment} open={equipmentLookupOpen} rowKey={(equipment) => `${equipment.CD_FIRM}::${equipment.CD_EQUIP}`} rows={equipmentLookupRows} searchFields={["CD_EQUIP", "NM_EQUIP", "CD_LINE"]} title="설비 도움" />
    <ErpDialog dataTestId="work-order-dialog-validation-summary" footer={<div className="erp-confirm-dialog__actions"><button className="erp-confirm-dialog__button" data-testid="work-order-dialog-validation-close" onClick={() => setValidationDialogOpen(false)} type="button">확인</button></div>} onClose={() => setValidationDialogOpen(false)} open={validationDialogOpen} title="저장 전 입력값 검증" width={560}>
      <div className="validation-summary"><p data-testid="work-order-validation-summary-count">저장할 수 없습니다. 입력값 {validationIssues.length}건을 확인하세요.</p><ul data-testid="work-order-validation-summary-list">{validationIssues.map((issue, index) => <li key={`${issue.scope}-${issue.rowKey ?? "screen"}-${issue.field ?? "message"}-${index}`}>{issue.message}</li>)}</ul></div>
    </ErpDialog>
  </>;
}
