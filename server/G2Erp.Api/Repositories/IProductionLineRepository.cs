using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public interface IProductionLineRepository
{
    Task<IReadOnlyList<ProductionLine>> GetAllAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken);
    Task<ProductionLine?> GetAsync(string companyCode, string lineCode, CancellationToken cancellationToken);
    Task AddAsync(ProductionLine line, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(string companyCode, string lineCode, CancellationToken cancellationToken);
}
