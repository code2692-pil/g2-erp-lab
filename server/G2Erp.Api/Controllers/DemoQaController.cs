using G2Erp.Api.Domain;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace G2Erp.Api.Controllers;

[ApiController]
[Route("api/demo/qa")]
public sealed class DemoQaController(IDemoQaService service) : ControllerBase
{
    [HttpGet("questions")]
    public ActionResult<IReadOnlyList<DemoQaQuestion>> Questions([FromQuery] string? query, [FromQuery] bool unansweredOnly = false) =>
        Ok(service.Search(CurrentUser(), query, unansweredOnly));

    [HttpPost("questions")]
    public ActionResult<DemoQaQuestion> Create([FromBody] CreateDemoQaQuestion request)
    {
        var created = service.Create(CurrentUser(), request);
        HttpContext.Items["DemoAuditDocumentId"] = created.Id;
        HttpContext.Items["DemoAuditDisplayNumber"] = created.DisplayDocumentNumber;
        return Created($"/api/demo/qa/questions/{created.Id}", created);
    }

    [HttpPost("questions/{questionId}/answers")]
    public ActionResult<DemoQaQuestion> Answer(string questionId, [FromBody] AddDemoQaAnswer request)
    {
        HttpContext.Items["DemoAuditDocumentId"] = questionId;
        return Ok(service.AddAnswer(CurrentUser(), questionId, request));
    }

    [HttpPost("questions/{questionId}/accept")]
    public ActionResult<DemoQaQuestion> Accept(string questionId, [FromBody] AcceptDemoQaAnswer request)
    {
        HttpContext.Items["DemoAuditDocumentId"] = questionId;
        return Ok(service.AcceptAnswer(CurrentUser(), questionId, request));
    }

    [HttpPost("questions/{questionId}/reopen")]
    public ActionResult<DemoQaQuestion> Reopen(string questionId, [FromBody] DemoQaVersionRequest request)
    {
        HttpContext.Items["DemoAuditDocumentId"] = questionId;
        return Ok(service.Reopen(CurrentUser(), questionId, request));
    }

    [HttpPost("questions/{questionId}/knowledge")]
    public ActionResult<DemoQaQuestion> Knowledge(string questionId, [FromBody] SetDemoQaKnowledgeRequest request)
    {
        HttpContext.Items["DemoAuditDocumentId"] = questionId;
        return Ok(service.SetKnowledgeApproval(CurrentUser(), questionId, request));
    }

    private DemoUser CurrentUser() => (HttpContext.Items["DemoSession"] as DemoSession)?.User
        ?? throw new InvalidOperationException("Demo session middleware was not applied.");
}
