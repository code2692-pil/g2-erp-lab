using System.Security.Cryptography;
using System.Text;
using G2Erp.Api.Domain;
using G2Erp.Api.Domain.WorkOrders;
using G2Erp.Api.Services;

namespace G2Erp.Api.Repositories;

public sealed class InMemorySalesConversionRepository(
    ISalesOrderRepository salesOrders,
    IPurchaseOrderRepository purchaseOrders,
    IWorkOrderRepository workOrders,
    IPartnerRepository partners,
    IWarehouseRepository warehouses) : ISalesConversionRepository
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Dictionary<string, PurchaseConversionResult> _purchaseRequests = [];
    private readonly Dictionary<string, WorkOrderConversionResult> _workRequests = [];
    private readonly List<Link> _links = [];

    private static readonly IReadOnlyList<ApprovedBomLine> DemoBom =
    [
        new(10, "ITM-2102", "알루미늄 하우징", "EA", 1m),
        new(20, "ITM-1204", "모터 드라이브 PCB", "EA", 1m),
        new(30, "ITM-1410", "제어용 케이블 세트", "SET", 1m),
        new(40, "ITM-1600", "전원 모듈", "EA", 1m),
        new(50, "ITM-3100", "포장재", "SET", 1m)
    ];

    private static readonly IReadOnlyList<ApprovedRouteOperation> DemoRoute =
    [
        new(10, "PROC-010", "자재 준비", "LINE-A", "조립 1라인", 10m),
        new(20, "PROC-020", "조립", "LINE-A", "조립 1라인", 30m),
        new(30, "PROC-030", "전기검사", "LINE-C", "검사 라인", 15m),
        new(40, "PROC-040", "최종검사", "LINE-C", "검사 라인", 15m),
        new(50, "PROC-050", "포장", "LINE-D", "포장 라인", 10m)
    ];

    public async Task<PurchaseConversionResult> ConvertToPurchaseAsync(PurchaseConversionRequest request, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var requestIdentity = Identity("POR", request.CompanyCode, request.RequestKey);
            if (_purchaseRequests.TryGetValue(requestIdentity, out var replay)) return replay with { IdempotentReplay = true };
            var source = await GetSourceAsync(request.CompanyCode, request.SalesOrderNo, cancellationToken);
            if (source.Header.CD_PARTNER == request.SupplierCode) throw new DomainConflictException("고객을 공급처로 자동 사용할 수 없습니다. 공급처를 다시 선택해 주세요.");
            var supplier = await partners.GetAsync(request.CompanyCode, request.SupplierCode, cancellationToken) ?? throw new DomainConflictException("선택한 공급처를 찾을 수 없습니다.");
            var warehouse = await warehouses.GetAsync(request.CompanyCode, request.WarehouseCode, cancellationToken) ?? throw new DomainConflictException("선택한 창고를 찾을 수 없습니다.");
            var requestId = Guid.NewGuid();
            var targetId = Guid.NewGuid();
            var resultLines = new List<ConversionLineResult>();
            var targetLines = new List<PurchaseOrderLine>();
            foreach (var requested in request.Lines)
            {
                var line = source.Lines.SingleOrDefault(candidate => candidate.NO_LINE == requested.SourceLineNo) ?? throw new DomainConflictException($"수주상세 {requested.SourceLineNo}행을 찾을 수 없습니다.");
                var sourceHeaderId = StableId(request.CompanyCode, request.SalesOrderNo);
                var sourceLineId = StableId(request.CompanyCode, request.SalesOrderNo, requested.SourceLineNo.ToString());
                var remaining = line.QT_SO - await ActiveConvertedAsync("POR", sourceLineId, cancellationToken);
                if (requested.Quantity > remaining) throw new DomainConflictException($"수주상세 {requested.SourceLineNo}행의 발주 가능 잔량은 {remaining:0.####}입니다.");
                var supply = decimal.Round(requested.Quantity * requested.UnitPrice, 0, MidpointRounding.AwayFromZero);
                var vat = decimal.Round(supply * .1m, 0, MidpointRounding.AwayFromZero);
                targetLines.Add(new PurchaseOrderLine { CD_FIRM=request.CompanyCode, NO_PO="TEMP_PO_CONVERSION", NO_LINE=targetLines.Count+1, CD_ITEM=line.CD_ITEM, NM_ITEM=line.NM_ITEM, STND_ITEM=line.STND_ITEM, UNIT_ITEM=line.UNIT_ITEM, QT_PO=requested.Quantity, UM_PO=requested.UnitPrice, AM_SUPPLY=supply, AM_VAT=vat, AM_TOTAL=supply+vat, DT_DLV=requested.DueDate, CD_WH=warehouse.CD_WH, NM_WH=warehouse.NM_WH, DC_RMK=$"원본 {request.SalesOrderNo}/{line.NO_LINE}" });
                resultLines.Add(new(sourceHeaderId, sourceLineId, line.NO_LINE, requested.Quantity, remaining-requested.Quantity));
            }
            var target = new PurchaseOrder { Header = new PurchaseOrderHeader { CD_FIRM=request.CompanyCode, NO_PO="TEMP_PO_CONVERSION", DT_PO=request.PurchaseOrderDate, CD_PARTNER=supplier.CD_PARTNER, NM_PARTNER=supplier.NM_PARTNER, CD_EMP=request.EmployeeCode, NM_EMP=request.EmployeeCode, CD_CURRENCY=request.CurrencyCode, RT_EXCHANGE=1m, ST_PO="신규", DC_RMK=$"수주 {request.SalesOrderNo} 전환" }, Lines=targetLines };
            var saved = await purchaseOrders.AddWithGeneratedNumberAsync(target, DocumentNumberPolicy.BusinessYearMonth(request.PurchaseOrderDate), cancellationToken);
            var result = new PurchaseConversionResult(requestId, targetId, saved.Header.NO_PO, resultLines, false);
            _purchaseRequests[requestIdentity] = result;
            foreach (var line in resultLines) _links.Add(new("POR", request.CompanyCode, saved.Header.NO_PO, line.SourceLineId, line.ConvertedQuantity));
            return result;
        }
        finally { _gate.Release(); }
    }

    public async Task<WorkOrderConversionResult> ConvertToWorkOrderAsync(WorkOrderConversionRequest request, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var requestIdentity = Identity("WMO", request.CompanyCode, request.RequestKey);
            if (_workRequests.TryGetValue(requestIdentity, out var replay)) return replay with { IdempotentReplay = true };
            var source = await GetSourceAsync(request.CompanyCode, request.SalesOrderNo, cancellationToken);
            var line = source.Lines.SingleOrDefault(candidate => candidate.NO_LINE == request.SourceLineNo) ?? throw new DomainConflictException($"수주상세 {request.SourceLineNo}행을 찾을 수 없습니다.");
            var preview = Preview(line.CD_ITEM, request.BomVersion, request.RoutingVersion);
            var sourceHeaderId = StableId(request.CompanyCode, request.SalesOrderNo);
            var sourceLineId = StableId(request.CompanyCode, request.SalesOrderNo, request.SourceLineNo.ToString());
            var remaining = line.QT_SO - await ActiveConvertedAsync("WMO", sourceLineId, cancellationToken);
            if (request.Quantity > remaining) throw new DomainConflictException($"수주상세 {request.SourceLineNo}행의 작업지시 가능 잔량은 {remaining:0.####}입니다.");
            var requestId = Guid.NewGuid();
            var targetId = Guid.NewGuid();
            var operations = preview.Operations.Select(operation => new WorkOrderOperationResult(Guid.NewGuid(), operation.Sequence, operation.ProcessCode, operation.ProcessName, operation.WorkCenterCode, operation.WorkCenterName, request.Quantity)).ToArray();
            var bills = preview.Bills.Select(bill => new WorkOrderBillResult(Guid.NewGuid(), bill.LineNo, bill.ComponentCode, bill.ComponentName, bill.Unit, bill.BaseQuantity, bill.BaseQuantity*request.Quantity)).ToArray();
            var processes = operations.Select((operation, index) => new WorkOrderProcess { CD_FIRM=request.CompanyCode, NO_WO="TEMP-WO-CONVERSION", NO_PROC=operation.Sequence, CD_PROC=operation.ProcessCode, NM_PROC=operation.ProcessName, CD_EQUIP="", NM_EQUIP="", QT_PLAN=request.Quantity, QT_RESULT=0, TM_PLAN_START=$"{request.PlannedStart}T{8+index:D2}:00:00", TM_PLAN_END=$"{request.PlannedStart}T{9+index:D2}:00:00", ST_PROC="대기", DC_RMK="", CD_USER_REG="API", TM_REG=DateTime.UtcNow }).ToArray();
            var work = new WorkOrder { Header = new WorkOrderHeader { CD_FIRM=request.CompanyCode, NO_WO="TEMP-WO-CONVERSION", DT_WO=request.WorkOrderDate, CD_ITEM=line.CD_ITEM, NM_ITEM=line.NM_ITEM, STND_ITEM=line.STND_ITEM, UNIT_ITEM=line.UNIT_ITEM, QT_WO=request.Quantity, QT_RESULT=0, DT_PLAN_START=request.PlannedStart, DT_PLAN_END=request.PlannedEnd, CD_LINE=request.ProductionLineCode, NM_LINE=operations.First().WorkCenterName, ST_WO="미확정", YN_URGENT="N", DC_RMK=$"수주 {request.SalesOrderNo}/{request.SourceLineNo} 전환", CD_USER_REG="API", TM_REG=DateTime.UtcNow }, Processes=processes };
            var saved = await workOrders.AddWithGeneratedNumberAsync(work, DocumentNumberPolicy.BusinessYearMonth(request.WorkOrderDate), cancellationToken);
            var sourceResult = new ConversionLineResult(sourceHeaderId, sourceLineId, request.SourceLineNo, request.Quantity, remaining-request.Quantity);
            var result = new WorkOrderConversionResult(requestId, targetId, saved.Header.NO_WO, sourceResult, operations, bills, false);
            _workRequests[requestIdentity] = result;
            _links.Add(new("WMO", request.CompanyCode, saved.Header.NO_WO, sourceLineId, request.Quantity));
            return result;
        }
        finally { _gate.Release(); }
    }

    public async Task<SalesConversionMasterPreview> GetWorkOrderPreviewAsync(string companyCode, string salesOrderNo, int sourceLineNo, string bomVersion, string routingVersion, CancellationToken cancellationToken)
    {
        var source = await GetSourceAsync(companyCode, salesOrderNo, cancellationToken);
        var line = source.Lines.SingleOrDefault(candidate => candidate.NO_LINE == sourceLineNo) ?? throw new DomainConflictException($"수주상세 {sourceLineNo}행을 찾을 수 없습니다.");
        return Preview(line.CD_ITEM, bomVersion, routingVersion);
    }

    private static SalesConversionMasterPreview Preview(string itemCode, string bomVersion, string routingVersion)
    {
        if (itemCode != "ITM-1001" || bomVersion != "FINAL-UAT-1") throw new DomainConflictException($"품목 {itemCode}의 승인된 BOM 버전 {bomVersion}을 찾을 수 없습니다.");
        if (routingVersion != "FINAL-UAT-1") throw new DomainConflictException($"품목 {itemCode}의 승인된 공정경로 버전 {routingVersion}을 찾을 수 없습니다.");
        return new(itemCode, bomVersion, routingVersion, DemoBom, DemoRoute);
    }

    private async Task<SalesOrder> GetSourceAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken) => await salesOrders.GetAsync(companyCode, salesOrderNo, cancellationToken) ?? throw new DomainConflictException("원본 수주를 찾을 수 없습니다.");

    private async Task<decimal> ActiveConvertedAsync(string type, Guid sourceLineId, CancellationToken cancellationToken)
    {
        decimal total = 0;
        foreach (var link in _links.Where(link => link.Type == type && link.SourceLineId == sourceLineId))
        {
            if (type == "POR")
            {
                var target = await purchaseOrders.GetAsync(link.CompanyCode, link.TargetNo, cancellationToken);
                if (target is not null && !Cancelled(target.Header.ST_PO)) total += link.Quantity;
            }
            else
            {
                var target = await workOrders.GetAsync(link.CompanyCode, link.TargetNo, cancellationToken);
                if (target is not null && !Cancelled(target.Header.ST_WO)) total += link.Quantity;
            }
        }
        return total;
    }

    private static bool Cancelled(string status) => status.Equals("Cancelled", StringComparison.OrdinalIgnoreCase) || status == "취소";
    private static string Identity(string type, string companyCode, string requestKey) => $"{type}:{companyCode}:{requestKey}";
    private static Guid StableId(params string[] parts) => new(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join(':', parts))).AsSpan(0, 16));
    private sealed record Link(string Type, string CompanyCode, string TargetNo, Guid SourceLineId, decimal Quantity);
}
