using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Contracts;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class WorkOrdersApiTests
{
    [Fact]
    public async Task GetWorkOrders_ReturnsInMemorySeedAndFilters()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var all = await client.GetFromJsonAsync<List<WorkOrderDetailDto>>("/api/work-orders?companyCode=1000");
        var urgent = await client.GetFromJsonAsync<List<WorkOrderDetailDto>>("/api/work-orders?companyCode=1000&urgent=Y");
        Assert.NotNull(all); Assert.True(all.Count >= 5);
        Assert.NotNull(urgent); Assert.Single(urgent); Assert.Equal("Y", urgent[0].Header.YN_URGENT);
    }

    [Fact]
    public async Task GetWorkOrder_ReturnsDetailAndMissingReturnsNotFound()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var detail = await client.GetFromJsonAsync<WorkOrderDetailDto>("/api/work-orders/1000/WO2026070002");
        Assert.NotNull(detail); Assert.NotEmpty(detail.Processes);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/work-orders/1000/MISSING")).StatusCode);
    }

    [Fact]
    public async Task CreateUpdateDeleteWorkOrder_UsesHeaderAndProcessCompositeKeys()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var request = CreateRequest($"WO-TEST-{Guid.NewGuid():N}");
        var create = await client.PostAsJsonAsync("/api/work-orders", request);
        var created = await create.Content.ReadFromJsonAsync<WorkOrderDetailDto>();
        Assert.Equal(HttpStatusCode.Created, create.StatusCode); Assert.NotNull(created);

        var update = new UpdateWorkOrderRequest
        {
            Header = Header(created.Header.NO_WO, quantity: 12, result: 4),
            Processes = [Process(created.Header.NO_WO, quantity: 12, result: 4)]
        };
        var updateResponse = await client.PutAsJsonAsync($"/api/work-orders/1000/{created.Header.NO_WO}", update);
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/work-orders/1000/{created.Header.NO_WO}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/work-orders/1000/{created.Header.NO_WO}")).StatusCode);
    }

    [Fact]
    public async Task CreateWorkOrder_WithDuplicateHeaderPrimaryKey_ReturnsConflict()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var request = CreateRequest($"WO-DUP-{Guid.NewGuid():N}");
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/work-orders", request)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/work-orders", request)).StatusCode);
    }

    [Theory]
    [InlineData("company")]
    [InlineData("item")]
    [InlineData("quantity")]
    [InlineData("date")]
    [InlineData("line")]
    [InlineData("process")]
    [InlineData("processDate")]
    [InlineData("equipmentLine")]
    public async Task CreateWorkOrder_WithInvalidBusinessData_ReturnsBadRequest(string invalid)
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var number = $"WO-INVALID-{Guid.NewGuid():N}";
        var request = invalid switch
        {
            "company" => CreateRequest(number, firm: ""),
            "item" => CreateRequest(number, itemCode: ""),
            "quantity" => CreateRequest(number, quantity: 0),
            "date" => CreateRequest(number, planStart: "2026-07-21", planEnd: "2026-07-20"),
            "line" => CreateRequest(number, lineCode: ""),
            "process" => CreateRequest(number, processCode: ""),
            "processDate" => CreateRequest(number, processStart: "2026-07-21T11:00", processEnd: "2026-07-21T10:00"),
            "equipmentLine" => CreateRequest(number, equipmentCode: "EQ-B01"),
            _ => throw new ArgumentOutOfRangeException(nameof(invalid))
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/work-orders", request)).StatusCode);
    }

    [Fact]
    public async Task CreateWorkOrder_WithDuplicateProcessCompositeKey_ReturnsBadRequest()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var number = $"WO-PROC-DUP-{Guid.NewGuid():N}";
        var request = new CreateWorkOrderRequest { Header = Header(number), Processes = [Process(number), Process(number)] };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/work-orders", request)).StatusCode);
    }

    [Fact]
    public async Task CreateWorkOrder_WithResultOverQuantity_ReturnsWarningInsteadOfBlocking()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var number = $"WO-WARN-{Guid.NewGuid():N}";
        var response = await client.PostAsJsonAsync("/api/work-orders", CreateRequest(number, quantity: 3, result: 4));
        var saved = await response.Content.ReadFromJsonAsync<WorkOrderDetailDto>();
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); Assert.NotNull(saved); Assert.NotEmpty(saved.Warnings);
    }

    [Fact]
    public async Task WorkOrderMasterEndpoints_ReturnUsableLookupRows()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/production-lines?companyCode=1000&useYn=Y")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/processes?companyCode=1000&useYn=Y")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/equipment?companyCode=1000&lineCode=LINE-A&useYn=Y")).StatusCode);
    }

    private static WebApplicationFactory<Program> CreateFactory() => new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.UseSetting("RepositoryMode", "InMemory"));

    private static CreateWorkOrderRequest CreateRequest(string number, string firm = "1000", string itemCode = "ITM-1001", decimal quantity = 10, decimal result = 0, string lineCode = "LINE-A", string processCode = "PROC-010", string equipmentCode = "EQ-A01", string planStart = "2026-07-20", string planEnd = "2026-07-21", string processStart = "2026-07-20T08:00", string processEnd = "2026-07-20T10:00") =>
        new() { Header = Header(number, firm, itemCode, quantity, result, lineCode, planStart, planEnd), Processes = [Process(number, firm, processCode, equipmentCode, quantity, result, processStart, processEnd)] };

    private static WorkOrderHeaderDto Header(string number, string firm = "1000", string itemCode = "ITM-1001", decimal quantity = 10, decimal result = 0, string lineCode = "LINE-A", string planStart = "2026-07-20", string planEnd = "2026-07-21") =>
        new() { CD_FIRM = firm, NO_WO = number, DT_WO = "2026-07-17", CD_ITEM = itemCode, NM_ITEM = "Ignored", STND_ITEM = "Ignored", UNIT_ITEM = "EA", QT_WO = quantity, QT_RESULT = result, DT_PLAN_START = planStart, DT_PLAN_END = planEnd, CD_LINE = lineCode, NM_LINE = "Ignored", ST_WO = "미확정", YN_URGENT = "N", DC_RMK = "Test" };

    private static WorkOrderProcessDto Process(string number, string firm = "1000", string processCode = "PROC-010", string equipmentCode = "EQ-A01", decimal quantity = 10, decimal result = 0, string start = "2026-07-20T08:00", string end = "2026-07-20T10:00") =>
        new() { CD_FIRM = firm, NO_WO = number, NO_PROC = 10, CD_PROC = processCode, NM_PROC = "Ignored", CD_EQUIP = equipmentCode, NM_EQUIP = "Ignored", QT_PLAN = quantity, QT_RESULT = result, TM_PLAN_START = start, TM_PLAN_END = end, ST_PROC = "대기", DC_RMK = "Test" };
}
