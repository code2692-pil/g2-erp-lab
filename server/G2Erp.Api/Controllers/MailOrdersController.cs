using G2Erp.Api.Contracts;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/mail-orders")]
public sealed class MailOrdersController(IMailOrderParserService service) : ControllerBase
{
    [HttpPost("parse")]
    public async Task<ActionResult<MailOrderParseResponse>> Parse(MailOrderParseRequest request, CancellationToken cancellationToken) =>
        Ok(await service.ParseAsync(request, cancellationToken));
}
