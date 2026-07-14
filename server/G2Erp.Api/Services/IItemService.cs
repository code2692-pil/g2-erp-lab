using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface IItemService
{
    Task<IReadOnlyList<ItemDto>> GetAllAsync(CancellationToken cancellationToken);
}
