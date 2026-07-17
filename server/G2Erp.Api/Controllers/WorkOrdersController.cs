using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/work-orders")]
public sealed class WorkOrdersController(IWorkOrderService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WorkOrderDetailDto>>> GetAll(
        [FromQuery] string? companyCode,
        [FromQuery] string? dateFrom,
        [FromQuery] string? dateTo,
        [FromQuery] string? workOrderNo,
        [FromQuery] string? item,
        [FromQuery] string? productionLine,
        [FromQuery] string? status,
        [FromQuery] string? urgent,
        CancellationToken cancellationToken) =>
        Ok(await service.GetAllAsync(companyCode, dateFrom, dateTo, workOrderNo, item, productionLine, status, urgent, cancellationToken));

    [HttpGet("{companyCode}/{workOrderNo}")]
    public async Task<ActionResult<WorkOrderDetailDto>> Get(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        var workOrder = await service.GetAsync(companyCode, workOrderNo, cancellationToken);
        return workOrder is null ? NotFound() : Ok(workOrder);
    }

    [HttpPost]
    public async Task<ActionResult<WorkOrderDetailDto>> Create(CreateWorkOrderRequest request, CancellationToken cancellationToken)
    {
        var workOrder = await service.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { companyCode = workOrder.Header.CD_FIRM, workOrderNo = workOrder.Header.NO_WO }, workOrder);
    }

    [HttpPut("{companyCode}/{workOrderNo}")]
    public async Task<ActionResult<WorkOrderDetailDto>> Update(string companyCode, string workOrderNo, UpdateWorkOrderRequest request, CancellationToken cancellationToken) =>
        Ok(await service.UpdateAsync(companyCode, workOrderNo, request, cancellationToken));

    [HttpDelete("{companyCode}/{workOrderNo}")]
    public async Task<IActionResult> Delete(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        await service.DeleteAsync(companyCode, workOrderNo, cancellationToken);
        return NoContent();
    }
}
