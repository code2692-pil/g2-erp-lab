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

builder.Services.AddSingleton<ISalesOrderRepository, InMemorySalesOrderRepository>();
builder.Services.AddSingleton<IPartnerRepository, InMemoryPartnerRepository>();
builder.Services.AddSingleton<IItemRepository, InMemoryItemRepository>();
builder.Services.AddScoped<ISalesOrderService, SalesOrderService>();
builder.Services.AddScoped<IPartnerService, PartnerService>();
builder.Services.AddScoped<IItemService, ItemService>();
builder.Services.AddScoped<IMailOrderParserService, MailOrderParserService>();

var app = builder.Build();

app.UseMiddleware<ApiExceptionMiddleware>();
app.UseCors("FrontendOnly");
app.MapControllers();

app.Run();

public partial class Program { }
