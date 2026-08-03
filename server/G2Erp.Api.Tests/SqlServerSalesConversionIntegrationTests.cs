using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class SqlServerSalesConversionIntegrationTests
{
    private const string ConnectionString="Server=.;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=True;TrustServerCertificate=True";

    [Fact]
    [Trait("Category","SqlServerIntegration")]
    public async Task SqlServerConversion_CreatesTraceablePurchaseAndWorkOrderWithoutOrphans()
    {
        var marker=$"FINAL-UAT-202608-SQL-{Guid.NewGuid():N}"; PurchaseConversionResult? purchase=null; WorkOrderConversionResult? work=null; string? salesNo=null;
        using var factory=new WebApplicationFactory<Program>().WithWebHostBuilder(builder=>{builder.UseEnvironment("Development");builder.UseSetting("RepositoryMode","SqlServer");builder.UseSetting("ConnectionStrings:G2Erp",ConnectionString);}); using var client=factory.CreateClient();
        try
        {
            var temporary=$"TEMP_SO_{Guid.NewGuid():N}"; var create=new UpsertSalesOrderRequest { Header=new SalesOrderHeaderDto { CD_FIRM="1000",NO_SO=temporary,DT_SO="2035-02-01",CD_PARTNER="P-10021",NM_PARTNER="ignored",CD_EMP="UAT",ST_SO="확정",DC_RMK=marker }, Lines=[new SalesOrderLineDto { CD_FIRM="1000",NO_SO=temporary,NO_LINE=1,CD_ITEM="ITM-1001",NM_ITEM="ignored",STND_ITEM="ignored",UNIT_ITEM="EA",QT_SO=50,UM_SO=100,AM_SUPPLY=0,AM_VAT=0,AM_TOTAL=0,DT_DLV="2035-02-20",DC_RMK=marker }] };
            var created=await client.PostAsJsonAsync("/api/sales-orders",create); Assert.Equal(HttpStatusCode.Created,created.StatusCode); salesNo=(await created.Content.ReadFromJsonAsync<SalesOrderDto>())!.Header.NO_SO;
            var purchaseRequest=new PurchaseConversionRequest(marker+"-PO","1000",salesNo,"2035-02-02","UAT-SUP-01","UAT-WH-01","KRW","UAT",[new(1,20,180000,"2035-02-20")]); var purchaseResponse=await client.PostAsJsonAsync("/api/sales-conversions/purchase-orders",purchaseRequest); Assert.True(purchaseResponse.StatusCode==HttpStatusCode.OK,await purchaseResponse.Content.ReadAsStringAsync()); purchase=(await purchaseResponse.Content.ReadFromJsonAsync<PurchaseConversionResult>())!; Assert.Equal(30,purchase.Lines.Single().RemainingQuantity);
            var purchaseReplay=(await (await client.PostAsJsonAsync("/api/sales-conversions/purchase-orders",purchaseRequest)).Content.ReadFromJsonAsync<PurchaseConversionResult>())!; Assert.True(purchaseReplay.IdempotentReplay); Assert.Equal(purchase.PurchaseOrderId,purchaseReplay.PurchaseOrderId);
            var workRequest=new WorkOrderConversionRequest(marker+"-WO","1000",salesNo,1,30,"2035-02-02","2035-02-03","2035-02-05","LINE-A","FINAL-UAT-1","FINAL-UAT-1"); var workResponse=await client.PostAsJsonAsync("/api/sales-conversions/work-orders",workRequest); Assert.True(workResponse.StatusCode==HttpStatusCode.OK,await workResponse.Content.ReadAsStringAsync()); work=(await workResponse.Content.ReadFromJsonAsync<WorkOrderConversionResult>())!; Assert.Equal(20,work.Source.RemainingQuantity); Assert.True(work.Operations.Count>=4); Assert.True(work.Bills.Count>=3);
            await using var connection=new SqlConnection(ConnectionString); await connection.OpenAsync();
            Assert.Equal(0,await ScalarAsync(connection,"SELECT (SELECT COUNT(*) FROM POC.PUR_POL line LEFT JOIN POC.PUR_POH header ON header.ID_POH=line.ID_POH WHERE line.ID_POH=@po AND header.ID_POH IS NULL)+(SELECT COUNT(*) FROM POC.PRT_WOPROC line LEFT JOIN POC.PRT_WO header ON header.ID_WO=line.ID_WO WHERE line.ID_WO=@wo AND header.ID_WO IS NULL)+(SELECT COUNT(*) FROM POC.PRT_WOBILL line LEFT JOIN POC.PRT_WO header ON header.ID_WO=line.ID_WO WHERE line.ID_WO=@wo AND header.ID_WO IS NULL)",("@po",purchase.PurchaseOrderId),("@wo",work.WorkOrderId)));
            Assert.Equal(1,await ScalarAsync(connection,"SELECT COUNT(*) FROM POC.PUR_POL WHERE ID_POH=@po AND ID_SOURCE_SOH IS NOT NULL AND ID_SOURCE_SOL IS NOT NULL AND NO_SOURCE_SO=@sales",("@po",purchase.PurchaseOrderId),("@sales",salesNo)));
            Assert.Equal(work.Operations.Count,await ScalarAsync(connection,"SELECT COUNT(*) FROM POC.PRT_WOPROC WHERE ID_WO=@wo",("@wo",work.WorkOrderId))); Assert.Equal(work.Bills.Count,await ScalarAsync(connection,"SELECT COUNT(*) FROM POC.PRT_WOBILL WHERE ID_WO=@wo",("@wo",work.WorkOrderId)));
        }
        finally { await CleanupAsync(marker,salesNo,purchase,work); }
    }

    private static async Task<int> ScalarAsync(SqlConnection connection,string sql,params (string Name,object Value)[] parameters){await using var command=new SqlCommand(sql,connection);foreach(var parameter in parameters)command.Parameters.AddWithValue(parameter.Name,parameter.Value);return Convert.ToInt32(await command.ExecuteScalarAsync());}
    private static async Task CleanupAsync(string marker,string? salesNo,PurchaseConversionResult? purchase,WorkOrderConversionResult? work)
    {
        await using var connection=new SqlConnection(ConnectionString);await connection.OpenAsync();await using var transaction=await connection.BeginTransactionAsync();var tx=(SqlTransaction)transaction;
        try
        {
            foreach(var requestId in new Guid?[]{purchase?.RequestId,work?.RequestId}.Where(id=>id.HasValue).Select(id=>id!.Value)){await Exec("DELETE POC.DOC_CONVERSION_REQUEST_LINE WHERE ID_REQUEST=@id",("@id",requestId));await Exec("DELETE POC.DOC_CONVERSION_REQUEST WHERE ID_REQUEST=@id",("@id",requestId));}
            if(work is not null){await Exec("DELETE POC.PRT_WOBILL WHERE ID_WO=@id",("@id",work.WorkOrderId));await Exec("DELETE POC.PRT_WOPROC WHERE ID_WO=@id",("@id",work.WorkOrderId));await Exec("DELETE POC.PRT_WO WHERE ID_WO=@id",("@id",work.WorkOrderId));}
            if(purchase is not null){await Exec("DELETE POC.PUR_POL WHERE ID_POH=@id",("@id",purchase.PurchaseOrderId));await Exec("DELETE POC.PUR_POH WHERE ID_POH=@id",("@id",purchase.PurchaseOrderId));}
            if(salesNo is not null){await Exec("DELETE POC.SAL_SOL WHERE CD_FIRM='1000' AND NO_SO=@number",("@number",salesNo));await Exec("DELETE POC.SAL_SOH WHERE CD_FIRM='1000' AND NO_SO=@number",("@number",salesNo));}
            await transaction.CommitAsync();
        }
        catch{await transaction.RollbackAsync();throw;}
        async Task Exec(string sql,params (string Name,object Value)[] parameters){await using var command=new SqlCommand(sql,connection,tx);foreach(var parameter in parameters)command.Parameters.AddWithValue(parameter.Name,parameter.Value);await command.ExecuteNonQueryAsync();}
    }
}
