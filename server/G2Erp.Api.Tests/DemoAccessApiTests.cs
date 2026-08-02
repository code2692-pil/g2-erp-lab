using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class DemoAccessApiTests
{
    [Fact]
    public async Task SharedDemo_RequiresSession_AndReturnsServerValidatedContext()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var users = await client.GetFromJsonAsync<DemoUser[]>("/api/demo/users");
        var anonymous = await client.GetAsync("/api/sales-orders");
        var session = await CreateSessionAsync(client, "demo-viewer");
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/demo/context");
        request.Headers.Add("X-Demo-Session", session.Token);
        var context = await client.SendAsync(request);
        var contextBody = await context.Content.ReadAsStringAsync();

        Assert.Equal(4, users?.Length);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Equal(HttpStatusCode.OK, context.StatusCode);
        Assert.Contains("demo-viewer", contextBody, StringComparison.Ordinal);
        Assert.Contains("ProductionData", contextBody, StringComparison.Ordinal);
        Assert.Contains("false", contextBody, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("demo-viewer")]
    [InlineData("demo-operator")]
    public async Task Reset_IsForbiddenBelowManager(string userId)
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var session = await CreateSessionAsync(client, userId);

        using var request = AuthorizedRequest(HttpMethod.Post, "/api/demo/reset", session.Token,
            JsonContent.Create(new { ConfirmationText = "DEMO RESET" }));
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ManagerReset_RequiresExactConfirmation_SeedsKnownDevelopmentData_AndWritesAudit()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var manager = await CreateSessionAsync(client, "demo-manager");

        using var wrongRequest = AuthorizedRequest(HttpMethod.Post, "/api/demo/reset", manager.Token,
            JsonContent.Create(new { ConfirmationText = "RESET" }));
        var wrong = await client.SendAsync(wrongRequest);
        using var resetRequest = AuthorizedRequest(HttpMethod.Post, "/api/demo/reset", manager.Token,
            JsonContent.Create(new { ConfirmationText = "DEMO RESET" }));
        var reset = await client.SendAsync(resetRequest);
        var resetBody = await reset.Content.ReadAsStringAsync();
        using var auditRequest = AuthorizedRequest(HttpMethod.Get, "/api/demo/audit", manager.Token);
        var audit = await client.SendAsync(auditRequest);
        var auditBody = await audit.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Contains("FINAL-UAT-202608", resetBody, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, audit.StatusCode);
        Assert.Contains("/api/demo/reset", auditBody, StringComparison.Ordinal);
        Assert.Contains("demo-manager", auditBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ViewerCannotReadAudit_ButDeniedMutationIsAuditedForManager()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var viewer = await CreateSessionAsync(client, "demo-viewer");
        var manager = await CreateSessionAsync(client, "demo-manager");

        using var deniedRequest = AuthorizedRequest(HttpMethod.Post, "/api/demo/reset", viewer.Token,
            JsonContent.Create(new { ConfirmationText = "DEMO RESET" }));
        var denied = await client.SendAsync(deniedRequest);
        using var viewerAuditRequest = AuthorizedRequest(HttpMethod.Get, "/api/demo/audit", viewer.Token);
        var viewerAudit = await client.SendAsync(viewerAuditRequest);
        using var managerAuditRequest = AuthorizedRequest(HttpMethod.Get, "/api/demo/audit", manager.Token);
        var managerAudit = await client.SendAsync(managerAuditRequest);
        var managerAuditBody = await managerAudit.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, viewerAudit.StatusCode);
        Assert.Equal(HttpStatusCode.OK, managerAudit.StatusCode);
        Assert.Contains("demo-viewer", managerAuditBody, StringComparison.Ordinal);
        Assert.Contains("403", managerAuditBody, StringComparison.Ordinal);
    }

    [Fact]
    public void ProductionCannotStartWithDemoModeEnabled()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("DemoMode", "true");
        });

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("DemoMode can only run", error.ToString(), StringComparison.Ordinal);
    }

    private static WebApplicationFactory<Program> CreateFactory() => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("RepositoryMode", "InMemory");
        builder.UseSetting("DemoMode", "true");
    });

    private static async Task<DemoSession> CreateSessionAsync(HttpClient client, string userId)
    {
        var response = await client.PostAsJsonAsync("/api/demo/session", new { UserId = userId });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<DemoSession>())!;
    }

    private static HttpRequestMessage AuthorizedRequest(HttpMethod method, string path, string token, HttpContent? content = null)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Add("X-Demo-Session", token);
        return request;
    }
}
