using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/purchase-orders")]
public sealed class PurchaseOrdersController(IPurchaseOrderService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PurchaseOrderDetailDto>>> GetAll([FromQuery] string? companyCode, [FromQuery] string? dateFrom, [FromQuery] string? dateTo, [FromQuery] string? purchaseOrderNo, [FromQuery] string? partner, [FromQuery] string? status, CancellationToken cancellationToken) => Ok(await service.GetAllAsync(companyCode, dateFrom, dateTo, purchaseOrderNo, partner, status, cancellationToken));
    [HttpGet("{companyCode}/{purchaseOrderNo}")]
    public async Task<ActionResult<PurchaseOrderDetailDto>> Get(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken) { var order = await service.GetAsync(companyCode, purchaseOrderNo, cancellationToken); return order is null ? NotFound() : Ok(order); }
    [HttpPost]
    public async Task<ActionResult<PurchaseOrderDetailDto>> Create(CreatePurchaseOrderRequest request, CancellationToken cancellationToken) { var order = await service.CreateAsync(request, cancellationToken); return CreatedAtAction(nameof(Get), new { companyCode = order.Header.CD_FIRM, purchaseOrderNo = order.Header.NO_PO }, order); }
    [HttpPut("{companyCode}/{purchaseOrderNo}")]
    public async Task<ActionResult<PurchaseOrderDetailDto>> Update(string companyCode, string purchaseOrderNo, UpdatePurchaseOrderRequest request, CancellationToken cancellationToken) => Ok(await service.UpdateAsync(companyCode, purchaseOrderNo, request, cancellationToken));
    [HttpDelete("{companyCode}/{purchaseOrderNo}")]
    public async Task<IActionResult> Delete(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken) { await service.DeleteAsync(companyCode, purchaseOrderNo, cancellationToken); return NoContent(); }
}
