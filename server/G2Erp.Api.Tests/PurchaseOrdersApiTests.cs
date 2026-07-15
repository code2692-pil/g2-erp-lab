using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Contracts;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class PurchaseOrdersApiTests
{
    [Fact]
    public async Task GetPurchaseOrders_ReturnsSeededOrders()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/purchase-orders?companyCode=1000");
        var orders = await response.Content.ReadFromJsonAsync<List<PurchaseOrderDetailDto>>();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.NotNull(orders); Assert.NotEmpty(orders);
    }

    [Fact]
    public async Task GetPurchaseOrder_WhenMissing_ReturnsNotFound()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/purchase-orders/1000/MISSING")).StatusCode);
    }

    [Fact]
    public async Task CreateUpdateDeletePurchaseOrder_UsesServerCalculatedAmounts()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient(); var request = CreateRequest(quantity: 3, unitPrice: 101, supply: 1);
        var create = await client.PostAsJsonAsync("/api/purchase-orders", request); var created = await create.Content.ReadFromJsonAsync<PurchaseOrderDetailDto>();
        Assert.Equal(HttpStatusCode.Created, create.StatusCode); Assert.NotNull(created); Assert.Equal(303m, created.Lines[0].AM_SUPPLY); Assert.Equal(30m, created.Lines[0].AM_VAT); Assert.Equal(333m, created.Lines[0].AM_TOTAL); Assert.Equal("Central Warehouse", created.Lines[0].NM_WH);
        var update = new UpdatePurchaseOrderRequest { Header = created.Header, Lines = [CopyLine(created.Lines[0], quantity: 4, unitPrice: 200)] };
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/purchase-orders/1000/{created.Header.NO_PO}", update)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/purchase-orders/1000/{created.Header.NO_PO}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/purchase-orders/1000/{created.Header.NO_PO}")).StatusCode);
    }

    [Fact]
    public async Task CreatePurchaseOrder_WithDuplicatePrimaryKey_ReturnsConflict()
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient(); var request = CreateRequest();
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/purchase-orders", request)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/purchase-orders", request)).StatusCode);
    }

    [Theory]
    [InlineData("partner")]
    [InlineData("lines")]
    [InlineData("item")]
    [InlineData("quantity")]
    [InlineData("warehouse")]
    public async Task CreatePurchaseOrder_WithInvalidRequiredData_ReturnsBadRequest(string invalid)
    {
        using var factory = CreateFactory(); using var client = factory.CreateClient(); var request = CreateRequest();
        if (invalid == "partner") request = new CreatePurchaseOrderRequest { Header = CopyHeader(request.Header, partnerCode: ""), Lines = request.Lines };
        if (invalid == "lines") request = new CreatePurchaseOrderRequest { Header = request.Header, Lines = [] };
        if (invalid == "item") request = new CreatePurchaseOrderRequest { Header = request.Header, Lines = [CopyLine(request.Lines[0], itemCode: "")] };
        if (invalid == "quantity") request = new CreatePurchaseOrderRequest { Header = request.Header, Lines = [CopyLine(request.Lines[0], quantity: 0)] };
        if (invalid == "warehouse") request = new CreatePurchaseOrderRequest { Header = request.Header, Lines = [CopyLine(request.Lines[0], warehouseCode: "")] };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/purchase-orders", request)).StatusCode);
    }

    private static WebApplicationFactory<Program> CreateFactory() => new();
    private static CreatePurchaseOrderRequest CreateRequest(decimal quantity = 2, decimal unitPrice = 100, decimal supply = 0)
    {
        var number = $"PO-TEST-{Guid.NewGuid():N}";
        return new CreatePurchaseOrderRequest
        {
            Header = new PurchaseOrderHeaderDto { CD_FIRM = "1000", NO_PO = number, DT_PO = "2026-07-15", CD_PARTNER = "P-10021", NM_PARTNER = "Ignored", CD_EMP = "E-TEST", NM_EMP = "Tester", CD_CURRENCY = "KRW", RT_EXCHANGE = 1, ST_PO = "New", DC_RMK = "Test" },
            Lines = [new PurchaseOrderLineDto { CD_FIRM = "1000", NO_PO = number, NO_LINE = 1, CD_ITEM = "ITM-1001", NM_ITEM = "Ignored", STND_ITEM = "Ignored", UNIT_ITEM = "EA", QT_PO = quantity, UM_PO = unitPrice, AM_SUPPLY = supply, AM_VAT = 1, AM_TOTAL = 1, DT_DLV = "2026-07-20", CD_WH = "WH-100", NM_WH = "Ignored", DC_RMK = "Test" }]
        };
    }
    private static PurchaseOrderHeaderDto CopyHeader(PurchaseOrderHeaderDto source, string? partnerCode = null) => new() { CD_FIRM = source.CD_FIRM, NO_PO = source.NO_PO, DT_PO = source.DT_PO, CD_PARTNER = partnerCode ?? source.CD_PARTNER, NM_PARTNER = source.NM_PARTNER, CD_EMP = source.CD_EMP, NM_EMP = source.NM_EMP, CD_CURRENCY = source.CD_CURRENCY, RT_EXCHANGE = source.RT_EXCHANGE, ST_PO = source.ST_PO, DC_RMK = source.DC_RMK };
    private static PurchaseOrderLineDto CopyLine(PurchaseOrderLineDto source, string? itemCode = null, decimal? quantity = null, decimal? unitPrice = null, string? warehouseCode = null) => new() { CD_FIRM = source.CD_FIRM, NO_PO = source.NO_PO, NO_LINE = source.NO_LINE, CD_ITEM = itemCode ?? source.CD_ITEM, NM_ITEM = source.NM_ITEM, STND_ITEM = source.STND_ITEM, UNIT_ITEM = source.UNIT_ITEM, QT_PO = quantity ?? source.QT_PO, UM_PO = unitPrice ?? source.UM_PO, AM_SUPPLY = 0, AM_VAT = 0, AM_TOTAL = 0, DT_DLV = source.DT_DLV, CD_WH = warehouseCode ?? source.CD_WH, NM_WH = source.NM_WH, DC_RMK = source.DC_RMK };
}
