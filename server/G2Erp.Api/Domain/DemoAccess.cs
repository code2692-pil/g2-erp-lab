using System.Text.Json.Serialization;

namespace G2Erp.Api.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum DemoRole
{
    Viewer,
    Operator,
    Manager,
    Admin
}

public sealed record DemoUser(string Id, string Name, DemoRole Role);

public sealed record DemoSession(string Token, DemoUser User, DateTime ExpiresAt);

public sealed record DemoAuditEntry(
    Guid Id,
    DateTime Timestamp,
    string UserId,
    DemoRole Role,
    string Method,
    string Path,
    string DocumentId,
    string DisplayDocumentNumber,
    int StatusCode,
    string Outcome,
    string TraceId);
