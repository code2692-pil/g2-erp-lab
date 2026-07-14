using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public sealed class MailOrderParserService : IMailOrderParserService
{
    public Task<MailOrderParseResponse> ParseAsync(MailOrderParseRequest request, CancellationToken cancellationToken) =>
        Task.FromResult(new MailOrderParseResponse
        {
            MAIL_ID = request.MAIL_ID,
            Status = "ContractReady",
            CanApply = false,
            ParserOwner = "frontend",
            Warnings = ["The current sprint keeps the existing frontend mail parser. This endpoint reserves its server migration contract."]
        });
}
