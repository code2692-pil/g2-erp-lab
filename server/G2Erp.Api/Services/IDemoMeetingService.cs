using G2Erp.Api.Domain;

namespace G2Erp.Api.Services;

public interface IDemoMeetingService
{
    IReadOnlyList<DemoMeeting> List(DemoUser user);
    DemoMeeting Get(DemoUser user, string meetingId);
    DemoMeeting Create(DemoUser user, CreateDemoMeeting request);
    Task<DemoMeeting> UploadAsync(DemoUser user, string meetingId, IFormFile file, int expectedVersion, CancellationToken cancellationToken);
    DemoMeeting Approve(DemoUser user, string meetingId, DemoMeetingVersionRequest request);
    DemoMeeting Ask(DemoUser user, string meetingId, AskDemoMeetingQuestion request);
    DemoMeeting Retry(DemoUser user, string meetingId, string fileId, DemoMeetingVersionRequest request);
    (string Path, DemoMeetingFile File) Download(DemoUser user, string meetingId, string fileId);
    void Reset();
}

public sealed record CreateDemoMeeting(string Title, string? MeetingDate = null);
public sealed record DemoMeetingVersionRequest(int ExpectedVersion);
public sealed record AskDemoMeetingQuestion(string Question, int ExpectedVersion);
