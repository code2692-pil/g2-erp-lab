using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface IWarehouseService
{
    Task<IReadOnlyList<WarehouseDto>> GetAllAsync(CancellationToken cancellationToken);
}
