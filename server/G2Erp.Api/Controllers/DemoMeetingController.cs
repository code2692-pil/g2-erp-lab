using G2Erp.Api.Domain;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/demo/meetings")]
public sealed class DemoMeetingController(IDemoMeetingService service) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<DemoMeeting>> List() => Ok(service.List(CurrentUser()));

    [HttpGet("{meetingId}")]
    public ActionResult<DemoMeeting> Get(string meetingId) => Ok(service.Get(CurrentUser(), meetingId));

    [HttpPost]
    public ActionResult<DemoMeeting> Create([FromBody] CreateDemoMeeting request)
    {
        var created = service.Create(CurrentUser(), request);
        HttpContext.Items["DemoAuditDocumentId"] = created.Id;
        return Created($"/api/demo/meetings/{created.Id}", created);
    }

    [HttpPost("{meetingId}/files")]
    [RequestSizeLimit(DemoMeetingService.MaximumFileBytes + 1024)]
    public async Task<ActionResult<DemoMeeting>> Upload(string meetingId, [FromForm] IFormFile file, [FromForm] int expectedVersion, CancellationToken cancellationToken)
    {
        HttpContext.Items["DemoAuditDocumentId"] = meetingId;
        return Ok(await service.UploadAsync(CurrentUser(), meetingId, file, expectedVersion, cancellationToken));
    }

    [HttpGet("{meetingId}/files/{fileId}")]
    public ActionResult Download(string meetingId, string fileId)
    {
        var download = service.Download(CurrentUser(), meetingId, fileId);
        return PhysicalFile(download.Path, download.File.ContentType, download.File.OriginalName);
    }

    [HttpPost("{meetingId}/approve")]
    public ActionResult<DemoMeeting> Approve(string meetingId, [FromBody] DemoMeetingVersionRequest request)
    {
        HttpContext.Items["DemoAuditDocumentId"] = meetingId;
        return Ok(service.Approve(CurrentUser(), meetingId, request));
    }

    [HttpPost("{meetingId}/questions")]
    public ActionResult<DemoMeeting> Ask(string meetingId, [FromBody] AskDemoMeetingQuestion request)
    {
        HttpContext.Items["DemoAuditDocumentId"] = meetingId;
        return Ok(service.Ask(CurrentUser(), meetingId, request));
    }

    [HttpPost("{meetingId}/files/{fileId}/retry")]
    public ActionResult<DemoMeeting> Retry(string meetingId, string fileId, [FromBody] DemoMeetingVersionRequest request)
    {
        HttpContext.Items["DemoAuditDocumentId"] = meetingId;
        return Ok(service.Retry(CurrentUser(), meetingId, fileId, request));
    }

    private DemoUser CurrentUser() => (HttpContext.Items["DemoSession"] as DemoSession)?.User
        ?? throw new InvalidOperationException("Demo session middleware was not applied.");
}
