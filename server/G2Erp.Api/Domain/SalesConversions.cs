namespace G2Erp.Api.Domain;

public sealed record PurchaseConversionLineRequest(int SourceLineNo, decimal Quantity, decimal UnitPrice, string DueDate);
public sealed record PurchaseConversionRequest(string RequestKey, string CompanyCode, string SalesOrderNo, string PurchaseOrderDate, string SupplierCode, string WarehouseCode, string CurrencyCode, string EmployeeCode, IReadOnlyList<PurchaseConversionLineRequest> Lines);

public sealed record WorkOrderConversionRequest(string RequestKey, string CompanyCode, string SalesOrderNo, int SourceLineNo, decimal Quantity, string WorkOrderDate, string PlannedStart, string PlannedEnd, string ProductionLineCode, string BomVersion, string RoutingVersion);

public sealed record ConversionLineResult(Guid SourceHeaderId, Guid SourceLineId, int SourceLineNo, decimal ConvertedQuantity, decimal RemainingQuantity);
public sealed record WorkOrderOperationResult(Guid OperationId, int Sequence, string ProcessCode, string ProcessName, string WorkCenterCode, string WorkCenterName, decimal PlannedQuantity);
public sealed record WorkOrderBillResult(Guid BillLineId, int BomLineNo, string ComponentCode, string ComponentName, string Unit, decimal BaseQuantity, decimal RequiredQuantity);
public sealed record PurchaseConversionResult(Guid RequestId, Guid PurchaseOrderId, string PurchaseOrderNo, IReadOnlyList<ConversionLineResult> Lines, bool IdempotentReplay);
public sealed record WorkOrderConversionResult(Guid RequestId, Guid WorkOrderId, string WorkOrderNo, ConversionLineResult Source, IReadOnlyList<WorkOrderOperationResult> Operations, IReadOnlyList<WorkOrderBillResult> Bills, bool IdempotentReplay);

public sealed record ApprovedBomLine(int LineNo, string ComponentCode, string ComponentName, string Unit, decimal BaseQuantity);
public sealed record ApprovedRouteOperation(int Sequence, string ProcessCode, string ProcessName, string WorkCenterCode, string WorkCenterName, decimal BaseMinutes);
public sealed record SalesConversionMasterPreview(string ItemCode, string BomVersion, string RoutingVersion, IReadOnlyList<ApprovedBomLine> Bills, IReadOnlyList<ApprovedRouteOperation> Operations);
