using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface ISalesOrderService
{
    Task<IReadOnlyList<SalesOrderDto>> GetAllAsync(CancellationToken cancellationToken);
    Task<SalesOrderDto?> GetAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken);
    Task<SalesOrderDto> CreateAsync(UpsertSalesOrderRequest request, CancellationToken cancellationToken);
    Task<SalesOrderDto> UpdateAsync(string companyCode, string salesOrderNo, UpsertSalesOrderRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken);
}
