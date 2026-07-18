using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryItemRepository : IItemRepository
{
    private static readonly List<Item> Items =
    [
        new() { CD_FIRM = "1000", CD_ITEM = "ITM-1001", NM_ITEM = "Controller A", STND_ITEM = "CTRL-A / 24V", UNIT_ITEM = "EA", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_ITEM = "ITM-1204", NM_ITEM = "Sensor Module B", STND_ITEM = "SENSOR-B / IP67", UNIT_ITEM = "EA", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_ITEM = "ITM-1410", NM_ITEM = "Control Cable", STND_ITEM = "CABLE-10M", UNIT_ITEM = "EA", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_ITEM = "ITM-2102", NM_ITEM = "Electrical Enclosure", STND_ITEM = "400x300x200", UNIT_ITEM = "EA", YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_ITEM = "ITM-3100", NM_ITEM = "Packaging Set", STND_ITEM = "BOX-L / 10EA", UNIT_ITEM = "SET", YN_USE = "Y" }
    ];

    public Task<IReadOnlyList<Item>> GetAllAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Item>>(Items);
    public Task<Item?> GetAsync(string companyCode, string itemCode, CancellationToken cancellationToken) =>
        Task.FromResult(Items.SingleOrDefault(x => x.CD_FIRM == companyCode && x.CD_ITEM == itemCode));

    public Task AddAsync(Item item, CancellationToken cancellationToken)
    {
        if (Items.Any(x => x.CD_FIRM == item.CD_FIRM && x.CD_ITEM == item.CD_ITEM))
            throw new InvalidOperationException("Item key already exists.");
        Items.Add(item);
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string companyCode, string itemCode, CancellationToken cancellationToken) =>
        Task.FromResult(Items.RemoveAll(x => x.CD_FIRM == companyCode && x.CD_ITEM == itemCode) > 0);
}
