using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public interface IProcessRepository
{
    Task<IReadOnlyList<ProductionProcess>> GetAllAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken);
    Task<ProductionProcess?> GetAsync(string companyCode, string processCode, CancellationToken cancellationToken);
    Task AddAsync(ProductionProcess process, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(string companyCode, string processCode, CancellationToken cancellationToken);
}
