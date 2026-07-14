namespace G2Erp.Api.Contracts;

// The frontend remains the active parser in this sprint. These DTOs fix the API boundary for its later migration.
public sealed class MailOrderParseRequest
{
    public required string MAIL_ID { get; init; }
    public required string SUBJECT { get; init; }
    public required string BODY_TEXT { get; init; }
    public string? FROM_ADDRESS { get; init; }
    public string? RECEIVED_AT { get; init; }
}

public sealed class MailOrderParseResponse
{
    public required string MAIL_ID { get; init; }
    public required string Status { get; init; }
    public required bool CanApply { get; init; }
    public required string ParserOwner { get; init; }
    public required IReadOnlyList<string> Warnings { get; init; }
}
