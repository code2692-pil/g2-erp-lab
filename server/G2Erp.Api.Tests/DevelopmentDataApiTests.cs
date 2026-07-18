using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Globalization;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using G2Erp.Api.Domain.WorkOrders;
using G2Erp.Api.Repositories;
using G2Erp.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class DevelopmentDataApiTests
{
    [Fact]
    public void DevelopmentDataWorkOrderSampleDates_AreValidAndOrdered()
    {
        Assert.Equal(6, SampleData.WorkOrders.Count);
        Assert.Equal(18, SampleData.WorkOrders.Sum(x => x.Processes.Count));

        foreach (var order in SampleData.WorkOrders)
        {
            Assert.True(DateOnly.TryParseExact(order.Header.DT_WO, SampleData.SampleDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _));
            Assert.True(DateOnly.TryParseExact(order.Header.DT_PLAN_START, SampleData.SampleDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var planStart));
            Assert.True(DateOnly.TryParseExact(order.Header.DT_PLAN_END, SampleData.SampleDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var planEnd));
            Assert.True(planStart <= planEnd, order.Header.NO_WO);

            DateTime? previousStart = null;
            DateTime? previousEnd = null;
            foreach (var process in order.Processes.OrderBy(x => x.NO_PROC))
            {
                Assert.True(DateTime.TryParseExact(process.TM_PLAN_START, SampleData.SampleDateTimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var processStart), $"{order.Header.NO_WO}/{process.NO_PROC}: {process.TM_PLAN_START}");
                Assert.True(DateTime.TryParseExact(process.TM_PLAN_END, SampleData.SampleDateTimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var processEnd), $"{order.Header.NO_WO}/{process.NO_PROC}: {process.TM_PLAN_END}");
                Assert.True(processStart <= processEnd, $"{order.Header.NO_WO}/{process.NO_PROC}");
                Assert.InRange(DateOnly.FromDateTime(processStart), planStart, planEnd);
                Assert.InRange(DateOnly.FromDateTime(processEnd), planStart, planEnd);
                if (previousStart is not null) Assert.True(previousStart <= processStart, $"{order.Header.NO_WO}/{process.NO_PROC}: start order");
                if (previousEnd is not null) Assert.True(previousEnd <= processEnd, $"{order.Header.NO_WO}/{process.NO_PROC}: end order");
                previousStart = processStart;
                previousEnd = processEnd;
            }
        }

        DevelopmentDataService.ValidateWorkOrderSampleDates(SampleData.WorkOrders);
    }

    [Theory]
    [InlineData(8, "2026-08-04T08:00:00")]
    [InlineData(9, "2026-08-04T09:00:00")]
    [InlineData(10, "2026-08-04T10:00:00")]
    [InlineData(11, "2026-08-04T11:00:00")]
    [InlineData(23, "2026-08-04T23:00:00")]
    public void WorkOrderSampleDateTimeFormat_UsesTwoDigitHours(int hour, string expected)
    {
        var value = SampleData.FormatSampleDateTime(new DateTime(2026, 8, 4, hour, 0, 0, DateTimeKind.Unspecified));
        Assert.Equal(expected, value);
        Assert.True(DateTime.TryParseExact(value, SampleData.SampleDateTimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _));
    }

    [Theory]
    [InlineData("2026-08-04T010:00:00")]
    [InlineData("2026-08-04T011:00:00")]
    [InlineData("2026-08-04T024:00:00")]
    [InlineData("08/04/2026 10:00")]
    public void WorkOrderSampleDateTimeFormat_RejectsMalformedValues(string value) =>
        Assert.False(DateTime.TryParseExact(value, SampleData.SampleDateTimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out _));

    [Fact]
    public void WorkOrderSampleDateValidation_RejectsMalformedValueBeforeRepositoryAccess()
    {
        var validOrder = SampleData.WorkOrders[0];
        var malformedProcess = validOrder.Processes[0] with { TM_PLAN_START = "2026-08-04T010:00:00" };
        var malformedOrder = new WorkOrder { Header = validOrder.Header, Processes = [malformedProcess, .. validOrder.Processes.Skip(1)] };

        var error = Assert.Throws<InvalidOperationException>(() => DevelopmentDataService.ValidateWorkOrderSampleDates([malformedOrder]));
        Assert.Contains("NO_WO=WO-SAMPLE-0001", error.Message, StringComparison.Ordinal);
        Assert.Contains("NO_PROC=10", error.Message, StringComparison.Ordinal);
        Assert.Contains("Field=TM_PLAN_START", error.Message, StringComparison.Ordinal);
        Assert.Contains("Value=2026-08-04T010:00:00", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task DevelopmentInMemory_StatusSummaryPreviewAndReRun_AreSafeAndIdempotent()
    {
        using var factory = CreateDevelopmentFactory();
        using var client = factory.CreateClient();
        await CleanupAllAsync(client);

        var status = await client.GetFromJsonAsync<DevelopmentDataEnvironmentDto>("/api/development-data/status");
        var before = await client.GetFromJsonAsync<DevelopmentDataSummaryDto>("/api/development-data/summary");
        var previewResponse = await client.PostAsJsonAsync("/api/development-data/preview", new DevelopmentDataRequest { Scope = "all" });
        var preview = await previewResponse.Content.ReadFromJsonAsync<DevelopmentDataPreviewDto>();
        var afterPreview = await client.GetFromJsonAsync<DevelopmentDataSummaryDto>("/api/development-data/summary");

        Assert.NotNull(status); Assert.True(status.IsAllowed); Assert.Equal("InMemory", status.RepositoryMode); Assert.Equal("InMemory", status.Database);
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        Assert.NotNull(before); Assert.NotNull(preview); Assert.NotNull(afterPreview);
        Assert.False(preview.DeletesData); Assert.Equal(90, preview.NewRows); Assert.Equal(0, preview.ExistingRows); Assert.Equal(0, preview.ConflictRows);
        AssertSummaryEqual(before, afterPreview);

        var firstSeed = await client.PostAsync("/api/development-data/seed/all", null);
        var firstResult = await firstSeed.Content.ReadFromJsonAsync<DevelopmentDataOperationDto>();
        var seeded = await client.GetFromJsonAsync<DevelopmentDataSummaryDto>("/api/development-data/summary");
        var secondSeed = await client.PostAsync("/api/development-data/seed/all", null);
        var secondResult = await secondSeed.Content.ReadFromJsonAsync<DevelopmentDataOperationDto>();

        Assert.Equal(HttpStatusCode.OK, firstSeed.StatusCode); Assert.Equal("Success", firstResult?.Status); Assert.Equal(90, firstResult?.CreatedRows);
        Assert.NotNull(seeded); Assert.Equal(6, seeded.SampleItems); Assert.Equal(3, seeded.SampleProductionLines); Assert.Equal(8, seeded.SampleProcesses); Assert.Equal(8, seeded.SampleEquipment);
        Assert.Equal(6, seeded.SampleSalesOrders); Assert.Equal(13, seeded.SampleSalesOrderLines); Assert.Equal(6, seeded.SamplePurchaseOrders); Assert.Equal(13, seeded.SamplePurchaseOrderLines); Assert.Equal(6, seeded.SampleWorkOrders); Assert.Equal(18, seeded.SampleWorkOrderProcesses);
        Assert.Equal(HttpStatusCode.OK, secondSeed.StatusCode); Assert.Equal("Success", secondResult?.Status); Assert.Equal(0, secondResult?.CreatedRows); Assert.Equal(90, secondResult?.SkippedRows);

        await CleanupAllAsync(client);
    }

    [Fact]
    public async Task Cleanup_RequiresExactConfirmation_ProtectsNonSampleRows_AndBlocksMasterOnlyCleanupWhenReferenced()
    {
        using var factory = CreateDevelopmentFactory();
        using var client = factory.CreateClient();
        await CleanupAllAsync(client);
        var items = factory.Services.GetRequiredService<IItemRepository>();
        await items.AddAsync(new Item { CD_FIRM = "1000", CD_ITEM = "BUSINESS-KEEP-001", NM_ITEM = "Business Fixture", STND_ITEM = "KEEP", UNIT_ITEM = "EA", YN_USE = "Y" }, CancellationToken.None);
        await items.AddAsync(new Item { CD_FIRM = "1000", CD_ITEM = "E2E-KEEP-001", NM_ITEM = "E2E Fixture", STND_ITEM = "KEEP", UNIT_ITEM = "EA", YN_USE = "Y" }, CancellationToken.None);

        await client.PostAsync("/api/development-data/seed/all", null);
        var wrongConfirmation = await client.PostAsJsonAsync("/api/development-data/cleanup/samples", new DevelopmentDataRequest { Scope = "all", ConfirmationText = "DELETE" });
        var wrongResult = await wrongConfirmation.Content.ReadFromJsonAsync<DevelopmentDataOperationDto>();
        var masterOnly = await client.PostAsJsonAsync("/api/development-data/cleanup/samples", new DevelopmentDataRequest { Scope = "production-masters", ConfirmationText = "SAMPLE DELETE" });
        var masterOnlyResult = await masterOnly.Content.ReadFromJsonAsync<DevelopmentDataOperationDto>();

        Assert.Equal("Blocked", wrongResult?.Status);
        Assert.Equal("Blocked", masterOnlyResult?.Status); Assert.Equal(0, masterOnlyResult?.DeletedRows);
        Assert.NotNull(await items.GetAsync("1000", "ITEM-SMP-FG01", CancellationToken.None));

        await CleanupAllAsync(client);
        var summary = await client.GetFromJsonAsync<DevelopmentDataSummaryDto>("/api/development-data/summary");
        Assert.NotNull(summary); Assert.Equal(0, summary.SampleItems); Assert.Equal(0, summary.SampleSalesOrders); Assert.Equal(0, summary.SamplePurchaseOrders); Assert.Equal(0, summary.SampleWorkOrders);
        Assert.NotNull(await items.GetAsync("1000", "BUSINESS-KEEP-001", CancellationToken.None));
        Assert.NotNull(await items.GetAsync("1000", "E2E-KEEP-001", CancellationToken.None));
    }

    [Fact]
    public async Task ConflictingSampleKey_IsReportedAndNeverOverwritten()
    {
        using var factory = CreateDevelopmentFactory();
        using var client = factory.CreateClient();
        await CleanupAllAsync(client);
        var items = factory.Services.GetRequiredService<IItemRepository>();
        await items.AddAsync(new Item { CD_FIRM = "1000", CD_ITEM = "ITEM-SMP-FG01", NM_ITEM = "Conflict Fixture", STND_ITEM = "CONFLICT", UNIT_ITEM = "EA", YN_USE = "Y" }, CancellationToken.None);

        var previewResponse = await client.PostAsJsonAsync("/api/development-data/preview", new DevelopmentDataRequest { Scope = "production-masters" });
        var preview = await previewResponse.Content.ReadFromJsonAsync<DevelopmentDataPreviewDto>();
        var seedResponse = await client.PostAsync("/api/development-data/seed/production-masters", null);
        var seed = await seedResponse.Content.ReadFromJsonAsync<DevelopmentDataOperationDto>();
        var itemAfterAttempt = await items.GetAsync("1000", "ITEM-SMP-FG01", CancellationToken.None);

        Assert.NotNull(preview); Assert.True(preview.ConflictRows > 0); Assert.Contains(preview.Conflicts, conflict => conflict.Contains("ITEM-SMP-FG01", StringComparison.Ordinal));
        Assert.Equal(HttpStatusCode.OK, seedResponse.StatusCode); Assert.Equal("Blocked", seed?.Status); Assert.True(seed?.ConflictRows > 0);
        Assert.Equal("Conflict Fixture", itemAfterAttempt?.NM_ITEM);

        await CleanupAllAsync(client);
    }

    [Fact]
    public async Task ProductionEnvironment_ReturnsSafeStatusAndBlocksEveryProtectedOperationWithTraceId()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("RepositoryMode", "InMemory");
        });
        using var client = factory.CreateClient();

        var status = await client.GetFromJsonAsync<DevelopmentDataEnvironmentDto>("/api/development-data/status");
        var summary = await client.GetFromJsonAsync<DevelopmentDataSummaryDto>("/api/development-data/summary");
        Assert.NotNull(status); Assert.False(status.IsAllowed); Assert.NotNull(summary); Assert.Equal("Access blocked", summary.Status);

        var requests = new HttpRequestMessage[]
        {
            new(HttpMethod.Post, "/api/development-data/preview") { Content = JsonContent.Create(new DevelopmentDataRequest { Scope = "all" }) },
            new(HttpMethod.Post, "/api/development-data/seed/production-masters"),
            new(HttpMethod.Post, "/api/development-data/seed/sales-orders"),
            new(HttpMethod.Post, "/api/development-data/seed/purchase-orders"),
            new(HttpMethod.Post, "/api/development-data/seed/work-orders"),
            new(HttpMethod.Post, "/api/development-data/seed/all"),
            new(HttpMethod.Post, "/api/development-data/cleanup/samples") { Content = JsonContent.Create(new DevelopmentDataRequest { Scope = "all", ConfirmationText = "SAMPLE DELETE" }) },
            new(HttpMethod.Get, "/api/development-data/e2e-remnants")
        };
        foreach (var request in requests)
        {
            using (request)
            using (var response = await client.SendAsync(request))
            {
                var body = await response.Content.ReadAsStringAsync();
                Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
                Assert.Contains("traceId", body, StringComparison.Ordinal); Assert.DoesNotContain("Server=", body, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    private static WebApplicationFactory<Program> CreateDevelopmentFactory() => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("RepositoryMode", "InMemory");
    });

    private static async Task CleanupAllAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/development-data/cleanup/samples", new DevelopmentDataRequest { Scope = "all", ConfirmationText = "SAMPLE DELETE" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static void AssertSummaryEqual(DevelopmentDataSummaryDto expected, DevelopmentDataSummaryDto actual)
    {
        Assert.Equal(expected.SampleItems, actual.SampleItems); Assert.Equal(expected.SampleProductionLines, actual.SampleProductionLines); Assert.Equal(expected.SampleProcesses, actual.SampleProcesses); Assert.Equal(expected.SampleEquipment, actual.SampleEquipment);
        Assert.Equal(expected.SampleSalesOrders, actual.SampleSalesOrders); Assert.Equal(expected.SampleSalesOrderLines, actual.SampleSalesOrderLines); Assert.Equal(expected.SamplePurchaseOrders, actual.SamplePurchaseOrders); Assert.Equal(expected.SamplePurchaseOrderLines, actual.SamplePurchaseOrderLines);
        Assert.Equal(expected.SampleWorkOrders, actual.SampleWorkOrders); Assert.Equal(expected.SampleWorkOrderProcesses, actual.SampleWorkOrderProcesses); Assert.Equal(expected.E2ERemnantRows, actual.E2ERemnantRows);
    }
}
