using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public interface IItemRepository
{
    Task<IReadOnlyList<Item>> GetAllAsync(CancellationToken cancellationToken);
    Task<Item?> GetAsync(string companyCode, string itemCode, CancellationToken cancellationToken);
}
