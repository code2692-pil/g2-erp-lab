using G2Erp.Api.Domain;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/sales-conversions")]
public sealed class SalesConversionsController(ISalesConversionService service) : ControllerBase
{
    [HttpPost("purchase-orders")]
    public async Task<ActionResult<PurchaseConversionResult>> ConvertToPurchase([FromBody] PurchaseConversionRequest request, CancellationToken cancellationToken) => Ok(await service.ConvertToPurchaseAsync(request, cancellationToken));

    [HttpPost("work-orders")]
    public async Task<ActionResult<WorkOrderConversionResult>> ConvertToWorkOrder([FromBody] WorkOrderConversionRequest request, CancellationToken cancellationToken) => Ok(await service.ConvertToWorkOrderAsync(request, cancellationToken));

    [HttpGet("work-order-preview")]
    public async Task<ActionResult<SalesConversionMasterPreview>> Preview([FromQuery] string companyCode, [FromQuery] string salesOrderNo, [FromQuery] int sourceLineNo, [FromQuery] string bomVersion, [FromQuery] string routingVersion, CancellationToken cancellationToken) => Ok(await service.GetWorkOrderPreviewAsync(companyCode, salesOrderNo, sourceLineNo, bomVersion, routingVersion, cancellationToken));
}
