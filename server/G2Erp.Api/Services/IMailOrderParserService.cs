using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface IMailOrderParserService
{
    Task<MailOrderParseResponse> ParseAsync(MailOrderParseRequest request, CancellationToken cancellationToken);
}
