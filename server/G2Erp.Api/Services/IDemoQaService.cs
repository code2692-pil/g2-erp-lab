using G2Erp.Api.Domain;

namespace G2Erp.Api.Services;

public interface IDemoQaService
{
    IReadOnlyList<DemoQaQuestion> Search(DemoUser user, string? query, bool unansweredOnly);
    DemoQaQuestion Create(DemoUser user, CreateDemoQaQuestion request);
    DemoQaQuestion AddAnswer(DemoUser user, string questionId, AddDemoQaAnswer request);
    DemoQaQuestion AcceptAnswer(DemoUser user, string questionId, AcceptDemoQaAnswer request);
    DemoQaQuestion Reopen(DemoUser user, string questionId, DemoQaVersionRequest request);
    DemoQaQuestion SetKnowledgeApproval(DemoUser user, string questionId, SetDemoQaKnowledgeRequest request);
    void Reset();
}

public sealed record CreateDemoQaQuestion(
    string Title,
    string Body,
    string Category,
    IReadOnlyList<string>? Tags,
    string Visibility,
    string? RelatedRecordType,
    string? RelatedInternalId,
    string? DisplayDocumentNumber);

public sealed record AddDemoQaAnswer(string Body, int ExpectedVersion);
public sealed record AcceptDemoQaAnswer(string AnswerId, int ExpectedVersion);
public sealed record DemoQaVersionRequest(int ExpectedVersion);
public sealed record SetDemoQaKnowledgeRequest(bool Approved, int ExpectedVersion);
