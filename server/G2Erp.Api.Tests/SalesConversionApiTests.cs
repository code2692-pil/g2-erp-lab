using System.Net;
using System.Net.Http.Json;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class SalesConversionApiTests
{
    [Fact]
    public async Task PO01_SingleLine24_ConvertsAllAndLeavesZero()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"PO01",[("ITM-1001",24m)]);
        var result=await PurchaseAsync(scope.Client,"PO-01",source.Header.NO_SO,[(1,24m,180000m)]);
        Assert.Matches("^POR203401\\d{4}$",result.PurchaseOrderNo); Assert.Equal(0,result.Lines.Single().RemainingQuantity);
    }

    [Fact]
    public async Task PO02_TwoLines_CreateOnePurchaseWithTwoLinks()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"PO02",[("ITM-1001",60m),("ITM-1204",120m)]);
        var result=await PurchaseAsync(scope.Client,"PO-02",source.Header.NO_SO,[(1,60m,180000m),(2,120m,45000m)]);
        Assert.Equal(2,result.Lines.Count); Assert.All(result.Lines,line=>Assert.Equal(0,line.RemainingQuantity));
    }

    [Fact]
    public async Task PO03_Partial40Of100_Leaves60()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"PO03",[("ITM-1001",100m)]);
        var result=await PurchaseAsync(scope.Client,"PO-03",source.Header.NO_SO,[(1,40m,180000m)]); Assert.Equal(60,result.Lines.Single().RemainingQuantity);
    }

    [Fact]
    public async Task PO04_Split30And50_BlocksExcessAndReplaysIdempotently()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"PO04",[("ITM-1001",80m)]);
        await PurchaseAsync(scope.Client,"PO-04-A",source.Header.NO_SO,[(1,30m,180000m)]); var second=await PurchaseAsync(scope.Client,"PO-04-B",source.Header.NO_SO,[(1,50m,180000m)]); Assert.Equal(0,second.Lines.Single().RemainingQuantity);
        var replay=await PurchaseAsync(scope.Client,"PO-04-B",source.Header.NO_SO,[(1,50m,180000m)]); Assert.True(replay.IdempotentReplay); Assert.Equal(second.PurchaseOrderNo,replay.PurchaseOrderNo);
        var excess=await scope.Client.PostAsJsonAsync("/api/sales-conversions/purchase-orders",PurchaseRequest("PO-04-C",source.Header.NO_SO,[(1,1m,180000m)])); Assert.Equal(HttpStatusCode.Conflict,excess.StatusCode);
    }

    [Fact]
    public async Task PO05_InvalidSecondLine_RollsBackThenValidRetryCreatesOnePurchase()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"PO05",[("ITM-1001",20m)]); var before=await PurchaseCountAsync(scope.Client);
        var failed=await scope.Client.PostAsJsonAsync("/api/sales-conversions/purchase-orders",PurchaseRequest("PO-05",source.Header.NO_SO,[(1,10m,180000m),(99,1m,1m)])); Assert.Equal(HttpStatusCode.Conflict,failed.StatusCode); Assert.Equal(before,await PurchaseCountAsync(scope.Client));
        var retry=await PurchaseAsync(scope.Client,"PO-05",source.Header.NO_SO,[(1,20m,180000m)]); Assert.Equal(0,retry.Lines.Single().RemainingQuantity); Assert.Equal(before+1,await PurchaseCountAsync(scope.Client));
    }

    [Fact]
    public async Task WO01_Quantity20_ExpandsFiveOperationsAndThreeBills()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"WO01",[("ITM-1001",20m)]); var result=await WorkAsync(scope.Client,"WO-01",source.Header.NO_SO,1,20m);
        Assert.Matches("^WMO203401\\d{4}$",result.WorkOrderNo); Assert.True(result.Operations.Count>=4); Assert.True(result.Bills.Count>=3); Assert.All(result.Bills,bill=>Assert.Equal(bill.BaseQuantity*20m,bill.RequiredQuantity));
    }

    [Fact]
    public async Task WO02_TwoSourceLines_CreateSeparateWorkOrders()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"WO02",[("ITM-1001",10m),("ITM-1001",15m)]); var first=await WorkAsync(scope.Client,"WO-02-A",source.Header.NO_SO,1,10m); var second=await WorkAsync(scope.Client,"WO-02-B",source.Header.NO_SO,2,15m);
        Assert.NotEqual(first.WorkOrderNo,second.WorkOrderNo); Assert.Equal(0,first.Source.RemainingQuantity); Assert.Equal(0,second.Source.RemainingQuantity);
    }

    [Fact]
    public async Task WO03_Partial40Of100_Leaves60AndScalesBills()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"WO03",[("ITM-1001",100m)]); var result=await WorkAsync(scope.Client,"WO-03",source.Header.NO_SO,1,40m);
        Assert.Equal(60,result.Source.RemainingQuantity); Assert.All(result.Bills,bill=>Assert.Equal(bill.BaseQuantity*40m,bill.RequiredQuantity));
    }

    [Fact]
    public async Task WO04_Split25And35_BlocksAdditionalQuantityAndReplaysRequest()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"WO04",[("ITM-1001",60m)]); await WorkAsync(scope.Client,"WO-04-A",source.Header.NO_SO,1,25m); var second=await WorkAsync(scope.Client,"WO-04-B",source.Header.NO_SO,1,35m); Assert.Equal(0,second.Source.RemainingQuantity);
        var replay=await WorkAsync(scope.Client,"WO-04-B",source.Header.NO_SO,1,35m); Assert.True(replay.IdempotentReplay); Assert.Equal(second.WorkOrderNo,replay.WorkOrderNo);
        var excess=await scope.Client.PostAsJsonAsync("/api/sales-conversions/work-orders",WorkRequest("WO-04-C",source.Header.NO_SO,1,1m)); Assert.Equal(HttpStatusCode.Conflict,excess.StatusCode);
    }

    [Fact]
    public async Task WO05_MissingMaster_RollsBackThenValidRetryCreatesOneWorkOrder()
    {
        using var scope=Create(); var source=await CreateSalesAsync(scope.Client,"WO05",[("ITM-1001",20m)]); var before=await WorkCountAsync(scope.Client);
        var invalid=WorkRequest("WO-05",source.Header.NO_SO,1,20m) with { BomVersion="MISSING" }; var failed=await scope.Client.PostAsJsonAsync("/api/sales-conversions/work-orders",invalid); Assert.Equal(HttpStatusCode.Conflict,failed.StatusCode); Assert.Equal(before,await WorkCountAsync(scope.Client));
        var retry=await WorkAsync(scope.Client,"WO-05",source.Header.NO_SO,1,20m); Assert.Equal(before+1,await WorkCountAsync(scope.Client)); Assert.Equal(0,retry.Source.RemainingQuantity);
    }

    private static async Task<SalesOrderDto> CreateSalesAsync(HttpClient client,string marker,IReadOnlyList<(string Item,decimal Quantity)> rows)
    {
        var temporary=$"TEMP_SO_{marker}"; var request=new UpsertSalesOrderRequest { Header=new SalesOrderHeaderDto { CD_FIRM="1000",NO_SO=temporary,DT_SO="2034-01-05",CD_PARTNER="P-10021",NM_PARTNER="ignored",CD_EMP="UAT",ST_SO="확정",DC_RMK=$"FINAL-UAT-202608-{marker}" }, Lines=rows.Select((row,index)=>new SalesOrderLineDto { CD_FIRM="1000",NO_SO=temporary,NO_LINE=index+1,CD_ITEM=row.Item,NM_ITEM="ignored",STND_ITEM="ignored",UNIT_ITEM="EA",QT_SO=row.Quantity,UM_SO=100,AM_SUPPLY=0,AM_VAT=0,AM_TOTAL=0,DT_DLV="2034-01-20",DC_RMK="" }).ToArray() };
        var response=await client.PostAsJsonAsync("/api/sales-orders",request); Assert.Equal(HttpStatusCode.Created,response.StatusCode); return (await response.Content.ReadFromJsonAsync<SalesOrderDto>())!;
    }

    private static PurchaseConversionRequest PurchaseRequest(string key,string salesNo,IReadOnlyList<(int Line,decimal Quantity,decimal Price)> rows)=>new(key,"1000",salesNo,"2034-01-06","P-10044","WH-100","KRW","BUYER",rows.Select(row=>new PurchaseConversionLineRequest(row.Line,row.Quantity,row.Price,"2034-01-20")).ToArray());
    private static async Task<PurchaseConversionResult> PurchaseAsync(HttpClient client,string key,string salesNo,IReadOnlyList<(int Line,decimal Quantity,decimal Price)> rows){var response=await client.PostAsJsonAsync("/api/sales-conversions/purchase-orders",PurchaseRequest(key,salesNo,rows));Assert.Equal(HttpStatusCode.OK,response.StatusCode);return(await response.Content.ReadFromJsonAsync<PurchaseConversionResult>())!;}
    private static WorkOrderConversionRequest WorkRequest(string key,string salesNo,int line,decimal quantity)=>new(key,"1000",salesNo,line,quantity,"2034-01-06","2034-01-07","2034-01-09","LINE-A","FINAL-UAT-1","FINAL-UAT-1");
    private static async Task<WorkOrderConversionResult> WorkAsync(HttpClient client,string key,string salesNo,int line,decimal quantity){var response=await client.PostAsJsonAsync("/api/sales-conversions/work-orders",WorkRequest(key,salesNo,line,quantity));Assert.Equal(HttpStatusCode.OK,response.StatusCode);return(await response.Content.ReadFromJsonAsync<WorkOrderConversionResult>())!;}
    private static async Task<int> PurchaseCountAsync(HttpClient client)=>(await (await client.GetAsync("/api/purchase-orders")).Content.ReadFromJsonAsync<PurchaseOrderDetailDto[]>())!.Length;
    private static async Task<int> WorkCountAsync(HttpClient client)=>(await (await client.GetAsync("/api/work-orders")).Content.ReadFromJsonAsync<WorkOrderDetailDto[]>())!.Length;
    private static TestScope Create(){var factory=new WebApplicationFactory<Program>().WithWebHostBuilder(builder=>builder.UseSetting("RepositoryMode","InMemory"));return new(factory,factory.CreateClient());}
    private sealed record TestScope(WebApplicationFactory<Program> Factory,HttpClient Client):IDisposable{public void Dispose(){Client.Dispose();Factory.Dispose();}}
}
