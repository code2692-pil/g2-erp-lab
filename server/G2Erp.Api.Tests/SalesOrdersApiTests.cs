using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Contracts;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class SalesOrdersApiTests
{
    [Fact]
    public async Task GetSalesOrders_ReturnsSeededOrders()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/sales-orders");
        var orders = await response.Content.ReadFromJsonAsync<List<SalesOrderDto>>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(orders);
        Assert.NotEmpty(orders);
    }

    [Fact]
    public async Task GetSalesOrder_WhenMissing_ReturnsNotFound()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/sales-orders/1000/MISSING");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task CreateSalesOrder_WithValidRequest_ReturnsCreated()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var request = CreateRequest();

        var response = await client.PostAsJsonAsync("/api/sales-orders", request);
        var created = await response.Content.ReadFromJsonAsync<SalesOrderDto>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(created);
        Assert.Equal(request.Header.NO_SO, created.Header.NO_SO);
    }

    [Fact]
    public async Task CreateSalesOrder_WithDuplicatePrimaryKey_ReturnsConflict()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var request = CreateRequest();

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/sales-orders", request)).StatusCode);
        var duplicateResponse = await client.PostAsJsonAsync("/api/sales-orders", request);

        Assert.Equal(HttpStatusCode.Conflict, duplicateResponse.StatusCode);
    }

    [Fact]
    public async Task CreateSalesOrder_WithoutPartner_ReturnsBadRequest()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var request = CreateRequest(partnerCode: "");

        var response = await client.PostAsJsonAsync("/api/sales-orders", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateSalesOrder_WithoutLines_ReturnsBadRequest()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var sourceRequest = CreateRequest();
        var request = new UpsertSalesOrderRequest { Header = sourceRequest.Header, Lines = [] };

        var response = await client.PostAsJsonAsync("/api/sales-orders", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateSalesOrder_WithZeroQuantity_ReturnsBadRequest()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var request = CreateRequest(quantity: 0);

        var response = await client.PostAsJsonAsync("/api/sales-orders", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateSalesOrder_WithNegativeUnitPrice_ReturnsBadRequest()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var request = CreateRequest(unitPrice: -1);

        var response = await client.PostAsJsonAsync("/api/sales-orders", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateSalesOrder_RecalculatesClientProvidedAmounts()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var request = CreateRequest(quantity: 3, unitPrice: 101, supply: 1, vat: 1, total: 1);

        var response = await client.PostAsJsonAsync("/api/sales-orders", request);
        var created = await response.Content.ReadFromJsonAsync<SalesOrderDto>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(created);
        Assert.Equal(303m, created.Lines[0].AM_SUPPLY);
        Assert.Equal(30m, created.Lines[0].AM_VAT);
        Assert.Equal(333m, created.Lines[0].AM_TOTAL);
        Assert.Equal("Controller A", created.Lines[0].NM_ITEM);
    }

    [Fact]
    public async Task DeleteSalesOrder_MakesSubsequentLookupReturnNotFound()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var request = CreateRequest();

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/sales-orders", request)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/sales-orders/1000/{request.Header.NO_SO}")).StatusCode);

        var lookupResponse = await client.GetAsync($"/api/sales-orders/1000/{request.Header.NO_SO}");
        Assert.Equal(HttpStatusCode.NotFound, lookupResponse.StatusCode);
    }

    private static WebApplicationFactory<Program> CreateFactory() => new();

    private static UpsertSalesOrderRequest CreateRequest(
        decimal quantity = 2,
        decimal unitPrice = 100,
        decimal supply = 0,
        decimal vat = 0,
        decimal total = 0,
        string partnerCode = "P-10021")
    {
        var orderNo = $"SO-TEST-{Guid.NewGuid():N}";
        return new UpsertSalesOrderRequest
        {
            Header = new SalesOrderHeaderDto
            {
                CD_FIRM = "1000", NO_SO = orderNo, DT_SO = "2026-07-14", CD_PARTNER = partnerCode,
                NM_PARTNER = "Ignored client value", CD_EMP = "E-TEST", ST_SO = "New", DC_RMK = "Test request"
            },
            Lines =
            [
                new SalesOrderLineDto
                {
                    CD_FIRM = "1000", NO_SO = orderNo, NO_LINE = 1, CD_ITEM = "ITM-1001",
                    NM_ITEM = "Ignored client value", STND_ITEM = "Ignored client value", UNIT_ITEM = "EA",
                    QT_SO = quantity, UM_SO = unitPrice, AM_SUPPLY = supply, AM_VAT = vat, AM_TOTAL = total,
                    DT_DLV = "2026-07-20", DC_RMK = "Test line"
                }
            ]
        };
    }
}
