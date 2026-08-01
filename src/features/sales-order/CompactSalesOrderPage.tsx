import {
  ArrowLeft,
  ClipboardList,
  PackagePlus,
  Plus,
  Save,
  Search,
  Trash2
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { isApiMode } from "../../api/apiClient";
import { getItems } from "../../api/itemApi";
import { getPartners } from "../../api/partnerApi";
import type { ErpDataGridColumn } from "../../components/common/ErpDataGrid";
import { DirtyIndicator } from "../../components/common/DirtyIndicator";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import type { ValidationIssue } from "../../components/common/validation/validation";
import { sortValidationIssues } from "../../components/common/validation/validation";
import { useConfirm } from "../../hooks/useConfirm";
import { useDirtyState } from "../../hooks/useDirtyState";
import { mockItems } from "../common-code/item/mockData";
import type { Item } from "../common-code/item/types";
import { mockPartners } from "../common-code/partner/mockData";
import type { Partner } from "../common-code/partner/types";
import {
  deleteSalesOrderRecord,
  loadSalesOrderRecords,
  saveSalesOrderRecord
} from "./salesOrderDataService";
import {
  createEmptySalesOrderHeader,
  createEmptySalesOrderLine,
  createTempSalesOrderNo,
  salesOrderToday
} from "./salesOrderDraft";
import type { SalesOrderHeader, SalesOrderLine, SalesOrderStatus } from "./types";
import {
  calculateSalesOrderLineAmounts,
  calculateSalesOrderLineTotals,
  createSalesOrderLineKey
} from "./utils";
import { validateSalesOrders } from "./validation";

type CompactMode = "mobile" | "pda";
type SalesPage = "sales" | "mobileSales" | "pdaSales" | "purchase" | "work" | "development" | "ai";
type LookupTarget = number | "quick" | null;

interface Props {
  mode: CompactMode;
  onNavigate: (page: SalesPage) => void;
}

interface SalesOrderRecord {
  Header: SalesOrderHeader;
  Lines: SalesOrderLine[];
}

const statuses: SalesOrderStatus[] = ["신규", "진행", "확정", "마감"];
const currency = new Intl.NumberFormat("ko-KR");
const headerValidationOrder = ["DT_SO", "CD_PARTNER"];
const lineValidationOrder = ["CD_ITEM", "QT_SO", "UM_SO", "DT_DLV"];

const partnerColumns: readonly ErpDataGridColumn<Partner>[] = [
  { field: "CD_PARTNER", headerName: "거래처코드", width: 130, dataType: "code" },
  { field: "NM_PARTNER", headerName: "거래처명", width: 190 },
  { field: "NO_COMPANY", headerName: "사업자번호", width: 130, dataType: "code" }
];

const itemColumns: readonly ErpDataGridColumn<Item>[] = [
  { field: "CD_ITEM", headerName: "품목코드", width: 125, dataType: "code" },
  { field: "NM_ITEM", headerName: "품목명", width: 190 },
  { field: "STND_ITEM", headerName: "규격", width: 150 },
  { field: "UNIT_ITEM", headerName: "단위", width: 70 }
];

function cloneRecord(record: SalesOrderRecord): SalesOrderRecord {
  return {
    Header: { ...record.Header },
    Lines: record.Lines.map((line) => ({ ...line }))
  };
}

function rowTotals(record: SalesOrderRecord) {
  return calculateSalesOrderLineTotals(record.Lines);
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isAbortError(error: unknown) {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

function recordMatches(
  record: SalesOrderRecord,
  filters: { noSo: string; partner: string; date: string; status: string }
) {
  const header = record.Header;
  const partnerQuery = filters.partner.trim().toLocaleLowerCase();
  return (
    (!filters.noSo || header.NO_SO.toLocaleLowerCase().includes(filters.noSo.trim().toLocaleLowerCase())) &&
    (!partnerQuery ||
      header.CD_PARTNER.toLocaleLowerCase().includes(partnerQuery) ||
      header.NM_PARTNER.toLocaleLowerCase().includes(partnerQuery)) &&
    (!filters.date || header.DT_SO === filters.date) &&
    (!filters.status || header.ST_SO === filters.status)
  );
}

function issueKey(issue: ValidationIssue) {
  if (issue.scope === "header") return `header-${issue.field}`;
  const lineNo = issue.rowKey?.split("::").at(-1) ?? "";
  return `line-${lineNo}-${issue.field}`;
}

export function CompactSalesOrderPage({ mode, onNavigate }: Props) {
  const isMobile = mode === "mobile";
  const prefix = isMobile ? "mobile-sales" : "pda-sales";
  const [records, setRecords] = useState<SalesOrderRecord[]>([]);
  const [filters, setFilters] = useState({ noSo: "", partner: "", date: "", status: "" });
  const [header, setHeader] = useState<SalesOrderHeader | null>(null);
  const [lines, setLines] = useState<SalesOrderLine[]>([]);
  const [originalOrderNo, setOriginalOrderNo] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(salesOrderToday());
  const [partners, setPartners] = useState<Partner[]>(mockPartners);
  const [items, setItems] = useState<Item[]>(mockItems);
  const [partnerLookupOpen, setPartnerLookupOpen] = useState(false);
  const [itemLookupOpen, setItemLookupOpen] = useState(false);
  const [lookupTarget, setLookupTarget] = useState<LookupTarget>(null);
  const [message, setMessage] = useState("");
  const [operation, setOperation] = useState<"idle" | "querying" | "saving" | "deleting">("idle");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [quickItemCode, setQuickItemCode] = useState("");
  const [quickItem, setQuickItem] = useState<Item | null>(null);
  const [quickQuantity, setQuickQuantity] = useState("1");
  const [quickUnitPrice, setQuickUnitPrice] = useState("0");
  const [quickError, setQuickError] = useState("");
  const [tempSequence, setTempSequence] = useState(1);
  const operationLock = useRef(false);
  const mountedRef = useRef(true);
  const queryAbortControllerRef = useRef<AbortController | null>(null);
  const latestQuerySequenceRef = useRef(0);
  const quickCodeRef = useRef<HTMLInputElement>(null);
  const quickQuantityRef = useRef<HTMLInputElement>(null);
  const quickUnitPriceRef = useRef<HTMLInputElement>(null);
  const addItemButtonRef = useRef<HTMLButtonElement>(null);
  const validationRefs = useRef(new Map<string, HTMLElement>());
  const { confirm } = useConfirm();
  const { isDirty, markDirty, clearDirty } = useDirtyState({ label: mode === "mobile" ? "모바일 수주 등록" : "PDA 수주 등록", saving: operation === "saving" || operation === "deleting" });

  const abortActiveQuery = () => {
    latestQuerySequenceRef.current += 1;
    queryAbortControllerRef.current?.abort();
    queryAbortControllerRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortActiveQuery();
    };
  }, []);

  useEffect(() => {
    setOperation("idle");
    return () => abortActiveQuery();
  }, [mode]);

  const filteredRecords = useMemo(
    () => records.filter((record) => recordMatches(record, filters)),
    [filters, records]
  );
  const totals = useMemo(() => calculateSalesOrderLineTotals(lines), [lines]);
  const rawIssues = useMemo(() => {
    if (!header) return [] as ValidationIssue[];
    const issues = validateSalesOrders([header], lines);
    if (lines.length === 0) {
      issues.push({
        scope: "line",
        rowKey: `${header.CD_FIRM}::${header.NO_SO}::new`,
        field: "CD_ITEM",
        message: "수주상세 품목을 최소 1건 등록해야 합니다."
      });
    }
    return sortValidationIssues(issues, {
      headerFields: headerValidationOrder,
      detailFields: lineValidationOrder
    });
  }, [header, lines]);
  const displayedIssues = validationAttempted ? rawIssues : [];

  useEffect(() => {
    if (!isApiMode()) return;
    let active = true;
    Promise.all([getPartners(), getItems()])
      .then(([nextPartners, nextItems]) => {
        if (!active) return;
        setPartners(nextPartners);
        setItems(nextItems);
      })
      .catch(() => {
        if (active) setMessage("거래처·품목 도움창 데이터를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, []);

  const setValidationRef = (key: string, element: HTMLElement | null) => {
    if (element) validationRefs.current.set(key, element);
    else validationRefs.current.delete(key);
  };

  const errorFor = (key: string) =>
    displayedIssues.find((issue) => issueKey(issue) === key)?.message;

  const focusFirstIssue = (issues: readonly ValidationIssue[]) => {
    const first = issues[0];
    if (!first) return;
    const target =
      validationRefs.current.get(issueKey(first)) ??
      (first.rowKey?.endsWith("::new") ? addItemButtonRef.current : null);
    queueMicrotask(() => {
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.focus();
    });
  };

  const confirmDiscard = () =>
    isDirty
      ? confirm({
          title: "저장하지 않은 변경사항",
          message: "저장하지 않은 변경사항이 있습니다.",
          description: "현재 내용을 버리고 이동하시겠습니까?",
          confirmLabel: "변경사항 폐기",
          cancelLabel: "계속 편집",
          danger: true
        })
      : Promise.resolve(true);

  const openRecord = async (record: SalesOrderRecord) => {
    if (!(await confirmDiscard())) return;
    const draft = cloneRecord(record);
    setHeader(draft.Header);
    setLines(draft.Lines);
    setOriginalOrderNo(draft.Header.NO_SO);
    setDeliveryDate(draft.Lines[0]?.DT_DLV ?? draft.Header.DT_SO);
    setValidationAttempted(false);
    setMessage("");
    clearDirty();
  };

  const refreshRecords = async (signal?: AbortSignal) => {
    const nextRecords = await loadSalesOrderRecords(signal);
    if (mountedRef.current) setRecords(nextRecords);
    return nextRecords;
  };

  const handleSearch = async () => {
    if (operationLock.current || !(await confirmDiscard())) return;
    queryAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    queryAbortControllerRef.current = abortController;
    const requestSequence = ++latestQuerySequenceRef.current;
    const requestedFilters = filters;
    setOperation("querying");
    setMessage("");
    try {
      const nextRecords = await loadSalesOrderRecords(abortController.signal);
      if (!mountedRef.current || requestSequence !== latestQuerySequenceRef.current) return;
      const matched = nextRecords.filter((record) => recordMatches(record, requestedFilters));
      setRecords(nextRecords);
      setHeader(null);
      setLines([]);
      setOriginalOrderNo(null);
      setValidationAttempted(false);
      clearDirty();
      setMessage(matched.length ? `${matched.length}건을 조회했습니다.` : "조회된 수주가 없습니다.");
      if (!isMobile && matched.length === 1) {
        const draft = cloneRecord(matched[0]);
        setHeader(draft.Header);
        setLines(draft.Lines);
        setOriginalOrderNo(draft.Header.NO_SO);
        setDeliveryDate(draft.Lines[0]?.DT_DLV ?? draft.Header.DT_SO);
      }
    } catch (error) {
      if (mountedRef.current && requestSequence === latestQuerySequenceRef.current && !isAbortError(error)) {
        setMessage("조회 중 오류가 발생했습니다. 다시 시도하세요.");
      }
    } finally {
      if (mountedRef.current && requestSequence === latestQuerySequenceRef.current) {
        queryAbortControllerRef.current = null;
        setOperation("idle");
      }
    }
  };

  const handleReset = async () => {
    if (!(await confirmDiscard())) return;
    setFilters({ noSo: "", partner: "", date: "", status: "" });
    setHeader(null);
    setLines([]);
    setOriginalOrderNo(null);
    setValidationAttempted(false);
    setMessage("");
    clearDirty();
  };

  const handleNew = async () => {
    if (!(await confirmDiscard())) return;
    const nextHeader = createEmptySalesOrderHeader(createTempSalesOrderNo(tempSequence));
    setTempSequence((current) => current + 1);
    setHeader(nextHeader);
    setLines([]);
    setOriginalOrderNo(null);
    setDeliveryDate(nextHeader.DT_SO);
    setValidationAttempted(false);
    setMessage("신규 수주를 입력하세요.");
    clearDirty();
    queueMicrotask(() => validationRefs.current.get("header-CD_PARTNER")?.focus());
  };

  const updateHeader = (
    field: "DT_SO" | "CD_EMP" | "ST_SO" | "DC_RMK",
    value: string
  ) => {
    if (!header) return;
    setHeader({ ...header, [field]: value });
    markDirty();
  };

  const updateDeliveryDate = (value: string) => {
    setDeliveryDate(value);
    setLines((current) => current.map((line) => ({ ...line, DT_DLV: value })));
    markDirty();
  };

  const handlePartnerSelect = (partner: Partner) => {
    if (!header) return;
    setHeader({
      ...header,
      CD_FIRM: partner.CD_FIRM,
      CD_PARTNER: partner.CD_PARTNER,
      NM_PARTNER: partner.NM_PARTNER
    });
    setLines((current) => current.map((line) => ({ ...line, CD_FIRM: partner.CD_FIRM })));
    setPartnerLookupOpen(false);
    setMessage(`${partner.NM_PARTNER} 거래처를 선택했습니다.`);
    markDirty();
  };

  const addMobileLine = () => {
    if (!header) {
      setMessage("신규 또는 기존 수주를 먼저 선택하세요.");
      return;
    }
    const nextLineNo = lines.length ? Math.max(...lines.map((line) => line.NO_LINE)) + 1 : 1;
    const nextLine = {
      ...createEmptySalesOrderLine(header, nextLineNo),
      DT_DLV: deliveryDate
    };
    setLines((current) => [...current, nextLine]);
    setLookupTarget(nextLineNo);
    setItemLookupOpen(true);
    markDirty();
  };

  const handleItemSelect = (item: Item) => {
    if (lookupTarget === "quick") {
      setQuickItem(item);
      setQuickItemCode(item.CD_ITEM);
      setQuickError("");
      setItemLookupOpen(false);
      queueMicrotask(() => quickQuantityRef.current?.focus());
      return;
    }
    if (lookupTarget === null) return;
    setLines((current) =>
      current.map((line) =>
        line.NO_LINE === lookupTarget
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
    setItemLookupOpen(false);
    setLookupTarget(null);
    setMessage(`${item.NM_ITEM} 품목을 선택했습니다.`);
    markDirty();
  };

  const updateLine = (
    lineNo: number,
    field: "QT_SO" | "UM_SO" | "DT_DLV" | "DC_RMK",
    value: string
  ) => {
    setLines((current) =>
      current.map((line) => {
        if (line.NO_LINE !== lineNo) return line;
        if (field === "QT_SO" || field === "UM_SO") {
          const next = { ...line, [field]: parseNumber(value) };
          return { ...next, ...calculateSalesOrderLineAmounts(next.QT_SO, next.UM_SO) };
        }
        return { ...line, [field]: value };
      })
    );
    markDirty();
  };

  const deleteLine = async (lineNo: number) => {
    if (!(await confirm({
      title: "수주상세 삭제",
      message: "선택한 품목 행을 삭제하시겠습니까?",
      confirmLabel: "삭제",
      danger: true
    }))) return;
    setLines((current) =>
      current
        .filter((line) => line.NO_LINE !== lineNo)
        .map((line, index) => ({ ...line, NO_LINE: index + 1 }))
    );
    markDirty();
  };

  const findQuickItem = () => {
    const matched = items.find(
      (item) =>
        item.CD_FIRM === (header?.CD_FIRM ?? "1000") &&
        item.CD_ITEM.toLocaleLowerCase() === quickItemCode.trim().toLocaleLowerCase() &&
        item.YN_USE === "Y"
    );
    if (!matched) {
      setQuickItem(null);
      setQuickError("존재하거나 사용 가능한 품목코드를 입력하세요.");
      return null;
    }
    setQuickItem(matched);
    setQuickItemCode(matched.CD_ITEM);
    setQuickError("");
    return matched;
  };

  const addQuickLine = () => {
    if (!header) {
      setQuickError("신규 또는 기존 수주를 먼저 선택하세요.");
      return;
    }
    const item = quickItem ?? findQuickItem();
    if (!item) return;
    const quantity = parseNumber(quickQuantity);
    const unitPrice = parseNumber(quickUnitPrice);
    if (quantity <= 0) {
      setQuickError("수량은 0보다 커야 합니다.");
      quickQuantityRef.current?.focus();
      return;
    }
    if (unitPrice < 0) {
      setQuickError("단가는 0 이상이어야 합니다.");
      quickUnitPriceRef.current?.focus();
      return;
    }
    const nextLineNo = lines.length ? Math.max(...lines.map((line) => line.NO_LINE)) + 1 : 1;
    const nextLine = {
      ...createEmptySalesOrderLine(header, nextLineNo),
      CD_ITEM: item.CD_ITEM,
      NM_ITEM: item.NM_ITEM,
      STND_ITEM: item.STND_ITEM,
      UNIT_ITEM: item.UNIT_ITEM,
      QT_SO: quantity,
      UM_SO: unitPrice,
      DT_DLV: deliveryDate,
      ...calculateSalesOrderLineAmounts(quantity, unitPrice)
    };
    setLines((current) => [...current, nextLine]);
    setQuickItemCode("");
    setQuickItem(null);
    setQuickQuantity("1");
    setQuickUnitPrice("0");
    setQuickError("");
    markDirty();
    queueMicrotask(() => quickCodeRef.current?.focus());
  };

  const handleQuickKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    step: "item" | "quantity" | "price"
  ) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) return;
    event.preventDefault();
    if (step === "item") {
      if (findQuickItem()) queueMicrotask(() => quickQuantityRef.current?.focus());
      return;
    }
    if (step === "quantity") {
      if (parseNumber(quickQuantity) <= 0) {
        setQuickError("수량은 0보다 커야 합니다.");
        return;
      }
      setQuickError("");
      quickUnitPriceRef.current?.focus();
      return;
    }
    addQuickLine();
  };

  const validateBeforeSave = () => {
    if (!header) {
      setMessage("저장할 수주를 먼저 선택하세요.");
      return false;
    }
    if (rawIssues.length === 0) return true;
    setValidationAttempted(true);
    setMessage(`저장할 수 없습니다. 입력 오류 ${rawIssues.length}건을 확인하세요.`);
    focusFirstIssue(rawIssues);
    return false;
  };

  const handleSave = async () => {
    if (operationLock.current || operation === "querying" || !validateBeforeSave() || !header) return;
    if (!(await confirm({
      title: "저장 확인",
      message: "수주정보를 저장하시겠습니까?",
      confirmLabel: "저장"
    }))) return;
    if (operationLock.current) return;
    operationLock.current = true;
    setOperation("saving");
    setMessage("");
    try {
      const isNew = originalOrderNo === null || header.NO_SO.startsWith("TEMP_SO_");
      const headerToSave: SalesOrderHeader = {
        ...header,
        NO_SO: header.NO_SO,
        ST_SO: isNew && header.ST_SO === "신규" ? "진행" : header.ST_SO
      };
      const linesToSave = lines.map((line, index) => ({
        ...line,
        CD_FIRM: headerToSave.CD_FIRM,
        NO_SO: headerToSave.NO_SO,
        NO_LINE: index + 1
      }));
      const saved = await saveSalesOrderRecord(
        { Header: headerToSave, Lines: linesToSave },
        isNew ? null : originalOrderNo
      );
      const nextRecords = await refreshRecords();
      const refreshed = nextRecords.find(
        (record) =>
          record.Header.CD_FIRM === saved.Header.CD_FIRM &&
          record.Header.NO_SO === saved.Header.NO_SO
      ) ?? saved;
      setMessage("저장되었습니다.");
      await confirm({ title: "저장 완료", message: "저장되었습니다.", confirmLabel: "확인", showCancel: false });
      setHeader({ ...refreshed.Header });
      setLines(refreshed.Lines.map((line) => ({ ...line })));
      setOriginalOrderNo(refreshed.Header.NO_SO);
      setValidationAttempted(false);
      clearDirty();
    } catch {
      const errorMessage = "저장하지 못했습니다. 현재 입력을 유지했으니 다시 시도하세요.";
      setMessage(errorMessage);
      await confirm({ title: "저장 실패", message: errorMessage, confirmLabel: "확인", showCancel: false });
    } finally {
      setOperation("idle");
      operationLock.current = false;
    }
  };

  const handleDeleteOrder = async () => {
    if (operationLock.current || operation === "querying" || !header) {
      if (!header) setMessage("삭제할 수주를 먼저 선택하세요.");
      return;
    }
    if (originalOrderNo === null) {
      if (!(await confirm({
        title: "신규 입력 삭제",
        message: "저장하지 않은 신규 입력을 지우시겠습니까?",
        confirmLabel: "삭제",
        danger: true
      }))) return;
      setHeader(null);
      setLines([]);
      clearDirty();
      return;
    }
    if (!(await confirm({
      title: "수주 삭제",
      message: `수주번호 ${header.NO_SO}을 삭제하시겠습니까?`,
      confirmLabel: "삭제",
      danger: true
    }))) return;
    if (operationLock.current) return;
    operationLock.current = true;
    setOperation("deleting");
    try {
      await deleteSalesOrderRecord(header.CD_FIRM, originalOrderNo);
      await refreshRecords();
      setMessage("삭제되었습니다.");
      await confirm({ title: "삭제 완료", message: "삭제되었습니다.", confirmLabel: "확인", showCancel: false });
      setHeader(null);
      setLines([]);
      setOriginalOrderNo(null);
      setValidationAttempted(false);
      clearDirty();
    } catch {
      const errorMessage = "삭제하지 못했습니다. 현재 화면을 유지했으니 다시 시도하세요.";
      setMessage(errorMessage);
      await confirm({ title: "삭제 실패", message: errorMessage, confirmLabel: "확인", showCancel: false });
    } finally {
      setOperation("idle");
      operationLock.current = false;
    }
  };

  const navigate = (page: SalesPage) => onNavigate(page);

  const returnToList = async () => {
    if (!(await confirmDiscard())) return;
    setHeader(null);
    setLines([]);
    setOriginalOrderNo(null);
    setValidationAttempted(false);
    clearDirty();
  };

  const renderHeaderFields = () => {
    if (!header) return null;
    const partnerError = errorFor("header-CD_PARTNER");
    const dateError = errorFor("header-DT_SO");
    return (
      <section className="compact-sales__section" data-testid={`${prefix}-header`}>
        <div className="compact-sales__section-heading">
          <h2>수주 기본정보</h2>
          <DirtyIndicator dataTestId={`${prefix}-dirty-indicator`} dirty={isDirty} />
        </div>
        <div className="compact-sales__form-grid">
          <label>
            수주번호
            <input data-testid={`${prefix}-order-no`} readOnly value={header.NO_SO} />
          </label>
          <label>
            수주일자
            <input
              aria-invalid={Boolean(dateError)}
              data-testid={`${prefix}-order-date`}
              ref={(element) => setValidationRef("header-DT_SO", element)}
              type="date"
              value={header.DT_SO}
              onChange={(event) => updateHeader("DT_SO", event.target.value)}
            />
            {dateError && <span className="compact-sales__field-error">{dateError}</span>}
          </label>
          <label className="compact-sales__lookup-field">
            거래처
            <span className="compact-sales__input-action">
              <input
                aria-invalid={Boolean(partnerError)}
                data-testid={`${prefix}-partner`}
                placeholder="거래처를 선택하세요"
                readOnly
                ref={(element) => setValidationRef("header-CD_PARTNER", element)}
                value={header.NM_PARTNER ? `${header.CD_PARTNER} · ${header.NM_PARTNER}` : ""}
              />
              <button
                aria-label="거래처 도움창 열기"
                data-testid={`${prefix}-partner-lookup`}
                onClick={() => setPartnerLookupOpen(true)}
                type="button"
              >
                <Search size={17} />
              </button>
            </span>
            {partnerError && <span className="compact-sales__field-error">{partnerError}</span>}
          </label>
          <label>
            담당자
            <input data-testid={`${prefix}-employee`} value={header.CD_EMP} onChange={(event) => updateHeader("CD_EMP", event.target.value)} />
          </label>
          <label>
            납기일
            <input data-testid={`${prefix}-delivery-date`} type="date" value={deliveryDate} onChange={(event) => updateDeliveryDate(event.target.value)} />
          </label>
          <label>
            상태
            <select data-testid={`${prefix}-status`} value={header.ST_SO} onChange={(event) => updateHeader("ST_SO", event.target.value)}>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          {isMobile && <label className="compact-sales__wide-field">
            비고
            <textarea data-testid={`${prefix}-remark`} rows={2} value={header.DC_RMK} onChange={(event) => updateHeader("DC_RMK", event.target.value)} />
          </label>}
        </div>
      </section>
    );
  };

  const renderLines = () => (
    <section className="compact-sales__section" data-testid={`${prefix}-lines`}>
      <div className="compact-sales__section-heading">
        <h2>등록 품목 <span>{lines.length}건</span></h2>
        {isMobile && <button
          className="compact-sales__secondary-button"
          data-testid={`${prefix}-add-line`}
          onClick={addMobileLine}
          ref={addItemButtonRef}
          type="button"
        ><PackagePlus size={17} /> 품목 추가</button>}
      </div>
      {lines.length === 0
        ? <p className="compact-sales__empty" data-testid={`${prefix}-empty-lines`}>등록된 품목이 없습니다.</p>
        : <div className="compact-sales__line-list">
            {lines.map((line) => {
              const itemError = errorFor(`line-${line.NO_LINE}-CD_ITEM`);
              const quantityError = errorFor(`line-${line.NO_LINE}-QT_SO`);
              const priceError = errorFor(`line-${line.NO_LINE}-UM_SO`);
              const dateError = errorFor(`line-${line.NO_LINE}-DT_DLV`);
              return <article className="compact-sales__line-card" data-testid={`${prefix}-line-${line.NO_LINE}`} key={createSalesOrderLineKey(line.CD_FIRM, line.NO_SO, line.NO_LINE)}>
                <div className="compact-sales__line-title">
                  <strong>{line.NO_LINE}. {line.NM_ITEM || "품목 미선택"}</strong>
                  <button aria-label={`${line.NO_LINE}행 삭제`} data-testid={`${prefix}-delete-line-${line.NO_LINE}`} onClick={() => void deleteLine(line.NO_LINE)} type="button"><Trash2 size={17} /></button>
                </div>
                <label>
                  품목
                  <span className="compact-sales__input-action">
                    <input
                      aria-invalid={Boolean(itemError)}
                      data-testid={`${prefix}-line-item-${line.NO_LINE}`}
                      readOnly
                      ref={(element) => setValidationRef(`line-${line.NO_LINE}-CD_ITEM`, element)}
                      value={line.CD_ITEM}
                    />
                    {isMobile && <button aria-label="품목 도움창 열기" onClick={() => { setLookupTarget(line.NO_LINE); setItemLookupOpen(true); }} type="button"><Search size={16} /></button>}
                  </span>
                  {itemError && <span className="compact-sales__field-error">{itemError}</span>}
                </label>
                <div className="compact-sales__line-fields">
                  <label>
                    수량
                    <input
                      aria-invalid={Boolean(quantityError)}
                      data-testid={`${prefix}-line-quantity-${line.NO_LINE}`}
                      inputMode="decimal"
                      ref={(element) => setValidationRef(`line-${line.NO_LINE}-QT_SO`, element)}
                      type="number"
                      value={line.QT_SO}
                      onChange={(event) => updateLine(line.NO_LINE, "QT_SO", event.target.value)}
                    />
                    {quantityError && <span className="compact-sales__field-error">{quantityError}</span>}
                  </label>
                  <label>
                    단가
                    <input
                      aria-invalid={Boolean(priceError)}
                      data-testid={`${prefix}-line-price-${line.NO_LINE}`}
                      inputMode="decimal"
                      min="0"
                      ref={(element) => setValidationRef(`line-${line.NO_LINE}-UM_SO`, element)}
                      type="number"
                      value={line.UM_SO}
                      onChange={(event) => updateLine(line.NO_LINE, "UM_SO", event.target.value)}
                    />
                    {priceError && <span className="compact-sales__field-error">{priceError}</span>}
                  </label>
                  <label>
                    금액
                    <input data-testid={`${prefix}-line-amount-${line.NO_LINE}`} readOnly value={currency.format(line.AM_TOTAL)} />
                  </label>
                </div>
                {isMobile && <div className="compact-sales__line-fields">
                  <label>
                    납기일
                    <input
                      aria-invalid={Boolean(dateError)}
                      data-testid={`${prefix}-line-delivery-${line.NO_LINE}`}
                      ref={(element) => setValidationRef(`line-${line.NO_LINE}-DT_DLV`, element)}
                      type="date"
                      value={line.DT_DLV}
                      onChange={(event) => updateLine(line.NO_LINE, "DT_DLV", event.target.value)}
                    />
                    {dateError && <span className="compact-sales__field-error">{dateError}</span>}
                  </label>
                  <label className="compact-sales__line-remark">
                    비고
                    <input value={line.DC_RMK} onChange={(event) => updateLine(line.NO_LINE, "DC_RMK", event.target.value)} />
                  </label>
                </div>}
              </article>;
            })}
          </div>}
    </section>
  );

  return (
    <>
      <div className={`compact-sales compact-sales--${mode}`} data-processing-state={operation} data-testid={`${prefix}-page`}>
        <header className="compact-sales__topbar">
          <div>
            <span className="compact-sales__eyebrow">SMART ERP · 영업관리</span>
            <h1 data-testid="page-title">{isMobile ? "모바일 수주등록 PoC" : "PDA 수주등록 PoC"}</h1>
            <p>{isMobile
              ? "PC 수주등록과 동일한 수주 데이터를 스마트폰 화면에 맞게 재구성한 브라우저 기반 PoC입니다."
              : "산업용 소형 단말의 키보드 입력 흐름을 가정한 브라우저 기반 간편 수주등록 화면입니다."}</p>
          </div>
          <nav aria-label="수주등록 화면 이동" className="compact-sales__nav">
            <button data-testid={`${prefix}-nav-pc`} onClick={() => void navigate("sales")} type="button">PC</button>
            <button className={isMobile ? "active" : ""} data-testid={`${prefix}-nav-mobile`} onClick={() => void navigate("mobileSales")} type="button">모바일</button>
            <button className={!isMobile ? "active" : ""} data-testid={`${prefix}-nav-pda`} onClick={() => void navigate("pdaSales")} type="button">PDA</button>
          </nav>
        </header>

        <main aria-busy={operation !== "idle"}>
          <section className="compact-sales__search" data-testid={`${prefix}-search-panel`}>
            <label>
              수주번호
              <input data-testid={`${prefix}-filter-order-no`} value={filters.noSo} onChange={(event) => setFilters({ ...filters, noSo: event.target.value })} />
            </label>
            {isMobile && <>
              <label>
                거래처
                <input data-testid={`${prefix}-filter-partner`} value={filters.partner} onChange={(event) => setFilters({ ...filters, partner: event.target.value })} />
              </label>
              <label>
                수주일자
                <input data-testid={`${prefix}-filter-date`} type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
              </label>
              <label>
                상태
                <select data-testid={`${prefix}-filter-status`} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                  <option value="">전체</option>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
            </>}
            <div className="compact-sales__search-actions">
              <button data-testid={`${prefix}-search`} disabled={operation === "saving" || operation === "deleting"} onClick={() => void handleSearch()} type="button"><Search size={17} />{operation === "querying" ? "조회 중" : "조회"}</button>
              <button data-testid={`${prefix}-reset`} disabled={operation !== "idle"} onClick={() => void handleReset()} type="button">초기화</button>
              <button className="primary" data-testid={`${prefix}-new`} disabled={operation !== "idle"} onClick={() => void handleNew()} type="button"><Plus size={17} />신규</button>
            </div>
          </section>

          {message && <p aria-live="polite" className="compact-sales__message" data-testid={`${prefix}-message`}>{message}</p>}
          {displayedIssues.length > 0 && <section className="compact-sales__validation" data-testid={`${prefix}-validation-summary`}>
            <strong data-testid={`${prefix}-validation-count`}>입력 오류 {displayedIssues.length}건</strong>
            <button onClick={() => focusFirstIssue(displayedIssues)} type="button">첫 오류로 이동</button>
            <ul>{displayedIssues.map((issue, index) => <li key={`${issueKey(issue)}-${index}`}>{issue.message}</li>)}</ul>
          </section>}

          {!header && <section className="compact-sales__results" data-testid={`${prefix}-results`}>
            <div className="compact-sales__section-heading"><h2>조회 결과</h2><span>{filteredRecords.length}건</span></div>
            {filteredRecords.length === 0
              ? <p className="compact-sales__empty">조회 버튼을 눌러 수주를 확인하세요.</p>
              : filteredRecords.map((record) => {
                  const recordTotal = rowTotals(record);
                  return <button className="compact-sales__order-card" data-testid={`${prefix}-result-${record.Header.NO_SO}`} key={`${record.Header.CD_FIRM}-${record.Header.NO_SO}`} onClick={() => void openRecord(record)} type="button">
                    <span><strong>{record.Header.NO_SO}</strong><em>{record.Header.ST_SO}</em></span>
                    <span>{record.Header.DT_SO} · {record.Header.NM_PARTNER}</span>
                    <span>납기 {record.Lines[0]?.DT_DLV ?? "-"} · 수량 {currency.format(recordTotal.QT_SO)}</span>
                    <strong>합계 {currency.format(recordTotal.AM_TOTAL)}원</strong>
                  </button>;
                })}
          </section>}

          {header && <>
            <button className="compact-sales__back" data-testid={`${prefix}-back-list`} onClick={() => void returnToList()} type="button"><ArrowLeft size={17} /> 목록으로</button>
            {renderHeaderFields()}
            {!isMobile && <section className="compact-sales__section compact-sales__quick-entry" data-testid="pda-sales-quick-entry">
              <div className="compact-sales__section-heading"><h2>빠른 품목 입력</h2><span>Enter 순서 입력</span></div>
              <label>
                품목 코드
                <span className="compact-sales__input-action">
                  <input
                    aria-invalid={Boolean(quickError)}
                    autoCapitalize="characters"
                    data-testid="pda-sales-quick-item"
                    onChange={(event) => { setQuickItemCode(event.target.value); setQuickItem(null); setQuickError(""); }}
                    onKeyDown={(event) => handleQuickKeyDown(event, "item")}
                    ref={quickCodeRef}
                    value={quickItemCode}
                  />
                  <button aria-label="품목 도움창 열기" data-testid="pda-sales-item-lookup" onClick={() => { setLookupTarget("quick"); setItemLookupOpen(true); }} type="button"><Search size={17} /></button>
                </span>
              </label>
              <label>
                수량
                <input data-testid="pda-sales-quick-quantity" inputMode="decimal" onChange={(event) => { setQuickQuantity(event.target.value); setQuickError(""); }} onKeyDown={(event) => handleQuickKeyDown(event, "quantity")} ref={quickQuantityRef} type="number" value={quickQuantity} />
              </label>
              <label>
                단가
                <input data-testid="pda-sales-quick-price" inputMode="decimal" min="0" onChange={(event) => { setQuickUnitPrice(event.target.value); setQuickError(""); }} onKeyDown={(event) => handleQuickKeyDown(event, "price")} ref={quickUnitPriceRef} type="number" value={quickUnitPrice} />
              </label>
              <button className="compact-sales__secondary-button" data-testid="pda-sales-add-line" onClick={addQuickLine} ref={addItemButtonRef} type="button"><PackagePlus size={17} />행 추가</button>
              {quickItem && <p className="compact-sales__quick-item-name">{quickItem.NM_ITEM} · {quickItem.STND_ITEM}</p>}
              {quickError && <p className="compact-sales__field-error" data-testid="pda-sales-quick-error" role="alert">{quickError}</p>}
            </section>}
            {renderLines()}
            <section className="compact-sales__totals" data-testid={`${prefix}-totals`}>
              <span>총수량 <strong>{currency.format(totals.QT_SO)}</strong></span>
              <span>공급가 <strong>{currency.format(totals.AM_SUPPLY)}</strong></span>
              <span>부가세 <strong>{currency.format(totals.AM_VAT)}</strong></span>
              <span>총금액 <strong>{currency.format(totals.AM_TOTAL)}원</strong></span>
            </section>
            <footer className="compact-sales__actions">
              <button className="primary" data-testid={`${prefix}-save`} disabled={operation !== "idle"} onClick={() => void handleSave()} type="button"><Save size={18} />{operation === "saving" ? "저장 중..." : "저장"}</button>
              <button className="danger" data-testid={`${prefix}-delete-order`} disabled={operation !== "idle"} onClick={() => void handleDeleteOrder()} type="button"><Trash2 size={18} />{operation === "deleting" ? "삭제 중..." : "삭제"}</button>
              <button data-testid={`${prefix}-clear`} disabled={operation !== "idle"} onClick={() => void handleReset()} type="button"><ClipboardList size={18} />초기화</button>
            </footer>
          </>}
        </main>
      </div>

      <ErpLookupDialog<Partner>
        columns={partnerColumns}
        dataTestId={`${prefix}-partner-dialog`}
        emptyMessage="조회된 거래처가 없습니다."
        height="min(78vh, 500px)"
        onClose={() => setPartnerLookupOpen(false)}
        onSelect={handlePartnerSelect}
        open={partnerLookupOpen}
        rowKey={(partner) => `${partner.CD_FIRM}::${partner.CD_PARTNER}`}
        rows={partners.filter((partner) => partner.YN_USE === "Y" && (!header || partner.CD_FIRM === header.CD_FIRM))}
        searchFields={["CD_PARTNER", "NM_PARTNER", "NO_COMPANY"]}
        selectedRowKey={header?.CD_PARTNER ? `${header.CD_FIRM}::${header.CD_PARTNER}` : null}
        title="거래처 도움창"
        width="min(94vw, 720px)"
      />

      <ErpLookupDialog<Item>
        columns={itemColumns}
        dataTestId={`${prefix}-item-dialog`}
        emptyMessage="조회된 품목이 없습니다."
        height="min(78vh, 520px)"
        onClose={() => { setItemLookupOpen(false); setLookupTarget(null); }}
        onSelect={handleItemSelect}
        open={itemLookupOpen}
        rowKey={(item) => `${item.CD_FIRM}::${item.CD_ITEM}`}
        rows={items.filter((item) => item.YN_USE === "Y" && (!header || item.CD_FIRM === header.CD_FIRM))}
        searchFields={["CD_ITEM", "NM_ITEM", "STND_ITEM"]}
        title="품목 도움창"
        width="min(94vw, 760px)"
      />
    </>
  );
}
