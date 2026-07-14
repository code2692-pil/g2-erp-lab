using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/partners")]
public sealed class PartnersController(IPartnerService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PartnerDto>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await service.GetAllAsync(cancellationToken));
}
