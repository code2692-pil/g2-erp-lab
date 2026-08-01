using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class DocumentNumberApiTests
{
    [Fact]
    public void Format_WhenMonthlySerialExceeds9999_ThrowsExplicitLimitError()
    {
        var error = Assert.Throws<DocumentNumberLimitException>(() => DocumentNumberPolicy.Format("SOR", "203108", 10_000));
        Assert.Contains("9999", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TemporaryDocuments_UseBusinessMonthAndIndependentTypePrefixes()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var sales = await CreateSalesAsync(client, 1, "2031-05-31");
        var purchase = await CreatePurchaseAsync(client, 1, "2031-05-31");
        var work = await CreateWorkAsync(client, 1, "2031-05-31");

        Assert.Matches("^SOR203105\\d{4}$", sales.Header.NO_SO);
        Assert.Matches("^POR203105\\d{4}$", purchase.Header.NO_PO);
        Assert.Matches("^WMO203105\\d{4}$", work.Header.NO_WO);
        Assert.All(sales.Lines, line => Assert.Equal(sales.Header.NO_SO, line.NO_SO));
        Assert.All(purchase.Lines, line => Assert.Equal(purchase.Header.NO_PO, line.NO_PO));
        Assert.All(work.Processes, process => Assert.Equal(work.Header.NO_WO, process.NO_WO));
    }

    [Fact]
    public async Task TenConcurrentCreates_PerDocumentType_AreUniqueAndSequential()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var sales = await Task.WhenAll(Enumerable.Range(1, 10).Select(index => CreateSalesAsync(client, index, "2032-06-15")));
        var purchases = await Task.WhenAll(Enumerable.Range(1, 10).Select(index => CreatePurchaseAsync(client, index, "2032-06-15")));
        var work = await Task.WhenAll(Enumerable.Range(1, 10).Select(index => CreateWorkAsync(client, index, "2032-06-15")));

        AssertSequence(sales.Select(order => order.Header.NO_SO), "SOR203206");
        AssertSequence(purchases.Select(order => order.Header.NO_PO), "POR203206");
        AssertSequence(work.Select(order => order.Header.NO_WO), "WMO203206");
    }

    [Fact]
    public async Task DeletingGeneratedDocument_DoesNotReuseItsNumber()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var first = await CreateSalesAsync(client, 1, "2033-07-01");

        var delete = await client.DeleteAsync($"/api/sales-orders/1000/{first.Header.NO_SO}");
        var second = await CreateSalesAsync(client, 2, "2033-07-02");

        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        Assert.Equal(Serial(first.Header.NO_SO) + 1, Serial(second.Header.NO_SO));
    }

    private static void AssertSequence(IEnumerable<string> numbers, string prefix)
    {
        var values = numbers.OrderBy(number => number, StringComparer.Ordinal).ToArray();
        Assert.Equal(10, values.Distinct(StringComparer.Ordinal).Count());
        Assert.All(values, number => Assert.Matches($"^{prefix}\\d{{4}}$", number));
        Assert.Equal(Enumerable.Range(1, 10), values.Select(Serial));
    }

    private static int Serial(string number) => int.Parse(number[^4..]);

    private static async Task<SalesOrderDto> CreateSalesAsync(HttpClient client, int index, string date)
    {
        var temporary = $"TEMP_SO_{index:D3}";
        var request = new UpsertSalesOrderRequest
        {
            Header = new SalesOrderHeaderDto { CD_FIRM = "1000", NO_SO = temporary, DT_SO = date, CD_PARTNER = "P-10021", NM_PARTNER = "Ignored", CD_EMP = "E-TEST", ST_SO = "New", DC_RMK = "Number test" },
            Lines = [new SalesOrderLineDto { CD_FIRM = "1000", NO_SO = temporary, NO_LINE = 1, CD_ITEM = "ITM-1001", NM_ITEM = "Ignored", STND_ITEM = "Ignored", UNIT_ITEM = "EA", QT_SO = 1, UM_SO = 100, AM_SUPPLY = 0, AM_VAT = 0, AM_TOTAL = 0, DT_DLV = date, DC_RMK = "" }]
        };
        var response = await client.PostAsJsonAsync("/api/sales-orders", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SalesOrderDto>())!;
    }

    private static async Task<PurchaseOrderDetailDto> CreatePurchaseAsync(HttpClient client, int index, string date)
    {
        var temporary = $"TEMP_PO_{index:D3}";
        var request = new CreatePurchaseOrderRequest
        {
            Header = new PurchaseOrderHeaderDto { CD_FIRM = "1000", NO_PO = temporary, DT_PO = date, CD_PARTNER = "P-10021", NM_PARTNER = "Ignored", CD_EMP = "E-TEST", NM_EMP = "Tester", CD_CURRENCY = "KRW", RT_EXCHANGE = 1, ST_PO = "New", DC_RMK = "Number test" },
            Lines = [new PurchaseOrderLineDto { CD_FIRM = "1000", NO_PO = temporary, NO_LINE = 1, CD_ITEM = "ITM-1001", NM_ITEM = "Ignored", STND_ITEM = "Ignored", UNIT_ITEM = "EA", QT_PO = 1, UM_PO = 100, AM_SUPPLY = 0, AM_VAT = 0, AM_TOTAL = 0, DT_DLV = date, CD_WH = "WH-100", NM_WH = "Ignored", DC_RMK = "" }]
        };
        var response = await client.PostAsJsonAsync("/api/purchase-orders", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PurchaseOrderDetailDto>())!;
    }

    private static async Task<WorkOrderDetailDto> CreateWorkAsync(HttpClient client, int index, string date)
    {
        var temporary = $"TEMP-WO-{index:D3}";
        var request = new CreateWorkOrderRequest
        {
            Header = new WorkOrderHeaderDto { CD_FIRM = "1000", NO_WO = temporary, DT_WO = date, CD_ITEM = "ITM-1001", NM_ITEM = "Ignored", STND_ITEM = "Ignored", UNIT_ITEM = "EA", QT_WO = 1, QT_RESULT = 0, DT_PLAN_START = date, DT_PLAN_END = date, CD_LINE = "LINE-A", NM_LINE = "Ignored", ST_WO = "New", YN_URGENT = "N", DC_RMK = "Number test" },
            Processes = [new WorkOrderProcessDto { CD_FIRM = "1000", NO_WO = temporary, NO_PROC = 10, CD_PROC = "PROC-010", NM_PROC = "Ignored", CD_EQUIP = "EQ-A01", NM_EQUIP = "Ignored", QT_PLAN = 1, QT_RESULT = 0, TM_PLAN_START = $"{date}T08:00", TM_PLAN_END = $"{date}T09:00", ST_PROC = "Waiting", DC_RMK = "" }]
        };
        var response = await client.PostAsJsonAsync("/api/work-orders", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkOrderDetailDto>())!;
    }

    private static WebApplicationFactory<Program> CreateFactory() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder => builder.UseSetting("RepositoryMode", "InMemory"));
}
