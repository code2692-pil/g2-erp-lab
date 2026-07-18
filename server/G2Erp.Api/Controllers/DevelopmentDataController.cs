using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/development-data")]
public sealed class DevelopmentDataController(IDevelopmentDataService service) : ControllerBase
{
    [HttpGet("status")]
    public async Task<ActionResult<DevelopmentDataEnvironmentDto>> Status(CancellationToken cancellationToken) => Ok(await service.GetStatusAsync(cancellationToken));

    [HttpGet("summary")]
    public async Task<ActionResult<DevelopmentDataSummaryDto>> Summary(CancellationToken cancellationToken) => Ok(await service.GetSummaryAsync(cancellationToken));

    [HttpPost("preview")]
    public async Task<ActionResult<DevelopmentDataPreviewDto>> Preview([FromBody] DevelopmentDataRequest? request, CancellationToken cancellationToken) => Ok(await service.PreviewAsync(request ?? new DevelopmentDataRequest(), cancellationToken));

    [HttpPost("seed/production-masters")]
    public async Task<ActionResult<DevelopmentDataOperationDto>> SeedProductionMasters(CancellationToken cancellationToken) => Ok(await service.SeedAsync("production-masters", cancellationToken));

    [HttpPost("seed/sales-orders")]
    public async Task<ActionResult<DevelopmentDataOperationDto>> SeedSalesOrders(CancellationToken cancellationToken) => Ok(await service.SeedAsync("sales-orders", cancellationToken));

    [HttpPost("seed/purchase-orders")]
    public async Task<ActionResult<DevelopmentDataOperationDto>> SeedPurchaseOrders(CancellationToken cancellationToken) => Ok(await service.SeedAsync("purchase-orders", cancellationToken));

    [HttpPost("seed/work-orders")]
    public async Task<ActionResult<DevelopmentDataOperationDto>> SeedWorkOrders(CancellationToken cancellationToken) => Ok(await service.SeedAsync("work-orders", cancellationToken));

    [HttpPost("seed/all")]
    public async Task<ActionResult<DevelopmentDataOperationDto>> SeedAll(CancellationToken cancellationToken) => Ok(await service.SeedAsync("all", cancellationToken));

    [HttpPost("cleanup/samples")]
    public async Task<ActionResult<DevelopmentDataOperationDto>> Cleanup([FromBody] DevelopmentDataRequest? request, CancellationToken cancellationToken) => Ok(await service.CleanupAsync(request ?? new DevelopmentDataRequest(), cancellationToken));

    [HttpGet("e2e-remnants")]
    public async Task<ActionResult<DevelopmentDataE2ERemnantsDto>> E2ERemnants(CancellationToken cancellationToken) => Ok(await service.GetE2ERemnantsAsync(cancellationToken));
}
