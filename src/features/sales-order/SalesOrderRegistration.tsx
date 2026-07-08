import { useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Plus,
  Rows3,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { mockSalesOrderHeaders, mockSalesOrderLines } from "./mockData";
import type { SalesOrderHeader, SalesOrderLine, SalesOrderStatus } from "./types";

const statusOptions: SalesOrderStatus[] = ["신규", "진행", "확정", "마감"];
const money = new Intl.NumberFormat("ko-KR");

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
  const [filters, setFilters] = useState({
    cdFirm: "1000",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    partner: ""
  });

  const selectedHeader = headers.find((header) => header.NO_SO === selectedNoSo);

  const visibleHeaders = useMemo(() => {
    return headers.filter((header) => {
      const firmMatched = !filters.cdFirm || header.CD_FIRM.includes(filters.cdFirm);
      const partnerMatched =
        !filters.partner ||
        header.CD_PARTNER.includes(filters.partner) ||
        header.NM_PARTNER.includes(filters.partner);
      const dateMatched =
        (!filters.dateFrom || header.DT_SO >= filters.dateFrom) &&
        (!filters.dateTo || header.DT_SO <= filters.dateTo);
      return firmMatched && partnerMatched && dateMatched;
    });
  }, [filters, headers]);

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
              onChange={(event) => setFilters({ ...filters, cdFirm: event.target.value })}
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
          <label>
            거래처
            <input
              placeholder="코드 또는 명칭"
              value={filters.partner}
              onChange={(event) => setFilters({ ...filters, partner: event.target.value })}
            />
          </label>
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
            <span>SAL_SOL · PK CD_FIRM + NO_SO + NO_LINE</span>
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
                    <td colSpan={12} className="empty">
                      수주정보 행을 선택하면 상세 목록이 표시됩니다.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7}>합계</td>
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
  );
}
