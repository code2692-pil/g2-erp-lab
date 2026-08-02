using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/demo")]
public sealed class DemoController(IDemoAccessService access, IDevelopmentDataService developmentData, IDemoQaService demoQa, IDemoMeetingService demoMeetings) : ControllerBase
{
    private static readonly SemaphoreSlim ResetLock = new(1, 1);

    [HttpGet("users")]
    public ActionResult<IReadOnlyList<DemoUser>> Users() => Ok(access.GetUsers());

    [HttpPost("session")]
    public ActionResult<DemoSession> Session([FromBody] DemoSessionRequest request) => Ok(access.CreateSession(request.UserId));

    [HttpGet("context")]
    public ActionResult<object> Context()
    {
        var session = CurrentSession();
        return Ok(new { session.User, session.ExpiresAt, Environment = "G2 ERP", ProductionData = false });
    }

    [HttpGet("audit")]
    public ActionResult<IReadOnlyList<DemoAuditEntry>> Audit()
    {
        var session = CurrentSession();
        return session.User.Role is DemoRole.Manager or DemoRole.Admin
            ? Ok(access.GetAudit())
            : StatusCode(StatusCodes.Status403Forbidden);
    }

    [HttpPost("reset")]
    public async Task<ActionResult<object>> Reset([FromBody] DemoResetRequest request, CancellationToken cancellationToken)
    {
        var session = CurrentSession();
        if (session.User.Role is not (DemoRole.Manager or DemoRole.Admin)) return StatusCode(StatusCodes.Status403Forbidden);
        if (!string.Equals(request.ConfirmationText, "DEMO RESET", StringComparison.Ordinal))
            return BadRequest(new { error = "초기 데이터 복원 요청을 확인할 수 없습니다.", traceId = HttpContext.TraceIdentifier });
        if (!await ResetLock.WaitAsync(0, cancellationToken))
            return Conflict(new { error = "다른 데이터 복원 작업이 진행 중입니다.", traceId = HttpContext.TraceIdentifier });
        try
        {
            var cleanup = await developmentData.CleanupAsync(new DevelopmentDataRequest { Scope = "all", ConfirmationText = "SAMPLE DELETE" }, cancellationToken);
            if (!string.Equals(cleanup.Status, "Success", StringComparison.Ordinal)) return Conflict(cleanup);
            var seed = await developmentData.SeedAsync("all", cancellationToken);
            demoQa.Reset();
            demoMeetings.Reset();
            return Ok(new { Status = seed.Status, Cleanup = cleanup, Seed = seed, ResetAt = DateTime.UtcNow, SeedVersion = "2026.08" });
        }
        finally
        {
            ResetLock.Release();
        }
    }

    private DemoSession CurrentSession() => HttpContext.Items["DemoSession"] as DemoSession
        ?? throw new InvalidOperationException("Demo session middleware was not applied.");
}

public sealed record DemoSessionRequest(string UserId);
public sealed record DemoResetRequest(string ConfirmationText);
