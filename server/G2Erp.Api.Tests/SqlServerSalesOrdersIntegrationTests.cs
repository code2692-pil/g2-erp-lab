using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using G2Erp.Api.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class SqlServerSalesOrdersIntegrationTests
{
    [Fact]
    [Trait("Category", "SqlServerIntegration")]
    public async Task SqlServerRepository_DirectCrud_ReportsDatabaseErrorsWithoutHttpMasking()
    {
        var repository = new SqlServerSalesOrderRepository(new SqlServerConnectionFactory("Server=.;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False;TrustServerCertificate=True"));
        var orderNo = $"SO-R-{Guid.NewGuid():N}"[..30];
        var created = CreateDomainOrder(orderNo, "New", 2, 100);

        await repository.AddAsync(created, CancellationToken.None);
        var loaded = await repository.GetAsync("1000", orderNo, CancellationToken.None);
        Assert.NotNull(loaded);
        Assert.Equal(200m, loaded.Lines[0].AM_SUPPLY);

        await repository.UpdateAsync(CreateDomainOrder(orderNo, "Confirmed", 3, 200), CancellationToken.None);
        var updated = await repository.GetAsync("1000", orderNo, CancellationToken.None);
        Assert.NotNull(updated);
        Assert.Equal("Confirmed", updated.Header.ST_SO);
        Assert.Equal(600m, updated.Lines[0].AM_SUPPLY);

        Assert.True(await repository.DeleteAsync("1000", orderNo, CancellationToken.None));
        Assert.Null(await repository.GetAsync("1000", orderNo, CancellationToken.None));
    }

    [Fact]
    [Trait("Category", "SqlServerIntegration")]
    public async Task SqlServerRepository_CreatesUpdatesReadsAndDeletesAnOrder()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL", "true");
            builder.UseSetting("RepositoryMode", "SqlServer");
            builder.UseSetting("ConnectionStrings:G2Erp", "Server=.;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False;TrustServerCertificate=True");
        });
        using var client = factory.CreateClient();
        var request = CreateRequest();

        var created = await client.PostAsJsonAsync("/api/sales-orders", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var updatedRequest = CreateRequest(request.Header.NO_SO, "Confirmed", 3, 200);
        var updated = await client.PutAsJsonAsync($"/api/sales-orders/1000/{request.Header.NO_SO}", updatedRequest);
        var updatedOrder = await updated.Content.ReadFromJsonAsync<SalesOrderDto>();
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.NotNull(updatedOrder);
        Assert.Equal("Confirmed", updatedOrder.Header.ST_SO);
        Assert.Equal(600m, updatedOrder.Lines[0].AM_SUPPLY);

        var loaded = await client.GetAsync($"/api/sales-orders/1000/{request.Header.NO_SO}");
        Assert.Equal(HttpStatusCode.OK, loaded.StatusCode);

        var deleted = await client.DeleteAsync($"/api/sales-orders/1000/{request.Header.NO_SO}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/sales-orders/1000/{request.Header.NO_SO}")).StatusCode);
    }

    private static UpsertSalesOrderRequest CreateRequest(string? orderNo = null, string status = "New", decimal quantity = 2, decimal unitPrice = 100)
    {
        orderNo ??= $"SO-S-{Guid.NewGuid():N}"[..30];
        return new UpsertSalesOrderRequest
        {
            Header = new SalesOrderHeaderDto
            {
                CD_FIRM = "1000", NO_SO = orderNo, DT_SO = "2026-07-15", CD_PARTNER = "P-10021",
                NM_PARTNER = "Ignored", CD_EMP = "E-TEST", ST_SO = status, DC_RMK = "SQL integration test"
            },
            Lines =
            [
                new SalesOrderLineDto
                {
                    CD_FIRM = "1000", NO_SO = orderNo, NO_LINE = 1, CD_ITEM = "ITM-1001", NM_ITEM = "Ignored",
                    STND_ITEM = "Ignored", UNIT_ITEM = "EA", QT_SO = quantity, UM_SO = unitPrice, AM_SUPPLY = 0, AM_VAT = 0,
                    AM_TOTAL = 0, DT_DLV = "2026-07-20", DC_RMK = "SQL integration test line"
                }
            ]
        };
    }

    private static SalesOrder CreateDomainOrder(string orderNo, string status, decimal quantity, decimal unitPrice)
    {
        var supply = quantity * unitPrice;
        return new SalesOrder
        {
            Header = new SalesOrderHeader { CD_FIRM = "1000", NO_SO = orderNo, DT_SO = "2026-07-15", CD_PARTNER = "P-10021", NM_PARTNER = "G2 Trading", CD_EMP = "E-TEST", ST_SO = status, DC_RMK = "SQL repository test" },
            Lines = [new SalesOrderLine { CD_FIRM = "1000", NO_SO = orderNo, NO_LINE = 1, CD_ITEM = "ITM-1001", NM_ITEM = "Controller A", STND_ITEM = "CTRL-A / 24V", UNIT_ITEM = "EA", QT_SO = quantity, UM_SO = unitPrice, AM_SUPPLY = supply, AM_VAT = supply / 10, AM_TOTAL = supply + supply / 10, DT_DLV = "2026-07-20", DC_RMK = "SQL repository test" }]
        };
    }

}
