using G2Erp.Api.Domain;
using G2Erp.Api.Repositories;

namespace G2Erp.Api.Services;

public sealed class SalesConversionService(ISalesConversionRepository repository) : ISalesConversionService
{
    public Task<PurchaseConversionResult> ConvertToPurchaseAsync(PurchaseConversionRequest request, CancellationToken cancellationToken)
    {
        ValidateCommon(request.RequestKey, request.CompanyCode, request.SalesOrderNo);
        if (request.Lines.Count == 0) throw new DomainValidationException(["발주로 전환할 수주상세를 선택해 주세요."]);
        if (request.Lines.GroupBy(line => line.SourceLineNo).Any(group => group.Count() > 1)) throw new DomainValidationException(["동일한 수주상세를 한 요청에 중복 지정할 수 없습니다."]);
        if (request.Lines.Any(line => line.Quantity <= 0 || line.UnitPrice <= 0)) throw new DomainValidationException(["전환수량과 구매단가는 0보다 커야 합니다."]);
        if (!DateOnly.TryParse(request.PurchaseOrderDate, out _) || request.Lines.Any(line => !DateOnly.TryParse(line.DueDate, out _))) throw new DomainValidationException(["발주일자와 납기일자를 확인해 주세요."]);
        if (string.IsNullOrWhiteSpace(request.SupplierCode) || string.IsNullOrWhiteSpace(request.WarehouseCode) || string.IsNullOrWhiteSpace(request.CurrencyCode)) throw new DomainValidationException(["공급처, 창고, 통화를 확인해 주세요."]);
        return repository.ConvertToPurchaseAsync(request, cancellationToken);
    }

    public Task<WorkOrderConversionResult> ConvertToWorkOrderAsync(WorkOrderConversionRequest request, CancellationToken cancellationToken)
    {
        ValidateCommon(request.RequestKey, request.CompanyCode, request.SalesOrderNo);
        if (request.Quantity <= 0) throw new DomainValidationException(["전환수량은 0보다 커야 합니다."]);
        if (!DateOnly.TryParse(request.WorkOrderDate, out _) || !DateOnly.TryParse(request.PlannedStart, out var start) || !DateOnly.TryParse(request.PlannedEnd, out var end) || end < start) throw new DomainValidationException(["작업지시일자와 계획기간을 확인해 주세요."]);
        if (string.IsNullOrWhiteSpace(request.ProductionLineCode) || string.IsNullOrWhiteSpace(request.BomVersion) || string.IsNullOrWhiteSpace(request.RoutingVersion)) throw new DomainValidationException(["생산라인, BOM 버전, 공정경로 버전을 확인해 주세요."]);
        return repository.ConvertToWorkOrderAsync(request, cancellationToken);
    }

    public Task<SalesConversionMasterPreview> GetWorkOrderPreviewAsync(string companyCode, string salesOrderNo, int sourceLineNo, string bomVersion, string routingVersion, CancellationToken cancellationToken) => repository.GetWorkOrderPreviewAsync(companyCode, salesOrderNo, sourceLineNo, bomVersion, routingVersion, cancellationToken);

    private static void ValidateCommon(string requestKey, string companyCode, string salesOrderNo)
    {
        if (string.IsNullOrWhiteSpace(requestKey) || requestKey.Length > 100) throw new DomainValidationException(["전환 요청 식별자를 확인해 주세요."]);
        if (string.IsNullOrWhiteSpace(companyCode) || string.IsNullOrWhiteSpace(salesOrderNo)) throw new DomainValidationException(["원본 수주를 확인해 주세요."]);
    }
}
