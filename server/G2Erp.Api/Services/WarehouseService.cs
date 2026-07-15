using G2Erp.Api.Contracts;
using G2Erp.Api.Repositories;

namespace G2Erp.Api.Services;

public sealed class WarehouseService(IWarehouseRepository repository) : IWarehouseService
{
    public async Task<IReadOnlyList<WarehouseDto>> GetAllAsync(CancellationToken cancellationToken) =>
        (await repository.GetAllAsync(cancellationToken)).Select(x => new WarehouseDto { CD_FIRM = x.CD_FIRM, CD_WH = x.CD_WH, NM_WH = x.NM_WH, YN_USE = x.YN_USE }).ToArray();
}
