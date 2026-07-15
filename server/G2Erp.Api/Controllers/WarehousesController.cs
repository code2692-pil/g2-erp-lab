using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/warehouses")]
public sealed class WarehousesController(IWarehouseService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WarehouseDto>>> GetAll(CancellationToken cancellationToken) => Ok(await service.GetAllAsync(cancellationToken));
}
