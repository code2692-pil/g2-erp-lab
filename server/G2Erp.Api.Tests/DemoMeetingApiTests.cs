using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using G2Erp.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class DemoMeetingApiTests
{
    [Fact]
    public async Task MeetingUpload_IsServerPersisted_ExtractedInBackground_AndManagerApproved()
    {
        var dataPath = Path.Combine(Path.GetTempPath(), "g2erp-demo-meeting-tests", Guid.NewGuid().ToString("N"));
        string meetingId;

        using (var factory = CreateFactory(dataPath))
        using (var client = factory.CreateClient())
        {
            var viewer = await CreateSessionAsync(client, "demo-viewer");
            var operatorSession = await CreateSessionAsync(client, "demo-operator");
            var viewerCreate = await SendJsonAsync(client, HttpMethod.Post, "/api/demo/meetings", viewer.Token, new { Title = "차단 회의" });
            var create = await SendJsonAsync(client, HttpMethod.Post, "/api/demo/meetings", operatorSession.Token, new { Title = "생산 일정 회의", MeetingDate = "2026-08-03" });
            var meeting = (await create.Content.ReadFromJsonAsync<DemoMeeting>())!;
            meetingId = meeting.Id;
            using var listRequest = new HttpRequestMessage(HttpMethod.Get, "/api/demo/meetings");
            listRequest.Headers.Add("X-Demo-Session", operatorSession.Token);
            using var listResponse = await client.SendAsync(listRequest);
            var meetingList = await listResponse.Content.ReadFromJsonAsync<DemoMeeting[]>();
            var upload = await UploadAsync(client, meetingId, operatorSession.Token, meeting.Version, "agenda.txt", "text/plain", "결정: 8월 10일까지 시제품 20개를 생산한다.\n할 일: 김담당이 자재를 확인한다.");
            var queued = (await upload.Content.ReadFromJsonAsync<DemoMeeting>())!;
            var duplicate = await UploadAsync(client, meetingId, operatorSession.Token, queued.Version, "agenda-copy.txt", "text/plain", "결정: 8월 10일까지 시제품 20개를 생산한다.\n할 일: 김담당이 자재를 확인한다.");
            var completed = await WaitForCompletionAsync(client, meetingId, operatorSession.Token);
            var ask = await SendJsonAsync(client, HttpMethod.Post, $"/api/demo/meetings/{meetingId}/questions", operatorSession.Token,
                new { Question = "시제품 생산 기한은 언제인가요?", ExpectedVersion = completed.Version });
            var questioned = (await ask.Content.ReadFromJsonAsync<DemoMeeting>())!;

            Assert.Equal(HttpStatusCode.Forbidden, viewerCreate.StatusCode);
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            Assert.Equal("2026-08-03", meeting.MeetingDate);
            Assert.Contains(meetingList!, item => item.Id == meetingId && item.MeetingDate == "2026-08-03");
            Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
            Assert.Equal("검토 대기", completed.Status);
            Assert.Contains(completed.Files.Single().Segments, segment => segment.Text.Contains("시제품 20개", StringComparison.Ordinal));
            Assert.Equal(HttpStatusCode.OK, ask.StatusCode);
            Assert.Contains("시제품 20개", questioned.Questions.Single().Answer, StringComparison.Ordinal);
        }

        using (var restartedFactory = CreateFactory(dataPath))
        using (var restartedClient = restartedFactory.CreateClient())
        {
            var manager = await CreateSessionAsync(restartedClient, "demo-manager");
            var operatorSession = await CreateSessionAsync(restartedClient, "demo-operator");
            var meeting = await GetAsync(restartedClient, meetingId, manager.Token);
            Assert.Single(meeting.Questions);
            var operatorApprove = await SendJsonAsync(restartedClient, HttpMethod.Post, $"/api/demo/meetings/{meetingId}/approve", operatorSession.Token, new { ExpectedVersion = meeting.Version });
            var approve = await SendJsonAsync(restartedClient, HttpMethod.Post, $"/api/demo/meetings/{meetingId}/approve", manager.Token, new { ExpectedVersion = meeting.Version });
            var approved = await approve.Content.ReadFromJsonAsync<DemoMeeting>();

            Assert.Equal(HttpStatusCode.Forbidden, operatorApprove.StatusCode);
            Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
            Assert.Equal("승인", approved?.Status);
        }
    }

    [Fact]
    public async Task Upload_RejectsFakeOfficeContent_PathTraversal_AndOversizeMetadataBeforeStorage()
    {
        var dataPath = Path.Combine(Path.GetTempPath(), "g2erp-demo-meeting-tests", Guid.NewGuid().ToString("N"));
        using var factory = CreateFactory(dataPath);
        using var client = factory.CreateClient();
        var session = await CreateSessionAsync(client, "demo-operator");
        var create = await SendJsonAsync(client, HttpMethod.Post, "/api/demo/meetings", session.Token, new { Title = "파일 보안 회의" });
        var meeting = (await create.Content.ReadFromJsonAsync<DemoMeeting>())!;

        var fakeOffice = await UploadAsync(client, meeting.Id, session.Token, meeting.Version, "fake.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "not a zip package");
        var traversal = await UploadAsync(client, meeting.Id, session.Token, meeting.Version, "../escape.txt", "text/plain", "safe text");

        Assert.Equal(HttpStatusCode.BadRequest, fakeOffice.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, traversal.StatusCode);
        Assert.Contains("실제 형식", await fakeOffice.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Contains("파일명", await traversal.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static async Task<DemoMeeting> WaitForCompletionAsync(HttpClient client, string meetingId, string token)
    {
        for (var attempt = 0; attempt < 40; attempt++)
        {
            var meeting = await GetAsync(client, meetingId, token);
            if (meeting.Files.All(file => file.Status is "완료" or "실패")) return meeting;
            await Task.Delay(25);
        }
        throw new TimeoutException("Meeting extraction did not complete during the focused integration test.");
    }

    private static async Task<DemoMeeting> GetAsync(HttpClient client, string meetingId, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/demo/meetings/{meetingId}");
        request.Headers.Add("X-Demo-Session", token);
        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DemoMeeting>())!;
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, string meetingId, string token, int version, string fileName, string contentType, string content)
    {
        var multipart = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(content));
        file.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        multipart.Add(file, "file", fileName);
        multipart.Add(new StringContent(version.ToString()), "expectedVersion");
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/demo/meetings/{meetingId}/files") { Content = multipart };
        request.Headers.Add("X-Demo-Session", token);
        return await client.SendAsync(request);
    }

    private static WebApplicationFactory<Program> CreateFactory(string dataPath) => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("RepositoryMode", "InMemory");
        builder.UseSetting("DemoMode", "true");
        builder.UseSetting("DemoDataPath", dataPath);
        builder.ConfigureLogging(logging => logging.ClearProviders());
    });

    private static async Task<DemoSession> CreateSessionAsync(HttpClient client, string userId)
    {
        var response = await client.PostAsJsonAsync("/api/demo/session", new { UserId = userId });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DemoSession>())!;
    }

    private static Task<HttpResponseMessage> SendJsonAsync(HttpClient client, HttpMethod method, string path, string token, object body)
    {
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-Demo-Session", token);
        return client.SendAsync(request);
    }
}
