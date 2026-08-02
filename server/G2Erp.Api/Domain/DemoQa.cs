namespace G2Erp.Api.Domain;

public sealed record DemoQaAnswer(
    string Id,
    string Body,
    string AuthorUserId,
    string AuthorName,
    DateTime CreatedAt,
    int Version,
    bool Deleted);

public sealed record DemoQaQuestion(
    string Id,
    string Title,
    string Body,
    string Category,
    IReadOnlyList<string> Tags,
    string Visibility,
    string AuthorUserId,
    string AuthorName,
    string RelatedRecordType,
    string RelatedInternalId,
    string DisplayDocumentNumber,
    string Status,
    IReadOnlyList<DemoQaAnswer> Answers,
    string? AcceptedAnswerId,
    bool KnowledgeApproved,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version,
    bool Deleted);
