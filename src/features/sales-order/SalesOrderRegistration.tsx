import { useLayoutEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Plus,
  Rows3,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import type { ErpDataGridColumn } from "../../components/common/ErpDataGrid";
import { mockItems } from "../common-code/item/mockData";
import type { Item } from "../common-code/item/types";
import { mockPartners } from "../common-code/partner/mockData";
import type { Partner } from "../common-code/partner/types";
import { mockSalesOrderHeaders, mockSalesOrderLines } from "./mockData";
import type { SalesOrderHeader, SalesOrderLine, SalesOrderStatus } from "./types";

const statusOptions: SalesOrderStatus[] = ["신규", "진행", "확정", "마감"];
const money = new Intl.NumberFormat("ko-KR");

const partnerLookupColumns: readonly ErpDataGridColumn<Partner>[] = [
  { field: "CD_FIRM", header: "회사코드", width: 90, align: "center" },
  { field: "CD_PARTNER", header: "거래처코드", width: 120 },
  { field: "NM_PARTNER", header: "거래처명", width: 180 },
  { field: "NO_COMPANY", header: "사업자번호", width: 130 },
  { field: "YN_USE", header: "사용", width: 64, align: "center" }
];

const itemLookupColumns: readonly ErpDataGridColumn<Item>[] = [
  { field: "CD_FIRM", header: "회사코드", width: 90, align: "center" },
  { field: "CD_ITEM", header: "품목코드", width: 120 },
  { field: "NM_ITEM", header: "품목명", width: 190 },
  { field: "STND_ITEM", header: "규격", width: 150 },
  { field: "UNIT_ITEM", header: "단위", width: 70, align: "center" },
  { field: "YN_USE", header: "사용", width: 64, align: "center" }
];

const partnerSearchFields: readonly (keyof Partner)[] = [
  "CD_PARTNER",
  "NM_PARTNER",
  "NO_COMPANY"
];
const itemSearchFields: readonly (keyof Item)[] = ["CD_ITEM", "NM_ITEM", "STND_ITEM"];

function getPartnerRowKey(partner: Partner) {
  return `${partner.CD_FIRM}::${partner.CD_PARTNER}`;
}

function getItemRowKey(item: Item) {
  return `${item.CD_FIRM}::${item.CD_ITEM}`;
}

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

function calculateAmounts(quantity: number, unitPrice: number) {
  const supply = Math.round(quantity * unitPrice);
  const vat = Math.round(supply * 0.1);
  return {
    AM_SUPPLY: supply,
    AM_VAT: vat,
    AM_TOTAL: supply + vat
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

function toNumber(value: string) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function SalesOrderRegistration() {
  const [headers, setHeaders] = useState<SalesOrderHeader[]>([]);
  const [lines, setLines] = useState<SalesOrderLine[]>([]);
  const [selectedNoSo, setSelectedNoSo] = useState("");
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [tempSeq, setTempSeq] = useState(1);
  const [partnerLookupOpen, setPartnerLookupOpen] = useState(false);
  const [itemLookupOpen, setItemLookupOpen] = useState(false);
  const [selectedPartnerRowKey, setSelectedPartnerRowKey] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    cdFirm: "1000",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    cdPartner: "",
    nmPartner: ""
  });

  const selectedHeader = headers.find((header) => header.NO_SO === selectedNoSo);
  const selectedLineData = lines.find(
    (line) => line.NO_SO === selectedNoSo && line.NO_LINE === selectedLine
  );
  const partnerLookupRows = mockPartners.filter(
    (partner) => !filters.cdFirm || partner.CD_FIRM === filters.cdFirm
  );
  const itemLookupRows = mockItems.filter(
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

  useLayoutEffect(() => {
    if (visibleHeaders.some((header) => header.NO_SO === selectedNoSo)) return;

    const nextSelectedNoSo = visibleHeaders[0]?.NO_SO ?? "";
    if (nextSelectedNoSo === selectedNoSo) return;

    setSelectedNoSo(nextSelectedNoSo);
    setSelectedLine(null);
  }, [selectedNoSo, visibleHeaders]);

  const selectedLines = lines
    .filter((line) => line.NO_SO === selectedNoSo)
    .sort((a, b) => a.NO_LINE - b.NO_LINE);

  const totals = selectedLines.reduce(
    (acc, line) => ({
      supply: acc.supply + line.AM_SUPPLY,
      vat: acc.vat + line.AM_VAT,
      total: acc.total + line.AM_TOTAL
    }),
    { supply: 0, vat: 0, total: 0 }
  );

  const updateHeader = (
    noSo: string,
    field: keyof Omit<SalesOrderHeader, "NO_SO">,
    value: string
  ) => {
    setHeaders((current) =>
      current.map((header) => (header.NO_SO === noSo ? { ...header, [field]: value } : header))
    );

    if (field === "CD_FIRM") {
      setLines((current) =>
        current.map((line) => (line.NO_SO === noSo ? { ...line, CD_FIRM: value } : line))
      );
    }
  };

  const updateLine = (
    noSo: string,
    noLine: number,
    field: keyof Omit<SalesOrderLine, "CD_FIRM" | "NO_SO" | "NO_LINE" | "AM_SUPPLY" | "AM_VAT" | "AM_TOTAL">,
    value: string
  ) => {
    setLines((current) =>
      current.map((line) => {
        if (line.NO_SO !== noSo || line.NO_LINE !== noLine) return line;

        if (field === "QT_SO" || field === "UM_SO") {
          const nextLine = { ...line, [field]: toNumber(value) };
          return {
            ...nextLine,
            ...calculateAmounts(nextLine.QT_SO, nextLine.UM_SO)
          };
        }

        return { ...line, [field]: value };
      })
    );
  };

  const handleSearch = () => {
    const nextHeaders = mockSalesOrderHeaders.map((header) => ({ ...header }));
    const nextLines = mockSalesOrderLines.map((line) => ({ ...line }));
    setHeaders(nextHeaders);
    setLines(nextLines);
    setSelectedNoSo(nextHeaders[0]?.NO_SO ?? "");
    setSelectedLine(null);
    setMessage("조회되었습니다");
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

  const handleNew = () => {
    const tempNo = createTempOrderNo(tempSeq);
    const nextHeader = createEmptyHeader(tempNo);
    setHeaders((current) => [nextHeader, ...current]);
    setSelectedNoSo(tempNo);
    setSelectedLine(null);
    setTempSeq((seq) => seq + 1);
    setMessage("신규 수주 행이 추가되었습니다");
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
    setSelectedLine(nextNoLine);
    setMessage("수주상세 행이 추가되었습니다");
  };

  const handleDeleteLine = () => {
    if (!selectedNoSo || selectedLine === null) {
      setMessage("삭제할 수주상세 행을 선택하세요");
      return;
    }

    setLines((current) => {
      const retained = current.filter(
        (line) => !(line.NO_SO === selectedNoSo && line.NO_LINE === selectedLine)
      );
      const resequenced = retained
        .filter((line) => line.NO_SO === selectedNoSo)
        .sort((a, b) => a.NO_LINE - b.NO_LINE);
      const lineNoMap = new Map(resequenced.map((line, index) => [line, index + 1]));

      return retained.map((line) =>
        line.NO_SO === selectedNoSo ? { ...line, NO_LINE: lineNoMap.get(line) ?? line.NO_LINE } : line
      );
    });
    setSelectedLine(null);
    setMessage("수주상세 행이 삭제되었습니다");
  };

  const handleSave = () => {
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
    setSelectedNoSo(noMap.get(selectedNoSo) ?? selectedNoSo);
    setSelectedLine(null);
    console.log("SAL_SOH", savedHeaders);
    console.log("SAL_SOL", savedLines);
    setMessage("저장되었습니다");
  };

  const handleDeleteOrder = () => {
    if (!selectedNoSo) {
      setMessage("삭제할 수주정보를 선택하세요");
      return;
    }

    setHeaders((current) => current.filter((header) => header.NO_SO !== selectedNoSo));
    setLines((current) => current.filter((line) => line.NO_SO !== selectedNoSo));
    setSelectedNoSo("");
    setSelectedLine(null);
    setMessage("선택된 수주정보가 삭제되었습니다");
  };

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

      <main className="workbench">
        <header className="page-header">
          <div>
            <h1>수주등록</h1>
            <p>SAL_SOH / SAL_SOL mock 데이터 입력 샘플</p>
          </div>
          <div className="button-bar">
            <button data-testid="btn-search" onClick={handleSearch}>
              <Search size={15} />
              조회
            </button>
            <button data-testid="btn-new" onClick={handleNew}>
              <Plus size={15} />
              신규
            </button>
            <button data-testid="btn-add-line" onClick={handleAddLine}>
              <Rows3 size={15} />
              행추가
            </button>
            <button data-testid="btn-delete-line" onClick={handleDeleteLine}>
              <Trash2 size={15} />
              행삭제
            </button>
            <button className="primary" data-testid="btn-save" onClick={handleSave}>
              <Save size={15} />
              저장
            </button>
            <button className="danger" data-testid="btn-delete-order" onClick={handleDeleteOrder}>
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
          <span className="status-message">{message}</span>
        </section>

        <section className="grid-section top-grid">
          <div className="section-title">
            <h2>수주정보</h2>
            <span>SAL_SOH · PK CD_FIRM + NO_SO</span>
          </div>
          <div className="table-wrap">
            <table className="header-table">
              <thead>
                <tr>
                  <th>회사코드</th>
                  <th>수주번호</th>
                  <th>수주일자</th>
                  <th>거래처코드</th>
                  <th>거래처명</th>
                  <th>담당자코드</th>
                  <th>수주상태</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {visibleHeaders.map((header) => (
                  <tr
                    data-no-so={header.NO_SO}
                    key={`${header.CD_FIRM}-${header.NO_SO}`}
                    className={header.NO_SO === selectedNoSo ? "selected" : ""}
                    onClick={() => {
                      setSelectedNoSo(header.NO_SO);
                      setSelectedLine(null);
                    }}
                  >
                    <td>
                      <input
                        className="grid-input mono"
                        value={header.CD_FIRM}
                        onChange={(event) => updateHeader(header.NO_SO, "CD_FIRM", event.target.value)}
                      />
                    </td>
                    <td className="readonly-cell mono">{header.NO_SO}</td>
                    <td>
                      <input
                        className="grid-input"
                        type="date"
                        value={header.DT_SO}
                        onChange={(event) => updateHeader(header.NO_SO, "DT_SO", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input mono"
                        value={header.CD_PARTNER}
                        onChange={(event) =>
                          updateHeader(header.NO_SO, "CD_PARTNER", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input"
                        value={header.NM_PARTNER}
                        onChange={(event) =>
                          updateHeader(header.NO_SO, "NM_PARTNER", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input mono"
                        value={header.CD_EMP}
                        onChange={(event) => updateHeader(header.NO_SO, "CD_EMP", event.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="grid-select"
                        value={header.ST_SO}
                        onChange={(event) =>
                          updateHeader(header.NO_SO, "ST_SO", event.target.value as SalesOrderStatus)
                        }
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <span className={`badge ${statusClass(header.ST_SO)}`}>{header.ST_SO}</span>
                    </td>
                    <td>
                      <input
                        className="grid-input"
                        value={header.DC_RMK}
                        onChange={(event) => updateHeader(header.NO_SO, "DC_RMK", event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                {visibleHeaders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty">
                      조회 버튼을 눌러 mock 수주정보를 불러오세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
          <div className="table-wrap">
            <table className="line-table">
              <thead>
                <tr>
                  <th>회사코드</th>
                  <th>수주번호</th>
                  <th>라인</th>
                  <th>품목코드</th>
                  <th>품목명</th>
                  <th>규격</th>
                  <th>단위</th>
                  <th className="num">수주수량</th>
                  <th className="num">단가</th>
                  <th className="num">공급가액</th>
                  <th className="num">부가세</th>
                  <th className="num">합계금액</th>
                  <th>납기일자</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {selectedLines.map((line) => (
                  <tr
                    data-no-so={line.NO_SO}
                    data-no-line={line.NO_LINE}
                    key={`${line.NO_SO}-${line.NO_LINE}`}
                    className={line.NO_LINE === selectedLine ? "selected" : ""}
                    onClick={() => setSelectedLine(line.NO_LINE)}
                  >
                    <td className="readonly-cell mono">{line.CD_FIRM}</td>
                    <td className="readonly-cell mono">{line.NO_SO}</td>
                    <td className="readonly-cell mono">{line.NO_LINE}</td>
                    <td>
                      <input
                        className="grid-input mono"
                        value={line.CD_ITEM}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "CD_ITEM", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input"
                        value={line.NM_ITEM}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "NM_ITEM", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input"
                        value={line.STND_ITEM}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "STND_ITEM", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input"
                        value={line.UNIT_ITEM}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "UNIT_ITEM", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input num"
                        min="0"
                        type="number"
                        value={line.QT_SO}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "QT_SO", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input num"
                        min="0"
                        type="number"
                        value={line.UM_SO}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "UM_SO", event.target.value)
                        }
                      />
                    </td>
                    <td className="num readonly-cell">{money.format(line.AM_SUPPLY)}</td>
                    <td className="num readonly-cell">{money.format(line.AM_VAT)}</td>
                    <td className="num strong readonly-cell">{money.format(line.AM_TOTAL)}</td>
                    <td>
                      <input
                        className="grid-input"
                        type="date"
                        value={line.DT_DLV}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "DT_DLV", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="grid-input"
                        value={line.DC_RMK}
                        onChange={(event) =>
                          updateLine(line.NO_SO, line.NO_LINE, "DC_RMK", event.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
                {selectedLines.length === 0 && (
                  <tr>
                    <td colSpan={14} className="empty">
                      수주정보 행을 선택하면 상세 목록이 표시됩니다.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={9}>합계</td>
                  <td className="num">{money.format(totals.supply)}</td>
                  <td className="num">{money.format(totals.vat)}</td>
                  <td className="num strong">{money.format(totals.total)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </main>
      </div>

      <ErpLookupDialog<Partner>
        columns={partnerLookupColumns}
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

      <ErpLookupDialog<Item>
        columns={itemLookupColumns}
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
            ? `${selectedLineData.CD_FIRM}::${selectedLineData.CD_ITEM}`
            : undefined
        }
        title="품목 도움창"
        width={820}
      />
    </>
  );
}
