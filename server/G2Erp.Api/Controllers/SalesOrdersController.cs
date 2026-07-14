using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/sales-orders")]
public sealed class SalesOrdersController(ISalesOrderService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<SalesOrderDto>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await service.GetAllAsync(cancellationToken));

    [HttpGet("{companyCode}/{salesOrderNo}")]
    public async Task<ActionResult<SalesOrderDto>> Get(string companyCode, string salesOrderNo, CancellationToken cancellationToken)
    {
        var salesOrder = await service.GetAsync(companyCode, salesOrderNo, cancellationToken);
        return salesOrder is null ? NotFound() : Ok(salesOrder);
    }

    [HttpPost]
    public async Task<ActionResult<SalesOrderDto>> Create(UpsertSalesOrderRequest request, CancellationToken cancellationToken)
    {
        var salesOrder = await service.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { companyCode = salesOrder.Header.CD_FIRM, salesOrderNo = salesOrder.Header.NO_SO }, salesOrder);
    }

    [HttpPut("{companyCode}/{salesOrderNo}")]
    public async Task<ActionResult<SalesOrderDto>> Update(string companyCode, string salesOrderNo, UpsertSalesOrderRequest request, CancellationToken cancellationToken) =>
        Ok(await service.UpdateAsync(companyCode, salesOrderNo, request, cancellationToken));

    [HttpDelete("{companyCode}/{salesOrderNo}")]
    public async Task<IActionResult> Delete(string companyCode, string salesOrderNo, CancellationToken cancellationToken)
    {
        await service.DeleteAsync(companyCode, salesOrderNo, cancellationToken);
        return NoContent();
    }
}
