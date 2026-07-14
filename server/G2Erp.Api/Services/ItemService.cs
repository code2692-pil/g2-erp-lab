using G2Erp.Api.Contracts;
using G2Erp.Api.Repositories;

namespace G2Erp.Api.Services;

public sealed class ItemService(IItemRepository repository) : IItemService
{
    public async Task<IReadOnlyList<ItemDto>> GetAllAsync(CancellationToken cancellationToken) =>
        (await repository.GetAllAsync(cancellationToken)).Select(x => new ItemDto
        {
            CD_FIRM = x.CD_FIRM, CD_ITEM = x.CD_ITEM, NM_ITEM = x.NM_ITEM,
            STND_ITEM = x.STND_ITEM, UNIT_ITEM = x.UNIT_ITEM, YN_USE = x.YN_USE
        }).ToArray();
}
