import { useEffect, useMemo, useRef, useState } from "react";
import type { ErpDataGridColumn } from "../../components/common/ErpDataGrid";
import { ErpDialog } from "../../components/common/ErpDialog";
import { ErpLookupDialog } from "../../components/common/ErpLookupDialog";
import { RangeValidationDialog } from "../../components/common/validation/RangeValidationDialog";
import { validateDateRange } from "../../components/common/validation/rangeValidation";
import { useConfirm } from "../../hooks/useConfirm";
import { useNotification } from "../../hooks/useNotification";
import type { Partner } from "../common-code/partner/types";
import type { Warehouse } from "../common-code/warehouse/types";
import type {
  PurchaseConversionResult,
  SalesConversionMasterPreview,
  WorkOrderConversionResult
} from "../../api/salesConversionApi";
import { convertSalesToPurchase, convertSalesToWorkOrder, loadWorkOrderConversionPreview } from "./salesConversionDataService";
import type { SalesOrderHeader, SalesOrderLine } from "./types";
import { createClientId } from "../../utils/clientId";

const partnerColumns: readonly ErpDataGridColumn<Partner>[] = [
  { field: "CD_PARTNER", headerName: "공급처코드", width: 140, dataType: "code" },
  { field: "NM_PARTNER", headerName: "공급처명", width: 230 },
  { field: "NO_COMPANY", headerName: "사업자번호", width: 140, dataType: "code" }
];

const warehouseColumns: readonly ErpDataGridColumn<Warehouse>[] = [
  { field: "CD_WH", headerName: "창고코드", width: 140, dataType: "code" },
  { field: "NM_WH", headerName: "창고명", width: 250 }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function requestKey(prefix: string) {
  return createClientId(prefix);
}

interface CommonProps {
  header: SalesOrderHeader | undefined;
  onClose: () => void;
  onNavigate: () => void;
  open: boolean;
}

interface PurchaseProps extends CommonProps {
  lines: readonly SalesOrderLine[];
  partners: readonly Partner[];
  warehouses: readonly Warehouse[];
}

export function SalesToPurchaseDialog({ header, lines, partners, warehouses, onClose, onNavigate, open }: PurchaseProps) {
  const { confirm } = useConfirm();
  const { notify } = useNotification();
  const [supplier, setSupplier] = useState<Partner>();
  const [warehouse, setWarehouse] = useState<Warehouse>();
  const [supplierLookupOpen, setSupplierLookupOpen] = useState(false);
  const [warehouseLookupOpen, setWarehouseLookupOpen] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [currency, setCurrency] = useState("KRW");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [prices, setPrices] = useState<Record<number, number>>({});
  const [dueDates, setDueDates] = useState<Record<number, string>>({});
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PurchaseConversionResult>();
  const requestKeyRef = useRef(requestKey("sales-to-purchase"));

  useEffect(() => {
    if (!open) return;
    requestKeyRef.current = requestKey("sales-to-purchase");
    const usablePartners = partners.filter((row) => row.CD_FIRM === header?.CD_FIRM && row.CD_PARTNER !== header?.CD_PARTNER && row.YN_USE === "Y");
    const preferredSupplier = usablePartners.find((row) => row.CD_PARTNER === "SUP-001");
    const usableWarehouses = warehouses.filter((row) => row.CD_FIRM === header?.CD_FIRM && row.YN_USE === "Y");
    setSupplier(preferredSupplier);
    setWarehouse(usableWarehouses.find((row) => row.CD_WH === "WH-RM-01") ?? usableWarehouses[0]);
    setPurchaseDate(today());
    setCurrency("KRW");
    setQuantities(Object.fromEntries(lines.map((line) => [line.NO_LINE, line.QT_SO])));
    setPrices(Object.fromEntries(lines.map((line) => [line.NO_LINE, line.CD_ITEM === "ITM-1001" ? 180000 : 0])));
    setDueDates(Object.fromEntries(lines.map((line) => [line.NO_LINE, line.DT_DLV])));
    setProcessing(false);
    setError("");
    setResult(undefined);
  }, [header, lines, open, partners, warehouses]);

  const supplierRows = useMemo(() => partners.filter((row) => row.CD_FIRM === header?.CD_FIRM && row.CD_PARTNER !== header?.CD_PARTNER && row.YN_USE === "Y"), [header, partners]);
  const warehouseRows = useMemo(() => warehouses.filter((row) => row.CD_FIRM === header?.CD_FIRM && row.YN_USE === "Y"), [header, warehouses]);

  const submit = async () => {
    if (!header || lines.length === 0) return;
    if (!supplier) { setError("공급처를 선택하세요."); return; }
    if (!warehouse) { setError("창고를 선택하세요."); return; }
    const invalidLine = lines.find((line) => !quantities[line.NO_LINE] || quantities[line.NO_LINE] > line.QT_SO || !prices[line.NO_LINE] || !dueDates[line.NO_LINE]);
    if (invalidLine) { setError(`${invalidLine.NO_LINE}번 행의 전환수량·단가·납기일을 확인하세요.`); return; }
    const accepted = await confirm({
      title: "발주 전환",
      message: `${header.NO_SO}의 수주상세 ${lines.length}건을 발주로 전환하시겠습니까?`,
      description: `공급처 ${supplier.CD_PARTNER} ${supplier.NM_PARTNER}, 창고 ${warehouse.CD_WH} ${warehouse.NM_WH}`,
      confirmLabel: "전환"
    });
    if (!accepted) return;
    setProcessing(true);
    setError("");
    try {
      const next = await convertSalesToPurchase({
        RequestKey: requestKeyRef.current,
        CompanyCode: header.CD_FIRM,
        SalesOrderNo: header.NO_SO,
        PurchaseOrderDate: purchaseDate,
        SupplierCode: supplier.CD_PARTNER,
        WarehouseCode: warehouse.CD_WH,
        CurrencyCode: currency,
        EmployeeCode: header.CD_EMP,
        Lines: lines.map((line) => ({ SourceLineNo: line.NO_LINE, Quantity: quantities[line.NO_LINE], UnitPrice: prices[line.NO_LINE], DueDate: dueDates[line.NO_LINE] }))
      }, lines, header.CD_PARTNER);
      setResult(next);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "발주 전환 중 오류가 발생했습니다.";
      setError(message);
      notify("error", message);
    } finally {
      setProcessing(false);
    }
  };

  return <>
    <ErpDialog
      dataTestId="sales-to-purchase-dialog"
      dismissOnBackdrop={!processing}
      dismissOnEscape={!processing}
      footer={result ? <><button onClick={onClose} type="button">닫기</button><button className="primary" data-testid="sales-to-purchase-navigate" onClick={onNavigate} type="button">발주등록으로 이동</button></> : <><button disabled={processing} onClick={onClose} type="button">취소</button><button className="primary" data-testid="sales-to-purchase-submit" disabled={processing} onClick={() => void submit()} type="button">{processing ? "전환 중..." : "발주 전환"}</button></>}
      onClose={onClose}
      open={open}
      title={result ? "발주 전환 완료" : "수주상세 발주 전환"}
      width={920}
    >
      {result ? <div className="sales-conversion-result" data-testid="sales-to-purchase-result"><strong>발주번호 {result.PurchaseOrderNo}</strong><p>원본 수주 {header?.NO_SO}와 연결되었습니다.</p>{result.Lines.map((line) => <p key={line.SourceLineNo}>{line.SourceLineNo}번 행: {line.ConvertedQuantity} 전환, 잔량 {line.RemainingQuantity}</p>)}</div> : <div className="sales-conversion-form">
        <p>고객은 공급처로 자동 복사되지 않습니다. 공급처와 창고를 확인해 주세요.</p>
        <div className="sales-conversion-fields">
          <label>원본 수주<input readOnly value={header?.NO_SO ?? ""} /></label>
          <label>공급처<div className="lookup-input-group"><input data-testid="purchase-conversion-supplier" readOnly value={supplier ? `${supplier.CD_PARTNER} ${supplier.NM_PARTNER}` : ""} /><button onClick={() => setSupplierLookupOpen(true)} type="button">도움창</button></div></label>
          <label>창고<div className="lookup-input-group"><input data-testid="purchase-conversion-warehouse" readOnly value={warehouse ? `${warehouse.CD_WH} ${warehouse.NM_WH}` : ""} /><button onClick={() => setWarehouseLookupOpen(true)} type="button">도움창</button></div></label>
          <label>발주일자<input data-testid="purchase-conversion-date" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
          <label>통화<select data-testid="purchase-conversion-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option>KRW</option><option>USD</option><option>EUR</option></select></label>
        </div>
        <div className="sales-conversion-table-wrap"><table><thead><tr><th>행</th><th>품목</th><th>수주수량</th><th>전환수량</th><th>단가</th><th>납기일</th></tr></thead><tbody>{lines.map((line) => <tr key={line.NO_LINE}><td>{line.NO_LINE}</td><td>{line.CD_ITEM} {line.NM_ITEM}</td><td>{line.QT_SO}</td><td><input aria-label={`${line.NO_LINE}번 행 전환수량`} data-testid={`purchase-conversion-quantity-${line.NO_LINE}`} min="0" type="number" value={quantities[line.NO_LINE] ?? 0} onChange={(event) => setQuantities({ ...quantities, [line.NO_LINE]: Number(event.target.value) })} /></td><td><input aria-label={`${line.NO_LINE}번 행 단가`} data-testid={`purchase-conversion-price-${line.NO_LINE}`} min="0" type="number" value={prices[line.NO_LINE] ?? 0} onChange={(event) => setPrices({ ...prices, [line.NO_LINE]: Number(event.target.value) })} /></td><td><input aria-label={`${line.NO_LINE}번 행 납기일`} type="date" value={dueDates[line.NO_LINE] ?? ""} onChange={(event) => setDueDates({ ...dueDates, [line.NO_LINE]: event.target.value })} /></td></tr>)}</tbody></table></div>
        {error && <p className="sales-conversion-error" data-testid="sales-to-purchase-error" role="alert">{error}</p>}
      </div>}
    </ErpDialog>
    <ErpLookupDialog columns={partnerColumns} dataTestId="purchase-conversion-supplier-lookup" emptyMessage="사용 가능한 공급처가 없습니다." onClose={() => setSupplierLookupOpen(false)} onSelect={(row) => { setSupplier(row); setSupplierLookupOpen(false); }} open={supplierLookupOpen} rowKey={(row) => `${row.CD_FIRM}:${row.CD_PARTNER}`} rows={supplierRows} searchFields={["CD_PARTNER", "NM_PARTNER", "NO_COMPANY"]} title="공급처 도움창" width={720} />
    <ErpLookupDialog columns={warehouseColumns} dataTestId="purchase-conversion-warehouse-lookup" emptyMessage="사용 가능한 창고가 없습니다." onClose={() => setWarehouseLookupOpen(false)} onSelect={(row) => { setWarehouse(row); setWarehouseLookupOpen(false); }} open={warehouseLookupOpen} rowKey={(row) => `${row.CD_FIRM}:${row.CD_WH}`} rows={warehouseRows} searchFields={["CD_WH", "NM_WH"]} title="창고 도움창" width={620} />
  </>;
}

interface WorkOrderProps extends CommonProps {
  line: SalesOrderLine | undefined;
}

export function SalesToWorkOrderDialog({ header, line, onClose, onNavigate, open }: WorkOrderProps) {
  const { confirm } = useConfirm();
  const { notify } = useNotification();
  const [quantity, setQuantity] = useState(0);
  const [workOrderDate, setWorkOrderDate] = useState(today());
  const [plannedStart, setPlannedStart] = useState(today());
  const [plannedEnd, setPlannedEnd] = useState(today());
  const [productionLine, setProductionLine] = useState("LINE-A");
  const [bomVersion, setBomVersion] = useState("FINAL-UAT-1");
  const [routingVersion, setRoutingVersion] = useState("FINAL-UAT-1");
  const [preview, setPreview] = useState<SalesConversionMasterPreview>();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WorkOrderConversionResult>();
  const [rangeDialogOpen, setRangeDialogOpen] = useState(false);
  const invalidDateInputRef = useRef<HTMLInputElement | null>(null);
  const requestKeyRef = useRef(requestKey("sales-to-work-order"));
  const previewRequestRef = useRef(0);

  useEffect(() => {
    if (!open || !header || !line) return;
    requestKeyRef.current = requestKey("sales-to-work-order");
    setQuantity(line.QT_SO);
    setWorkOrderDate(today());
    setPlannedStart(today());
    setPlannedEnd(line.DT_DLV && line.DT_DLV >= today() ? line.DT_DLV : today());
    setProductionLine("LINE-A");
    setBomVersion("FINAL-UAT-1");
    setRoutingVersion("FINAL-UAT-1");
    setPreview(undefined);
    setError("");
    setResult(undefined);
  }, [header, line, open]);

  useEffect(() => {
    if (!open || !header || !line) return;
    const requestVersion = ++previewRequestRef.current;
    setPreview(undefined);
    setError("");
    void loadWorkOrderConversionPreview(header.CD_FIRM, header.NO_SO, line.NO_LINE, line.CD_ITEM, bomVersion, routingVersion)
      .then((next) => { if (previewRequestRef.current === requestVersion) setPreview(next); })
      .catch((caught) => { if (previewRequestRef.current === requestVersion) setError(caught instanceof Error ? caught.message : "BOM/공정경로를 불러오지 못했습니다."); });
  }, [bomVersion, header, line, open, routingVersion]);

  const submit = async () => {
    if (!header || !line) return;
    if (!preview) { setError("승인된 BOM과 공정경로를 먼저 확인하세요."); return; }
    if (quantity <= 0 || quantity > line.QT_SO) { setError(`전환수량은 0보다 크고 수주수량 ${line.QT_SO} 이하여야 합니다.`); return; }
    if (plannedStart > plannedEnd) { setError("계획 종료일은 계획 시작일보다 빠를 수 없습니다."); return; }
    const accepted = await confirm({ title: "작업지시 전환", message: `${header.NO_SO}/${line.NO_LINE}행을 작업지시로 전환하시겠습니까?`, description: `수량 ${quantity}, 생산라인 ${productionLine}, 승인된 BOM·공정경로 적용`, confirmLabel: "전환" });
    if (!accepted) return;
    setProcessing(true);
    setError("");
    try {
      const next = await convertSalesToWorkOrder({ RequestKey: requestKeyRef.current, CompanyCode: header.CD_FIRM, SalesOrderNo: header.NO_SO, SourceLineNo: line.NO_LINE, Quantity: quantity, WorkOrderDate: workOrderDate, PlannedStart: plannedStart, PlannedEnd: plannedEnd, ProductionLineCode: productionLine, BomVersion: bomVersion, RoutingVersion: routingVersion }, line);
      setResult(next);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "작업지시 전환 중 오류가 발생했습니다.";
      setError(message);
      notify("error", message);
    } finally {
      setProcessing(false);
    }
  };

  return <><ErpDialog
    dataTestId="sales-to-work-order-dialog"
    dismissOnBackdrop={!processing}
    dismissOnEscape={!processing}
    footer={result ? <><button onClick={onClose} type="button">닫기</button><button className="primary" data-testid="sales-to-work-order-navigate" onClick={onNavigate} type="button">작업지시등록으로 이동</button></> : <><button disabled={processing} onClick={onClose} type="button">취소</button><button className="primary" data-testid="sales-to-work-order-submit" disabled={processing || !preview} onClick={() => void submit()} type="button">{processing ? "전환 중..." : "작업지시 전환"}</button></>}
    onClose={onClose}
    open={open}
    title={result ? "작업지시 전환 완료" : "수주상세 작업지시 전환"}
    width={980}
  >
    {result ? <div className="sales-conversion-result" data-testid="sales-to-work-order-result"><strong>작업지시번호 {result.WorkOrderNo}</strong><p>원본 수주 {header?.NO_SO}/{line?.NO_LINE}행과 연결되었습니다.</p><p>공정 {result.Operations.length}개, 자재 소요 {result.Bills.length}개가 하나의 작업지시로 생성되었습니다.</p><p>전환수량 {result.Source.ConvertedQuantity}, 잔량 {result.Source.RemainingQuantity}</p></div> : <div className="sales-conversion-form">
      <div className="sales-conversion-fields">
        <label>원본 수주상세<input readOnly value={header && line ? `${header.NO_SO}/${line.NO_LINE} · ${line.CD_ITEM}` : ""} /></label>
        <label>전환수량<input data-testid="work-conversion-quantity" min="0" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        <label>작업지시일자<input type="date" value={workOrderDate} onChange={(event) => setWorkOrderDate(event.target.value)} /></label>
        <label>계획 시작일<input data-testid="work-conversion-start" type="date" value={plannedStart} onChange={(event) => { const nextValue = event.currentTarget.value; if (!validateDateRange(nextValue, plannedEnd).valid) { invalidDateInputRef.current = event.currentTarget; setRangeDialogOpen(true); return; } setPlannedStart(nextValue); }} /></label>
        <label>계획 종료일<input data-testid="work-conversion-end" type="date" value={plannedEnd} onChange={(event) => { const nextValue = event.currentTarget.value; if (!validateDateRange(plannedStart, nextValue).valid) { invalidDateInputRef.current = event.currentTarget; setRangeDialogOpen(true); return; } setPlannedEnd(nextValue); }} /></label>
        <label>생산라인/작업장<select data-testid="work-conversion-line" value={productionLine} onChange={(event) => setProductionLine(event.target.value)}><option value="LINE-A">LINE-A 조립 작업장</option><option value="LINE-C">LINE-C 검사 작업장</option></select></label>
        <label>BOM 버전<input data-testid="work-conversion-bom" readOnly value="승인 버전" /></label>
        <label>공정경로 버전<input data-testid="work-conversion-routing" readOnly value="승인 버전" /></label>
      </div>
      {preview && <div className="sales-conversion-preview" data-testid="work-conversion-preview"><section><h3>공정 미리보기 ({preview.Operations.length})</h3><ol>{preview.Operations.map((operation) => <li key={operation.Sequence}>{operation.Sequence} · {operation.ProcessName} · {operation.WorkCenterName} · {operation.BaseMinutes}분</li>)}</ol></section><section><h3>자재 소요 미리보기 ({preview.Bills.length})</h3><ul>{preview.Bills.map((bill) => <li key={bill.LineNo}>{bill.ComponentCode} {bill.ComponentName} · {bill.BaseQuantity * quantity} {bill.Unit}</li>)}</ul></section></div>}
      {error && <p className="sales-conversion-error" data-testid="sales-to-work-order-error" role="alert">{error}</p>}
    </div>}
  </ErpDialog><RangeValidationDialog open={rangeDialogOpen} onClose={() => { setRangeDialogOpen(false); requestAnimationFrame(() => invalidDateInputRef.current?.focus()); }} /></>;
}
