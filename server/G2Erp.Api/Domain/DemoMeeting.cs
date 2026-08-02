namespace G2Erp.Api.Domain;

public sealed record DemoMeetingSegment(string Id, string FileId, string FileName, string Locator, string Text);

public sealed record DemoMeetingFile(
    string Id,
    string OriginalName,
    string ContentType,
    long Size,
    string Sha256,
    string StorageName,
    string Status,
    string? Error,
    DateTime UploadedAt,
    IReadOnlyList<DemoMeetingSegment> Segments);

public sealed record DemoMeetingQuestion(
    string Id,
    string Question,
    string Answer,
    string SourceSegmentId,
    string AuthorUserId,
    DateTime CreatedAt);

public sealed record DemoMeeting(
    string Id,
    string Title,
    string OwnerUserId,
    string Status,
    IReadOnlyList<DemoMeetingFile> Files,
    IReadOnlyList<DemoMeetingQuestion> Questions,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version,
    bool Deleted);
