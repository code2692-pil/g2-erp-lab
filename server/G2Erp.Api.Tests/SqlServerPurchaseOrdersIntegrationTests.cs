using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using G2Erp.Api.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class SqlServerPurchaseOrdersIntegrationTests
{
    private const string ConnectionString = "Server=.;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False;TrustServerCertificate=True";

    [Fact]
    [Trait("Category", "SqlServerIntegration")]
    public async Task SqlServerPurchaseOrderRepository_CreatesUpdatesReadsAndDeletesAnOrder()
    {
        var repository = new SqlServerPurchaseOrderRepository(new SqlServerConnectionFactory(ConnectionString));
        var number = $"PO-R-{Guid.NewGuid():N}"[..30];
        await DeleteMatchingAsync(repository, "PO-R-");
        try
        {
            await repository.AddAsync(CreateDomainOrder(number, 2, 100), CancellationToken.None);
            var created = await repository.GetAsync("1000", number, CancellationToken.None);
            Assert.NotNull(created); Assert.Equal(200m, created.Lines[0].AM_SUPPLY);
            await repository.UpdateAsync(CreateDomainOrder(number, 3, 200), CancellationToken.None);
            var updated = await repository.GetAsync("1000", number, CancellationToken.None);
            Assert.NotNull(updated); Assert.Equal(600m, updated.Lines[0].AM_SUPPLY);
            Assert.True(await repository.DeleteAsync("1000", number, CancellationToken.None));
            Assert.Null(await repository.GetAsync("1000", number, CancellationToken.None));
        }
        finally { await DeleteMatchingAsync(repository, "PO-R-"); }
    }

    [Fact]
    [Trait("Category", "SqlServerIntegration")]
    public async Task SqlServerPurchaseOrderApi_ValidatesAndRecalculatesAmounts()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("RepositoryMode", "SqlServer");
            builder.UseSetting("ConnectionStrings:G2Erp", ConnectionString);
            builder.UseSetting("G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL", "true");
        });
        using var client = factory.CreateClient(); var request = CreateRequest();
        var repository = new SqlServerPurchaseOrderRepository(new SqlServerConnectionFactory(ConnectionString)); await DeleteMatchingAsync(repository, "PO-S-");
        try
        {
            var created = await client.PostAsJsonAsync("/api/purchase-orders", request);
            var order = await created.Content.ReadFromJsonAsync<PurchaseOrderDetailDto>();
            Assert.Equal(HttpStatusCode.Created, created.StatusCode); Assert.NotNull(order); Assert.Equal(303m, order.Lines[0].AM_SUPPLY); Assert.Equal(30m, order.Lines[0].AM_VAT);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/purchase-orders", request)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/purchase-orders", CreateRequest(item: ""))).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/purchase-orders/1000/{request.Header.NO_PO}")).StatusCode);
        }
        finally { await DeleteMatchingAsync(repository, "PO-S-"); }
    }

    private static PurchaseOrder CreateDomainOrder(string number, decimal quantity, decimal price)
    {
        var supply = quantity * price;
        return new PurchaseOrder { Header = new PurchaseOrderHeader { CD_FIRM = "1000", NO_PO = number, DT_PO = "2026-07-15", CD_PARTNER = "P-10021", NM_PARTNER = "G2 Trading", CD_EMP = "E-TEST", NM_EMP = "Tester", CD_CURRENCY = "KRW", RT_EXCHANGE = 1, ST_PO = "New", DC_RMK = "SQL test" }, Lines = [new PurchaseOrderLine { CD_FIRM = "1000", NO_PO = number, NO_LINE = 1, CD_ITEM = "ITM-1001", NM_ITEM = "Controller A", STND_ITEM = "CTRL-A / 24V", UNIT_ITEM = "EA", QT_PO = quantity, UM_PO = price, AM_SUPPLY = supply, AM_VAT = supply / 10, AM_TOTAL = supply + supply / 10, DT_DLV = "2026-07-20", CD_WH = "WH-100", NM_WH = "Central Warehouse", DC_RMK = "SQL test" }] };
    }

    private static CreatePurchaseOrderRequest CreateRequest(string item = "ITM-1001")
    {
        var number = $"PO-S-{Guid.NewGuid():N}"[..30];
        return new CreatePurchaseOrderRequest { Header = new PurchaseOrderHeaderDto { CD_FIRM = "1000", NO_PO = number, DT_PO = "2026-07-15", CD_PARTNER = "P-10021", NM_PARTNER = "Ignored", CD_EMP = "E-TEST", NM_EMP = "Tester", CD_CURRENCY = "KRW", RT_EXCHANGE = 1, ST_PO = "New", DC_RMK = "SQL test" }, Lines = [new PurchaseOrderLineDto { CD_FIRM = "1000", NO_PO = number, NO_LINE = 1, CD_ITEM = item, NM_ITEM = "Ignored", STND_ITEM = "Ignored", UNIT_ITEM = "EA", QT_PO = 3, UM_PO = 101, AM_SUPPLY = 1, AM_VAT = 1, AM_TOTAL = 1, DT_DLV = "2026-07-20", CD_WH = "WH-100", NM_WH = "Ignored", DC_RMK = "SQL test" }] };
    }
    private static async Task DeleteMatchingAsync(SqlServerPurchaseOrderRepository repository, string prefix)
    {
        var orders = await repository.GetAllAsync(new PurchaseOrderSearch(null, null, null, prefix, null, null), CancellationToken.None);
        foreach (var order in orders) await repository.DeleteAsync(order.Header.CD_FIRM, order.Header.NO_PO, CancellationToken.None);
    }
}
