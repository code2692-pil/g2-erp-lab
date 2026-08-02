using G2Erp.Api.Domain;

namespace G2Erp.Api.Services;

public interface ISalesConversionService
{
    Task<PurchaseConversionResult> ConvertToPurchaseAsync(PurchaseConversionRequest request, CancellationToken cancellationToken);
    Task<WorkOrderConversionResult> ConvertToWorkOrderAsync(WorkOrderConversionRequest request, CancellationToken cancellationToken);
    Task<SalesConversionMasterPreview> GetWorkOrderPreviewAsync(string companyCode, string salesOrderNo, int sourceLineNo, string bomVersion, string routingVersion, CancellationToken cancellationToken);
}
