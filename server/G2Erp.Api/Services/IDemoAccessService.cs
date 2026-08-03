using G2Erp.Api.Domain;

namespace G2Erp.Api.Services;

public interface IDemoAccessService
{
    IReadOnlyList<DemoUser> GetUsers();
    DemoSession CreateSession(string userId);
    DemoSession? ResolveSession(string? token);
    bool CanAccess(DemoSession session, string method, PathString path);
    void AppendAudit(DemoSession session, HttpContext context);
    IReadOnlyList<DemoAuditEntry> GetAudit();
}
