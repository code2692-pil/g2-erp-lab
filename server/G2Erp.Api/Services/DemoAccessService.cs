using System.Collections.Concurrent;
using G2Erp.Api.Domain;

namespace G2Erp.Api.Services;

public sealed class DemoAccessService : IDemoAccessService
{
    private static readonly IReadOnlyList<DemoUser> Users =
    [
        new("demo-viewer", "Demo Viewer", DemoRole.Viewer),
        new("demo-operator", "Demo Operator", DemoRole.Operator),
        new("demo-manager", "Demo Manager", DemoRole.Manager),
        new("demo-admin", "Demo Admin", DemoRole.Admin)
    ];

    private readonly ConcurrentDictionary<string, DemoSession> sessions = new(StringComparer.Ordinal);
    private readonly ConcurrentQueue<DemoAuditEntry> audit = new();

    public IReadOnlyList<DemoUser> GetUsers() => Users;

    public DemoSession CreateSession(string userId)
    {
        var user = Users.SingleOrDefault(candidate => string.Equals(candidate.Id, userId, StringComparison.Ordinal))
            ?? throw new DomainValidationException(["허용된 Demo 사용자를 선택하세요."]);
        var session = new DemoSession(Guid.NewGuid().ToString("N"), user, DateTime.UtcNow.AddHours(8));
        sessions[session.Token] = session;
        return session;
    }

    public DemoSession? ResolveSession(string? token)
    {
        if (string.IsNullOrWhiteSpace(token) || !sessions.TryGetValue(token, out var session)) return null;
        if (session.ExpiresAt > DateTime.UtcNow) return session;
        sessions.TryRemove(token, out _);
        return null;
    }

    public bool CanAccess(DemoSession session, string method, PathString path)
    {
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method)) return true;
        if (path.StartsWithSegments("/api/demo/session")) return true;
        if (path.StartsWithSegments("/api/demo/reset") || path.StartsWithSegments("/api/development-data"))
            return session.User.Role is DemoRole.Manager or DemoRole.Admin;
        return session.User.Role is DemoRole.Operator or DemoRole.Manager or DemoRole.Admin;
    }

    public void AppendAudit(DemoSession session, HttpContext context)
    {
        audit.Enqueue(new DemoAuditEntry(
            Guid.NewGuid(),
            DateTime.UtcNow,
            session.User.Id,
            session.User.Role,
            context.Request.Method,
            context.Request.Path.Value ?? string.Empty,
            context.Items["DemoAuditDocumentId"]?.ToString() ?? string.Empty,
            context.Items["DemoAuditDisplayNumber"]?.ToString() ?? string.Empty,
            context.Response.StatusCode,
            context.Response.StatusCode < 400 ? "Success" : "Failed",
            context.TraceIdentifier));
        while (audit.Count > 500) audit.TryDequeue(out _);
    }

    public IReadOnlyList<DemoAuditEntry> GetAudit() => audit.Reverse().ToArray();
}
