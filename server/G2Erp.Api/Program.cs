using System.Text.Json;
using G2Erp.Api.Middleware;
using G2Erp.Api.Repositories;
using G2Erp.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(options => options.JsonSerializerOptions.PropertyNamingPolicy = null);
builder.Services.AddCors(options => options.AddPolicy("FrontendOnly", policy => policy
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
    .AllowAnyHeader()
    .AllowAnyMethod()));

var repositoryMode = builder.Configuration["RepositoryMode"] ?? "InMemory";
if (string.Equals(repositoryMode, "SqlServer", StringComparison.OrdinalIgnoreCase))
{
    var connectionString = builder.Configuration.GetConnectionString("G2Erp")
        ?? throw new InvalidOperationException("ConnectionStrings:G2Erp is required when RepositoryMode is SqlServer.");
    var allowUnencryptedLocal = string.Equals(builder.Configuration["G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL"], "true", StringComparison.OrdinalIgnoreCase);
    SqlServerConnectionFactory.ValidateLocalOnly(connectionString, builder.Environment.IsDevelopment(), allowUnencryptedLocal, "G2ERP_DEV_LOCAL", "G2ERP_DEV_LOCAL_TEST");
    builder.Services.AddSingleton(new SqlServerConnectionFactory(connectionString));
    builder.Services.AddScoped<ISalesOrderRepository, SqlServerSalesOrderRepository>();
    builder.Services.AddScoped<IPurchaseOrderRepository, SqlServerPurchaseOrderRepository>();
    builder.Services.AddScoped<IPartnerRepository, SqlServerPartnerRepository>();
    builder.Services.AddScoped<IItemRepository, SqlServerItemRepository>();
    builder.Services.AddScoped<IWarehouseRepository, SqlServerWarehouseRepository>();
    builder.Services.AddScoped<IWorkOrderRepository, SqlServerWorkOrderRepository>();
    builder.Services.AddScoped<IProductionLineRepository, SqlServerProductionLineRepository>();
    builder.Services.AddScoped<IProcessRepository, SqlServerProcessRepository>();
    builder.Services.AddScoped<IEquipmentRepository, SqlServerEquipmentRepository>();
    builder.Services.AddScoped<IWorkOrderService, WorkOrderService>();
}
else if (string.Equals(repositoryMode, "InMemory", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddSingleton<ISalesOrderRepository, InMemorySalesOrderRepository>();
    builder.Services.AddSingleton<IPurchaseOrderRepository, InMemoryPurchaseOrderRepository>();
    builder.Services.AddSingleton<IPartnerRepository, InMemoryPartnerRepository>();
    builder.Services.AddSingleton<IItemRepository, InMemoryItemRepository>();
    builder.Services.AddSingleton<IWarehouseRepository, InMemoryWarehouseRepository>();
    builder.Services.AddSingleton<IWorkOrderRepository, InMemoryWorkOrderRepository>();
    builder.Services.AddSingleton<IProductionLineRepository, InMemoryProductionLineRepository>();
    builder.Services.AddSingleton<IProcessRepository, InMemoryProcessRepository>();
    builder.Services.AddSingleton<IEquipmentRepository, InMemoryEquipmentRepository>();
    builder.Services.AddScoped<IWorkOrderService, WorkOrderService>();
}
else
{
    throw new InvalidOperationException("RepositoryMode must be InMemory or SqlServer.");
}
builder.Services.AddScoped<ISalesOrderService, SalesOrderService>();
builder.Services.AddScoped<IPurchaseOrderService, PurchaseOrderService>();
builder.Services.AddScoped<IPartnerService, PartnerService>();
builder.Services.AddScoped<IItemService, ItemService>();
builder.Services.AddScoped<IWarehouseService, WarehouseService>();
builder.Services.AddScoped<IMailOrderParserService, MailOrderParserService>();
builder.Services.AddScoped<IDevelopmentDataService, DevelopmentDataService>();

var app = builder.Build();

app.UseMiddleware<ApiExceptionMiddleware>();
app.UseCors("FrontendOnly");
app.MapControllers();

app.Run();

public partial class Program { }
