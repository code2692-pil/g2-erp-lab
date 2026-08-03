using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class DemoQaApiTests
{
    [Fact]
    public async Task QuestionsPersistAcrossClientsAndServerRestart_WhilePrivateScopeIsProtected()
    {
        var dataPath = Path.Combine(Path.GetTempPath(), "g2erp-demo-qa-tests", Guid.NewGuid().ToString("N"));
        string questionId;

        using (var factory = CreateFactory(dataPath))
        using (var client = factory.CreateClient())
        {
            var operatorSession = await CreateSessionAsync(client, "demo-operator");
            var viewerSession = await CreateSessionAsync(client, "demo-viewer");
            var create = await SendAsync(client, HttpMethod.Post, "/api/demo/qa/questions", operatorSession.Token, new
            {
                Title = "공유 시연 비공개 질문",
                Body = "작성자와 관리자만 조회해야 합니다.",
                Category = "공통",
                Tags = new[] { "권한", "공유" },
                Visibility = "담당자 전용",
                RelatedRecordType = "SalesOrder",
                RelatedInternalId = "immutable-so-id",
                DisplayDocumentNumber = "SOR2026080099"
            });
            var created = await create.Content.ReadFromJsonAsync<DemoQaQuestion>();
            questionId = created!.Id;

            var viewerQuestions = await SendAsync(client, HttpMethod.Get, "/api/demo/qa/questions", viewerSession.Token);
            var viewerBody = await viewerQuestions.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            Assert.DoesNotContain(questionId, viewerBody, StringComparison.Ordinal);
        }

        using (var restartedFactory = CreateFactory(dataPath))
        using (var restartedClient = restartedFactory.CreateClient())
        {
            var manager = await CreateSessionAsync(restartedClient, "demo-manager");
            var questions = await SendAsync(restartedClient, HttpMethod.Get, "/api/demo/qa/questions?query=SOR2026080099", manager.Token);
            var body = await questions.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, questions.StatusCode);
            Assert.Contains(questionId, body, StringComparison.Ordinal);
            Assert.Contains("immutable-so-id", body, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task ViewerCannotMutate_OperatorCanAnswer_ManagerAccepts_AndStaleVersionConflicts()
    {
        var dataPath = Path.Combine(Path.GetTempPath(), "g2erp-demo-qa-tests", Guid.NewGuid().ToString("N"));
        using var factory = CreateFactory(dataPath);
        using var client = factory.CreateClient();
        var viewer = await CreateSessionAsync(client, "demo-viewer");
        var operatorSession = await CreateSessionAsync(client, "demo-operator");
        var manager = await CreateSessionAsync(client, "demo-manager");

        var viewerCreate = await SendAsync(client, HttpMethod.Post, "/api/demo/qa/questions", viewer.Token, new
        {
            Title = "차단되어야 하는 질문", Body = "Viewer mutation", Category = "공통", Visibility = "전체"
        });
        var create = await SendAsync(client, HttpMethod.Post, "/api/demo/qa/questions", operatorSession.Token, new
        {
            Title = "동시성 확인 질문", Body = "답변 채택 충돌 확인", Category = "공통", Visibility = "전체"
        });
        var question = (await create.Content.ReadFromJsonAsync<DemoQaQuestion>())!;
        var answerResponse = await SendAsync(client, HttpMethod.Post, $"/api/demo/qa/questions/{question.Id}/answers", operatorSession.Token,
            new { Body = "사람이 작성한 답변", ExpectedVersion = question.Version });
        var answered = (await answerResponse.Content.ReadFromJsonAsync<DemoQaQuestion>())!;
        var answerId = answered.Answers.Single().Id;
        var operatorAccept = await SendAsync(client, HttpMethod.Post, $"/api/demo/qa/questions/{question.Id}/accept", operatorSession.Token,
            new { AnswerId = answerId, ExpectedVersion = answered.Version });
        var managerAccept = await SendAsync(client, HttpMethod.Post, $"/api/demo/qa/questions/{question.Id}/accept", manager.Token,
            new { AnswerId = answerId, ExpectedVersion = answered.Version });
        var staleAccept = await SendAsync(client, HttpMethod.Post, $"/api/demo/qa/questions/{question.Id}/accept", manager.Token,
            new { AnswerId = answerId, ExpectedVersion = answered.Version });

        Assert.Equal(HttpStatusCode.Forbidden, viewerCreate.StatusCode);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        Assert.Equal(HttpStatusCode.OK, answerResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, operatorAccept.StatusCode);
        Assert.Equal(HttpStatusCode.OK, managerAccept.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, staleAccept.StatusCode);
        Assert.Contains("새로고침", await staleAccept.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static WebApplicationFactory<Program> CreateFactory(string dataPath) => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("RepositoryMode", "InMemory");
        builder.UseSetting("DemoMode", "true");
        builder.UseSetting("DemoDataPath", dataPath);
    });

    private static async Task<DemoSession> CreateSessionAsync(HttpClient client, string userId)
    {
        var response = await client.PostAsJsonAsync("/api/demo/session", new { UserId = userId });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DemoSession>())!;
    }

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string path, string token, object? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-Demo-Session", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return client.SendAsync(request);
    }
}
