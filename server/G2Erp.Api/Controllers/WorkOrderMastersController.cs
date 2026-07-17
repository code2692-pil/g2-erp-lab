using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class WorkOrderMastersController(IWorkOrderService service) : ControllerBase
{
    [HttpGet("production-lines")]
    public async Task<ActionResult<IReadOnlyList<ProductionLineDto>>> GetProductionLines([FromQuery] string? companyCode, [FromQuery] string? useYn, [FromQuery] string? keyword, CancellationToken cancellationToken) =>
        Ok(await service.GetProductionLinesAsync(companyCode, useYn, keyword, cancellationToken));

    [HttpGet("processes")]
    public async Task<ActionResult<IReadOnlyList<ProductionProcessDto>>> GetProcesses([FromQuery] string? companyCode, [FromQuery] string? useYn, [FromQuery] string? keyword, CancellationToken cancellationToken) =>
        Ok(await service.GetProcessesAsync(companyCode, useYn, keyword, cancellationToken));

    [HttpGet("equipment")]
    public async Task<ActionResult<IReadOnlyList<EquipmentDto>>> GetEquipment([FromQuery] string? companyCode, [FromQuery] string? lineCode, [FromQuery] string? useYn, [FromQuery] string? keyword, CancellationToken cancellationToken) =>
        Ok(await service.GetEquipmentAsync(companyCode, lineCode, useYn, keyword, cancellationToken));
}
