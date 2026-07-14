import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  MailPlus,
  Plus,
  Rows3,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { ErpDataGrid } from "../../components/common/ErpDataGrid";
import type { ErpDataGridColumn, ErpDataGridCellValue } from "../../components/common/ErpDataGrid";
import { ErpDialog } from "../../components/common/ErpDialog";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import { toValidationCellErrors, type ValidationIssue } from "../../components/common/validation/validation";
import { mockItems } from "../common-code/item/mockData";
import type { Item } from "../common-code/item/types";
import { mockPartners } from "../common-code/partner/mockData";
import type { Partner } from "../common-code/partner/types";
import { mockSalesOrderHeaders, mockSalesOrderLines } from "./mockData";
import { MailOrderImportDialog } from "../mail-order/MailOrderImportDialog";
import { mapParsedOrderToSalesOrder } from "../mail-order/mailMapping";
import type { MailParseResult } from "../mail-order/types";
import type { SalesOrderHeader, SalesOrderLine, SalesOrderStatus } from "./types";
import {
  calculateSalesOrderLineAmounts,
  calculateSalesOrderLineTotals,
  createSalesOrderHeaderKey,
  createSalesOrderLineKey
} from "./utils";
import { validateSalesOrders } from "./validation";
import { isApiMode } from "../../api/apiClient";
import { getItems } from "../../api/itemApi";
import { getPartners } from "../../api/partnerApi";
import {
  createSalesOrder,
  deleteSalesOrder,
  getSalesOrders,
  updateSalesOrder
} from "../../api/salesOrderApi";
import { useCrudPage } from "../../hooks/useCrudPage";
import { useMasterDetailSelection } from "../../hooks/useMasterDetailSelection";

type HeaderEditableField = Exclude<keyof SalesOrderHeader, "NO_SO">;
type LineEditableField = Exclude<
  keyof SalesOrderLine,
  "CD_FIRM" | "NO_SO" | "NO_LINE" | "AM_SUPPLY" | "AM_VAT" | "AM_TOTAL"
>;

const statusOptions: SalesOrderStatus[] = ["신규", "진행", "확정", "마감"];
const money = new Intl.NumberFormat("ko-KR");

const partnerLookupColumns: readonly ErpDataGridColumn<Partner>[] = [
  { field: "CD_FIRM", headerName: "회사코드", width: 90, align: "center" },
  { field: "CD_PARTNER", headerName: "거래처코드", width: 120, dataType: "code" },
  { field: "NM_PARTNER", headerName: "거래처명", width: 180 },
  { field: "NO_COMPANY", headerName: "사업자번호", width: 130, dataType: "code" },
  { field: "YN_USE", headerName: "사용", width: 64, align: "center" }
];

const itemLookupColumns: readonly ErpDataGridColumn<Item>[] = [
  { field: "CD_FIRM", headerName: "회사코드", width: 90, align: "center" },
  { field: "CD_ITEM", headerName: "품목코드", width: 120, dataType: "code" },
  { field: "NM_ITEM", headerName: "품목명", width: 190 },
  { field: "STND_ITEM", headerName: "규격", width: 150 },
  { field: "UNIT_ITEM", headerName: "단위", width: 70, align: "center" },
  { field: "YN_USE", headerName: "사용", width: 64, align: "center" }
];

const partnerSearchFields: readonly (keyof Partner)[] = [
  "CD_PARTNER",
  "NM_PARTNER",
  "NO_COMPANY"
];
const itemSearchFields: readonly (keyof Item)[] = ["CD_ITEM", "NM_ITEM", "STND_ITEM"];

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function createTempOrderNo(index: number) {
  return `TEMP_SO_${String(index).padStart(3, "0")}`;
}

function createSavedOrderNo(yearMonth: string, index: number) {
  return `SO${yearMonth}${String(index).padStart(4, "0")}`;
}

function getNextSavedOrderIndex(headers: SalesOrderHeader[], yearMonth: string) {
  const numbers = headers
    .map((header) => header.NO_SO.match(new RegExp(`^SO${yearMonth}(\\d{4})$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);

  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

function createEmptyHeader(noSo: string): SalesOrderHeader {
  return {
    CD_FIRM: "1000",
    NO_SO: noSo,
    DT_SO: today(),
    CD_PARTNER: "",
    NM_PARTNER: "",
    CD_EMP: "",
    ST_SO: "신규",
    DC_RMK: ""
  };
}

function createEmptyLine(header: SalesOrderHeader, noLine: number): SalesOrderLine {
  return {
    CD_FIRM: header.CD_FIRM,
    NO_SO: header.NO_SO,
    NO_LINE: noLine,
    CD_ITEM: "",
    NM_ITEM: "",
    STND_ITEM: "",
    UNIT_ITEM: "",
    QT_SO: 0,
    UM_SO: 0,
    AM_SUPPLY: 0,
    AM_VAT: 0,
    AM_TOTAL: 0,
    DT_DLV: today(),
    DC_RMK: ""
  };
}

function statusClass(status: SalesOrderStatus) {
  const classMap: Record<SalesOrderStatus, string> = {
    신규: "status-new",
    진행: "status-progress",
    확정: "status-confirmed",
    마감: "status-closed"
  };
  return classMap[status];
}

function toNumber(value: ErpDataGridCellValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPartnerRowKey(partner: Partner) {
  return `${partner.CD_FIRM}::${partner.CD_PARTNER}`;
}

function getItemRowKey(item: Pick<Item, "CD_FIRM" | "CD_ITEM">) {
  return `${item.CD_FIRM}::${item.CD_ITEM}`;
}

function isHeaderEditableField(field: keyof SalesOrderHeader): field is HeaderEditableField {
  return field !== "NO_SO";
}

function isLineEditableField(field: keyof SalesOrderLine): field is LineEditableField {
  return (
    field === "CD_ITEM" ||
    field === "NM_ITEM" ||
    field === "STND_ITEM" ||
    field === "UNIT_ITEM" ||
    field === "QT_SO" ||
    field === "UM_SO" ||
    field === "DT_DLV" ||
    field === "DC_RMK"
  );
}

export function SalesOrderRegistration() {
  const [headers, setHeaders] = useState<SalesOrderHeader[]>([]);
  const [lines, setLines] = useState<SalesOrderLine[]>([]);
  const {
    selectedMasterKey: selectedNoSo,
    selectedDetailKey: selectedLine,
    selectMaster,
    selectDetail
  } = useMasterDetailSelection<string, number | null>("", null);
  const {
    isLoading,
    isSaving,
    error,
    successMessage,
    clearMessage,
    executeSearch,
    executeCreate,
    executeSave,
    executeDelete
  } = useCrudPage();
  const [checkedLineKeys, setCheckedLineKeys] = useState<string[]>([]);
  const [featureMessage, setFeatureMessage] = useState("");
  const [tempSeq, setTempSeq] = useState(1);
  const [partnerLookupOpen, setPartnerLookupOpen] = useState(false);
  const [itemLookupOpen, setItemLookupOpen] = useState(false);
  const [deleteLineDialogOpen, setDeleteLineDialogOpen] = useState(false);
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [mailImportOpen, setMailImportOpen] = useState(false);
  const [appliedMailIds, setAppliedMailIds] = useState<string[]>([]);
  const [selectedPartnerRowKey, setSelectedPartnerRowKey] = useState<string | null>(null);
  const [partners, setPartners] = useState<Partner[]>(mockPartners);
  const [items, setItems] = useState<Item[]>(mockItems);
  const [filters, setFilters] = useState({
    cdFirm: "1000",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    cdPartner: "",
    nmPartner: ""
  });

  const message = error ?? successMessage ?? featureMessage;
  const setMessage = (nextMessage: string) => {
    clearMessage();
    setFeatureMessage(nextMessage);
  };

  const selectedHeader = headers.find((header) => header.NO_SO === selectedNoSo);
  const validationIssues = useMemo(() => validateSalesOrders(headers, lines), [headers, lines]);
  const validationCellErrors = useMemo(
    () => toValidationCellErrors(validationIssues),
    [validationIssues]
  );
  const selectedLineData = lines.find(
    (line) => line.NO_SO === selectedNoSo && line.NO_LINE === selectedLine
  );
  const partnerLookupRows = partners.filter(
    (partner) => !filters.cdFirm || partner.CD_FIRM === filters.cdFirm
  );
  const itemLookupRows = items.filter(
    (item) => !selectedLineData?.CD_FIRM || item.CD_FIRM === selectedLineData.CD_FIRM
  );

  const visibleHeaders = useMemo(() => {
    return headers.filter((header) => {
      if (header.NO_SO.startsWith("TEMP_SO_")) return true;

      const firmMatched = !filters.cdFirm || header.CD_FIRM.includes(filters.cdFirm);
      const partnerMatched =
        (!filters.cdPartner || header.CD_PARTNER.includes(filters.cdPartner)) &&
        (!filters.nmPartner || header.NM_PARTNER.includes(filters.nmPartner));
      const dateMatched =
        (!filters.dateFrom || header.DT_SO >= filters.dateFrom) &&
        (!filters.dateTo || header.DT_SO <= filters.dateTo);
      return firmMatched && partnerMatched && dateMatched;
    });
  }, [filters, headers]);

  useEffect(() => {
    if (!isApiMode()) return;

    Promise.all([getPartners(), getItems()])
      .then(([nextPartners, nextItems]) => {
        setPartners(nextPartners);
        setItems(nextItems);
      })
      .catch(() => setMessage("API Lookup 데이터를 불러오지 못했습니다."));
  }, []);

  useLayoutEffect(() => {
    if (visibleHeaders.some((header) => header.NO_SO === selectedNoSo)) return;

    const nextSelectedNoSo = visibleHeaders[0]?.NO_SO ?? "";
    if (nextSelectedNoSo === selectedNoSo) return;

    selectMaster(nextSelectedNoSo);
    setCheckedLineKeys([]);
  }, [selectMaster, selectedNoSo, visibleHeaders]);

  const selectedLines = lines
    .filter((line) => line.NO_SO === selectedNoSo)
    .sort((a, b) => a.NO_LINE - b.NO_LINE);
  const selectedLineTotals = calculateSalesOrderLineTotals(selectedLines);
  const checkedLines = selectedLines.filter((line) =>
    checkedLineKeys.includes(createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE))
  );
  const deleteTargetLines = checkedLines.length > 0 ? checkedLines : selectedLineData ? [selectedLineData] : [];

  const focusValidationIssue = (issue: ValidationIssue) => {
    if (!issue.rowKey || !issue.field) return;
    const gridTestId = issue.scope === "header" ? "sales-order-header-grid" : "sales-order-line-grid";
    const editorTestId = `${gridTestId}-cell-${issue.rowKey}-${issue.field}`;
    const containerTestId = `${gridTestId}-cell-container-${issue.rowKey}-${issue.field}`;

    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-testid="${editorTestId}"], [data-testid="${containerTestId}"]`
      );
      target?.focus();
    });
  };

  const selectHeader = (header: SalesOrderHeader) => {
    selectMaster(header.NO_SO);
    setCheckedLineKeys([]);
  };

  const updateHeader = (noSo: string, field: HeaderEditableField, value: string) => {
    setHeaders((current) =>
      current.map((header) => (header.NO_SO === noSo ? { ...header, [field]: value } : header))
    );

    if (field === "CD_FIRM") {
      setLines((current) =>
        current.map((line) => (line.NO_SO === noSo ? { ...line, CD_FIRM: value } : line))
      );
      setCheckedLineKeys([]);
    }
  };

  const updateLine = (noSo: string, noLine: number, field: LineEditableField, value: ErpDataGridCellValue) => {
    setLines((current) =>
      current.map((line) => {
        if (line.NO_SO !== noSo || line.NO_LINE !== noLine) return line;

        if (field === "QT_SO" || field === "UM_SO") {
          const nextLine = { ...line, [field]: toNumber(value) };
          return {
            ...nextLine,
            ...calculateSalesOrderLineAmounts(nextLine.QT_SO, nextLine.UM_SO)
          };
        }

        return { ...line, [field]: String(value ?? "") };
      })
    );
  };

  const loadSalesOrderData = async () => {
    if (isApiMode()) {
      const orders = await getSalesOrders();
      return {
        headers: orders.map((order) => order.Header),
        lines: orders.flatMap((order) => order.Lines),
        source: "api" as const
      };
    }

    return {
      headers: mockSalesOrderHeaders.map((header) => ({ ...header })),
      lines: mockSalesOrderLines.map((line) => ({ ...line })),
      source: "mock" as const
    };
  };

  const handleSearch = async () => {
    setFeatureMessage("");
    await executeSearch({
      execute: loadSalesOrderData,
      onSuccess: ({ headers: nextHeaders, lines: nextLines }) => {
        setHeaders(nextHeaders);
        setLines(nextLines);
        selectMaster(nextHeaders[0]?.NO_SO ?? "");
        setCheckedLineKeys([]);
      },
      successMessage: (result) =>
        result.source === "api" ? "API 조회가 완료되었습니다." : "조회되었습니다",
      errorMessage: "API 수주 데이터를 불러오지 못했습니다."
    });
  };

  const handleSelectPartner = (partner: Partner) => {
    setSelectedPartnerRowKey(getPartnerRowKey(partner));
    setFilters((current) => ({
      ...current,
      cdPartner: partner.CD_PARTNER,
      nmPartner: partner.NM_PARTNER
    }));
    setMessage(`${partner.NM_PARTNER} 거래처가 조회조건에 반영되었습니다`);
  };

  const handleOpenItemLookup = () => {
    if (!selectedNoSo || selectedLine === null || !selectedLineData) {
      setMessage("품목을 적용할 수주상세 행을 먼저 선택하세요");
      return;
    }

    setItemLookupOpen(true);
  };

  const handleSelectItem = (item: Item) => {
    if (!selectedNoSo || selectedLine === null) {
      setMessage("품목을 적용할 수주상세 행을 찾을 수 없습니다");
      return;
    }

    setLines((current) =>
      current.map((line) =>
        line.NO_SO === selectedNoSo && line.NO_LINE === selectedLine
          ? {
              ...line,
              CD_ITEM: item.CD_ITEM,
              NM_ITEM: item.NM_ITEM,
              STND_ITEM: item.STND_ITEM,
              UNIT_ITEM: item.UNIT_ITEM
            }
          : line
      )
    );
    setMessage(`${item.NM_ITEM} 품목이 ${selectedLine}번 행에 반영되었습니다`);
  };

  const handleNew = async () => {
    const tempNo = createTempOrderNo(tempSeq);
    const nextHeader = createEmptyHeader(tempNo);
    setFeatureMessage("");
    await executeCreate({
      execute: () => {
        setHeaders((current) => [nextHeader, ...current]);
        selectMaster(tempNo);
        setCheckedLineKeys([]);
        setTempSeq((seq) => seq + 1);
        return nextHeader;
      },
      successMessage: "신규 수주 행이 추가되었습니다"
    });
  };

  const handleApplyMailOrder = (result: MailParseResult) => {
    const mailId = result.header.MAIL_ID.value;
    if (!mailId) return { success: false, message: "메일 ID를 확인할 수 없어 반영할 수 없습니다." };
    if (appliedMailIds.includes(mailId)) {
      return { success: false, message: "동일 MAIL_ID가 이미 반영되었습니다. 중복 반영할 수 없습니다." };
    }

    const temporaryOrderNo = createTempOrderNo(tempSeq);
    const mappedOrder = mapParsedOrderToSalesOrder(result, temporaryOrderNo);
    if (!mappedOrder) return { success: false, message: "파싱 결과가 완전하지 않아 수주등록에 반영할 수 없습니다." };

    const issues = validateSalesOrders([mappedOrder.header], mappedOrder.lines);
    if (issues.length > 0) {
      return { success: false, message: `기존 수주 검증 오류 ${issues.length}건으로 반영을 중단했습니다.` };
    }

    setHeaders((current) => [mappedOrder.header, ...current]);
    setLines((current) => [...current, ...mappedOrder.lines]);
    selectMaster(temporaryOrderNo);
    selectDetail(mappedOrder.lines[0]?.NO_LINE ?? null);
    setCheckedLineKeys([]);
    setTempSeq((sequence) => sequence + 1);
    setAppliedMailIds((current) => [...current, mailId]);
    setMessage(`메일 ${mailId}의 수주를 신규 임시번호로 반영했습니다. 담당자 검토 후 저장하세요.`);
    return { success: true, message: "수주등록 화면에 반영했습니다." };
  };

  const handleAddLine = () => {
    if (!selectedHeader) {
      setMessage("수주정보를 먼저 선택하세요");
      return;
    }

    const currentLines = lines.filter((line) => line.NO_SO === selectedHeader.NO_SO);
    const nextNoLine =
      currentLines.length === 0 ? 1 : Math.max(...currentLines.map((line) => line.NO_LINE)) + 1;
    const nextLine = createEmptyLine(selectedHeader, nextNoLine);
    setLines((current) => [...current, nextLine]);
    selectDetail(nextNoLine);
    setCheckedLineKeys([]);
    setMessage("수주상세 행이 추가되었습니다");
  };

  const handleDeleteLine = () => {
    if (deleteTargetLines.length === 0) {
      setMessage("삭제할 수주상세 행을 선택하거나 체크하세요");
      return;
    }

    setDeleteLineDialogOpen(true);
  };

  const confirmDeleteLine = () => {
    if (!selectedNoSo || deleteTargetLines.length === 0) {
      setDeleteLineDialogOpen(false);
      setMessage("삭제할 수주상세 행을 선택하거나 체크하세요");
      return;
    }

    const targetKeys = new Set(
      deleteTargetLines.map((line) => createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE))
    );

    setLines((current) => {
      const retained = current.filter(
        (line) => !targetKeys.has(createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE))
      );
      const currentOrderLines = retained
        .filter((line) => line.NO_SO === selectedNoSo)
        .sort((a, b) => a.NO_LINE - b.NO_LINE);
      const resequencedLineNumbers = new Map(
        currentOrderLines.map((line, index) => [
          createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE),
          index + 1
        ])
      );

      return retained.map((line) => {
        if (line.NO_SO !== selectedNoSo) return line;
        const nextLineNo = resequencedLineNumbers.get(
          createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE)
        );
        return nextLineNo === undefined ? line : { ...line, NO_LINE: nextLineNo };
      });
    });
    setDeleteLineDialogOpen(false);
    selectDetail(null);
    setCheckedLineKeys([]);
    setMessage(`${deleteTargetLines.length}건의 수주상세 행이 삭제되었습니다`);
  };

  const saveSalesOrder = async () => {
    const issues = validateSalesOrders(headers, lines);
    if (issues.length > 0) {
      setValidationDialogOpen(true);
      setMessage(`저장 전 검증 오류 ${issues.length}건을 확인하세요.`);
      focusValidationIssue(issues[0]);
      return;
    }

    if (isApiMode()) {
      if (!selectedHeader) {
        setMessage("저장할 수주 정보를 선택하세요.");
        return;
      }

      const isNewOrder = selectedHeader.NO_SO.startsWith("TEMP_SO_");
      const yearMonth = today().slice(0, 7).replace("-", "");
      const savedOrderNo = isNewOrder
        ? createSavedOrderNo(yearMonth, getNextSavedOrderIndex(headers, yearMonth))
        : selectedHeader.NO_SO;
      const headerToSave = {
        ...selectedHeader,
        NO_SO: savedOrderNo
      };
      const linesToSave = selectedLines.map((line) => ({
        ...line,
        CD_FIRM: headerToSave.CD_FIRM,
        NO_SO: savedOrderNo
      }));

      try {
        const saved = isNewOrder
          ? await createSalesOrder({ Header: headerToSave, Lines: linesToSave })
          : await updateSalesOrder(headerToSave.CD_FIRM, savedOrderNo, { Header: headerToSave, Lines: linesToSave });
        setHeaders((current) => [saved.Header, ...current.filter((header) => header.NO_SO !== selectedHeader.NO_SO)]);
        setLines((current) => [...current.filter((line) => line.NO_SO !== selectedHeader.NO_SO), ...saved.Lines]);
        selectMaster(saved.Header.NO_SO);
        setCheckedLineKeys([]);
        setMessage("API 서버에 저장되었습니다.");
      } catch {
        throw new Error("API 저장에 실패했습니다. 서버 Validation 결과를 확인하세요.");
      }
      return;
    }

    const yearMonth = today().slice(0, 7).replace("-", "");
    let nextIndex = getNextSavedOrderIndex(headers, yearMonth);
    const noMap = new Map<string, string>();

    const savedHeaders = headers.map((header) => {
      if (!header.NO_SO.startsWith("TEMP_SO_")) return header;

      const nextNoSo = createSavedOrderNo(yearMonth, nextIndex);
      nextIndex += 1;
      noMap.set(header.NO_SO, nextNoSo);

      return {
        ...header,
        NO_SO: nextNoSo,
        ST_SO: header.ST_SO === "신규" ? "진행" : header.ST_SO
      };
    });

    const savedLines = lines.map((line) => {
      const savedNoSo = noMap.get(line.NO_SO);
      if (!savedNoSo) return line;

      const savedHeader = savedHeaders.find((header) => header.NO_SO === savedNoSo);
      return {
        ...line,
        CD_FIRM: savedHeader?.CD_FIRM ?? line.CD_FIRM,
        NO_SO: savedNoSo
      };
    });

    setHeaders(savedHeaders);
    setLines(savedLines);
    selectMaster(noMap.get(selectedNoSo) ?? selectedNoSo);
    setCheckedLineKeys([]);
    console.log("SAL_SOH", savedHeaders);
    console.log("SAL_SOL", savedLines);
    setMessage("저장되었습니다");
  };

  const handleSave = async () => {
    setFeatureMessage("");
    await executeSave({
      validate: () => {
        const issues = validateSalesOrders(headers, lines);
        if (issues.length > 0) {
          setValidationDialogOpen(true);
          setMessage(`저장 전 검증 오류 ${issues.length}건을 확인하세요.`);
          focusValidationIssue(issues[0]);
          return false;
        }
        if (isApiMode() && !selectedHeader) {
          setMessage("저장할 수주 정보를 선택하세요.");
          return false;
        }
        return true;
      },
      execute: saveSalesOrder,
      successMessage: isApiMode() ? "API 서버에 저장되었습니다." : "저장되었습니다",
      errorMessage: "API 저장에 실패했습니다. 서버 Validation 결과를 확인하세요."
    });
  };

  const deleteSalesOrderAction = async () => {
    if (!selectedNoSo) {
      setMessage("삭제할 수주정보를 선택하세요");
      return;
    }

    if (isApiMode()) {
      const orderToDelete = headers.find((header) => header.NO_SO === selectedNoSo);
      if (!orderToDelete) return;
      try {
        await deleteSalesOrder(orderToDelete.CD_FIRM, orderToDelete.NO_SO);
      } catch {
        throw new Error("API 삭제에 실패했습니다.");
      }
    }

    setHeaders((current) => current.filter((header) => header.NO_SO !== selectedNoSo));
    setLines((current) => current.filter((line) => line.NO_SO !== selectedNoSo));
    selectMaster("");
    setCheckedLineKeys([]);
    setMessage("선택된 수주정보가 삭제되었습니다");
  };

  const handleDeleteOrder = async () => {
    if (!selectedNoSo) {
      setMessage("삭제할 수주정보를 선택하세요");
      return;
    }

    setFeatureMessage("");
    await executeDelete({
      execute: deleteSalesOrderAction,
      successMessage: "선택된 수주정보가 삭제되었습니다",
      errorMessage: "API 삭제에 실패했습니다."
    });
  };

  const headerGridColumns: readonly ErpDataGridColumn<SalesOrderHeader>[] = [
    { field: "CD_FIRM", headerName: "회사코드", width: 90, dataType: "code", editable: true, required: true },
    { field: "NO_SO", headerName: "수주번호", width: 142, dataType: "code", readOnly: true },
    { field: "DT_SO", headerName: "수주일자", width: 128, dataType: "date", align: "center", editable: true, required: true },
    { field: "CD_PARTNER", headerName: "거래처코드", width: 120, dataType: "code", editable: true, required: true },
    { field: "NM_PARTNER", headerName: "거래처명", width: 150, editable: true },
    { field: "CD_EMP", headerName: "담당자코드", width: 110, dataType: "code", editable: true },
    {
      field: "ST_SO",
      headerName: "수주상태",
      width: 155,
      editor: ({ value, onChange }) => (
        <div className="erp-data-grid__status-editor">
          <select
            className="erp-data-grid__editor"
            onChange={(event) => onChange(event.target.value)}
            value={String(value)}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <span className={`badge ${statusClass(value as SalesOrderStatus)}`}>{String(value)}</span>
        </div>
      ),
      editable: true
    },
    { field: "DC_RMK", headerName: "비고", width: 210, editable: true }
  ];

  const lineGridColumns: readonly ErpDataGridColumn<SalesOrderLine>[] = [
    { field: "CD_FIRM", headerName: "회사코드", width: 82, dataType: "code", readOnly: true },
    { field: "NO_SO", headerName: "수주번호", width: 130, dataType: "code", readOnly: true },
    { field: "NO_LINE", headerName: "라인", width: 58, dataType: "number", readOnly: true },
    {
      field: "CD_ITEM",
      headerName: "품목코드",
      width: 116,
      dataType: "code",
      editable: true,
      required: true
    },
    { field: "NM_ITEM", headerName: "품목명", width: 170, editable: true },
    { field: "STND_ITEM", headerName: "규격", width: 140, editable: true },
    { field: "UNIT_ITEM", headerName: "단위", width: 68, editable: true },
    {
      field: "QT_SO",
      headerName: "수주수량",
      width: 98,
      align: "right",
      dataType: "number",
      editable: true,
      required: true,
      sum: true
    },
    {
      field: "UM_SO",
      headerName: "단가",
      width: 112,
      align: "right",
      dataType: "number",
      editable: true,
      required: true
    },
    {
      field: "AM_SUPPLY",
      headerName: "공급가액",
      width: 126,
      align: "right",
      dataType: "number",
      readOnly: true,
      sum: true,
      formatter: (value) => money.format(Number(value))
    },
    {
      field: "AM_VAT",
      headerName: "부가세",
      width: 112,
      align: "right",
      dataType: "number",
      readOnly: true,
      sum: true,
      formatter: (value) => money.format(Number(value))
    },
    {
      field: "AM_TOTAL",
      headerName: "합계금액",
      width: 132,
      align: "right",
      dataType: "number",
      readOnly: true,
      sum: true,
      formatter: (value) => money.format(Number(value))
    },
    {
      field: "DT_DLV",
      headerName: "납기일자",
      width: 126,
      align: "center",
      dataType: "date",
      editable: true,
      required: true
    },
    { field: "DC_RMK", headerName: "비고", width: 190, editable: true }
  ];

  return (
    <>
      <div className="erp-shell">
        <aside className="side-nav">
          <div className="brand">
            <Building2 size={20} />
            <strong>SMART ERP</strong>
          </div>
          <nav>
            <div className="menu-title">영업관리</div>
            <div className="menu-group">
              <ChevronRight size={14} />
              <span>수주관리</span>
            </div>
            <button className="menu-item active">수주등록</button>
          </nav>
        </aside>

        <main aria-busy={isLoading || isSaving} className="workbench">
          <header className="page-header">
            <div>
              <h1 data-testid="page-title">수주등록</h1>
              <p>SAL_SOH / SAL_SOL mock 데이터 입력 샘플</p>
            </div>
            <div className="button-bar">
              <button data-testid="btn-search" disabled={isLoading} onClick={handleSearch}>
                <Search size={15} />
                조회
              </button>
              <button data-testid="btn-new" disabled={isSaving} onClick={handleNew}>
                <Plus size={15} />
                신규
              </button>
              <button data-testid="btn-mail-import" onClick={() => setMailImportOpen(true)}>
                <MailPlus size={15} />
                메일 수주 불러오기
              </button>
              <button data-testid="btn-add-line" onClick={handleAddLine}>
                <Rows3 size={15} />
                행추가
              </button>
              <button data-testid="btn-delete-line" onClick={handleDeleteLine}>
                <Trash2 size={15} />
                행삭제
              </button>
              <button className="primary" data-testid="btn-save" disabled={isSaving} onClick={handleSave}>
                <Save size={15} />
                저장
              </button>
              <button className="danger" data-testid="btn-delete-order" disabled={isSaving} onClick={handleDeleteOrder}>
                <Trash2 size={15} />
                삭제
              </button>
            </div>
          </header>

          <section className="search-panel" aria-label="조회조건">
            <label>
              회사코드
              <input
                value={filters.cdFirm}
                onChange={(event) => {
                  setFilters({
                    ...filters,
                    cdFirm: event.target.value,
                    cdPartner: "",
                    nmPartner: ""
                  });
                  setSelectedPartnerRowKey(null);
                }}
              />
            </label>
            <label>
              수주일자 From
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })}
              />
            </label>
            <label>
              수주일자 To
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })}
              />
            </label>
            <div className="search-field partner-filter">
              <span className="field-label">거래처</span>
              <div className="lookup-input-group">
                <input
                  aria-label="거래처코드"
                  className="mono"
                  data-testid="filter-partner-code"
                  placeholder="거래처코드"
                  value={filters.cdPartner}
                  onChange={(event) => {
                    setFilters({ ...filters, cdPartner: event.target.value, nmPartner: "" });
                    setSelectedPartnerRowKey(null);
                  }}
                />
                <input
                  aria-label="거래처명"
                  data-testid="filter-partner-name"
                  placeholder="거래처명"
                  readOnly
                  value={filters.nmPartner}
                />
                <button
                  aria-label="거래처 도움창 열기"
                  className="lookup-open-button"
                  data-testid="btn-partner-lookup"
                  onClick={() => setPartnerLookupOpen(true)}
                  title="거래처 도움창"
                  type="button"
                >
                  <Search size={14} />
                </button>
              </div>
            </div>
            <div className="status-message">
              <span data-testid="status-message">{message}</span>
              {validationIssues.length > 0 && (
                <span data-testid="validation-error-count">오류 {validationIssues.length}건</span>
              )}
            </div>
          </section>

          <section className="grid-section top-grid">
            <div className="section-title">
              <h2>수주정보</h2>
              <span>SAL_SOH · PK CD_FIRM + NO_SO</span>
            </div>
            <ErpDataGrid<SalesOrderHeader>
              ariaLabel="수주정보"
              cellErrors={validationCellErrors}
              className="sales-order-header-grid"
              columns={headerGridColumns}
              dataTestId="sales-order-header-grid"
              emptyMessage="조회 버튼을 눌러 mock 수주정보를 불러오세요."
              onCellValueChange={(row, field, value) => {
                if (isHeaderEditableField(field)) updateHeader(row.NO_SO, field, String(value ?? ""));
              }}
              onRowClick={selectHeader}
              rowKey={(header) => createSalesOrderHeaderKey(header.CD_FIRM, header.NO_SO)}
              rows={visibleHeaders}
              selectedRowKey={
                selectedHeader
                  ? createSalesOrderHeaderKey(selectedHeader.CD_FIRM, selectedHeader.NO_SO)
                  : undefined
              }
              selectionMode="single"
              showFooter
              showRowNumbers
            />
          </section>

          <section className="grid-section bottom-grid">
            <div className="section-title">
              <h2>수주상세</h2>
              <div className="section-title-actions">
                <span>SAL_SOL · PK CD_FIRM + NO_SO + NO_LINE</span>
                <button
                  className="section-lookup-button"
                  data-testid="btn-item-lookup"
                  onClick={handleOpenItemLookup}
                  type="button"
                >
                  <Search size={14} />
                  품목 도움
                </button>
              </div>
            </div>
            <ErpDataGrid<SalesOrderLine>
              ariaLabel="수주상세"
              cellErrors={validationCellErrors}
              checkedRowKeys={checkedLineKeys}
              className="sales-order-line-grid"
              columns={lineGridColumns}
              dataTestId="sales-order-line-grid"
              emptyMessage="수주정보 행을 선택하면 상세 목록이 표시됩니다."
              onCellValueChange={(row, field, value) => {
                if (isLineEditableField(field)) updateLine(row.NO_SO, row.NO_LINE, field, value);
              }}
              onCheckedRowKeysChange={setCheckedLineKeys}
              onRowClick={(line) => selectDetail(line.NO_LINE)}
              rowKey={(line) => createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE)}
              rows={selectedLines}
              selectedRowKey={
                selectedLineData
                  ? createSalesOrderLineKey(
                      selectedLineData.CD_FIRM,
                      selectedLineData.NO_SO,
                      selectedLineData.NO_LINE
                    )
                  : undefined
              }
              selectionMode="multiple"
              showCheckboxes
              showFooter
              showRowNumbers
            />
          </section>

          <div
            className="sales-order-total-summary"
            aria-label="수주상세 합계"
            data-testid="sales-order-total-summary"
          >
            <span>수량 {money.format(selectedLineTotals.QT_SO)}</span>
            <span>공급가액 {money.format(selectedLineTotals.AM_SUPPLY)}</span>
            <span>부가세 {money.format(selectedLineTotals.AM_VAT)}</span>
            <strong>합계금액 {money.format(selectedLineTotals.AM_TOTAL)}</strong>
          </div>
        </main>
      </div>

      <ErpLookupDialog<Partner>
        columns={partnerLookupColumns}
        dataTestId="partner-lookup"
        emptyMessage="조회된 거래처가 없습니다."
        height={500}
        onClose={() => setPartnerLookupOpen(false)}
        onSelect={handleSelectPartner}
        open={partnerLookupOpen}
        rowKey={getPartnerRowKey}
        rows={partnerLookupRows}
        searchFields={partnerSearchFields}
        selectedRowKey={selectedPartnerRowKey}
        title="거래처 도움창"
        width={760}
      />

      <MailOrderImportDialog
        appliedMailIds={appliedMailIds}
        onApply={handleApplyMailOrder}
        onClose={() => setMailImportOpen(false)}
        open={mailImportOpen}
      />

      <ErpLookupDialog<Item>
        columns={itemLookupColumns}
        dataTestId="item-lookup"
        emptyMessage="조회된 품목이 없습니다."
        height={520}
        onClose={() => setItemLookupOpen(false)}
        onSelect={handleSelectItem}
        open={itemLookupOpen}
        rowKey={getItemRowKey}
        rows={itemLookupRows}
        searchFields={itemSearchFields}
        selectedRowKey={
          selectedLineData?.CD_ITEM
            ? getItemRowKey(selectedLineData)
            : undefined
        }
        title="품목 도움창"
        width={820}
      />

      <ErpDialog
        dataTestId="dialog-validation-summary"
        footer={
          <div className="erp-confirm-dialog__actions">
            <button
              className="erp-confirm-dialog__button"
              data-testid="dialog-validation-close"
              onClick={() => setValidationDialogOpen(false)}
              type="button"
            >
              확인
            </button>
          </div>
        }
        height={420}
        onClose={() => setValidationDialogOpen(false)}
        open={validationDialogOpen}
        title="저장 전 입력값 검증"
        width={560}
      >
        <div className="validation-summary">
          <p data-testid="validation-summary-count">검증 오류 {validationIssues.length}건으로 저장이 중단되었습니다.</p>
          <ul data-testid="validation-summary-list">
            {validationIssues.map((issue, index) => (
              <li key={`${issue.scope}-${issue.rowKey ?? "screen"}-${issue.field ?? "message"}-${index}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      </ErpDialog>

      <ErpDialog
        footer={
          <div className="erp-confirm-dialog__actions">
            <button
              className="erp-confirm-dialog__button erp-confirm-dialog__button--danger"
              data-testid="dialog-delete-line-confirm"
              onClick={confirmDeleteLine}
              type="button"
            >
              삭제
            </button>
            <button
              className="erp-confirm-dialog__button"
              data-testid="dialog-delete-line-cancel"
              onClick={() => setDeleteLineDialogOpen(false)}
              type="button"
            >
              취소
            </button>
          </div>
        }
        height={210}
        dataTestId="dialog-delete-line"
        onClose={() => setDeleteLineDialogOpen(false)}
        open={deleteLineDialogOpen}
        title="수주상세 삭제 확인"
        width={420}
      >
        <div className="erp-confirm-dialog__content">
          <p>선택한 수주상세 {deleteTargetLines.length}건을 삭제하시겠습니까?</p>
          <span>이 작업은 mock 화면 데이터에만 반영됩니다.</span>
        </div>
      </ErpDialog>
    </>
  );
}
