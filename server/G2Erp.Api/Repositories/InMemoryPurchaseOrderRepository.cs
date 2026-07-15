using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryPurchaseOrderRepository : IPurchaseOrderRepository
{
    private readonly object _gate = new();
    private readonly List<PurchaseOrder> _orders =
    [
        Create("1000", "PO2026070001", "2026-07-01", "P-10021", "G2 Trading", "ITM-1001", "Controller A", "CTRL-A / 24V", "EA", 10, 280000, "WH-100", "Central Warehouse"),
        Create("1000", "PO2026070002", "2026-07-02", "P-10044", "Hanul Industry", "ITM-1204", "Sensor Module B", "SENSOR-B / IP67", "EA", 20, 45000, "WH-110", "Parts Warehouse")
    ];

    public Task<IReadOnlyList<PurchaseOrder>> GetAllAsync(PurchaseOrderSearch search, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            var query = _orders.AsEnumerable();
            if (!string.IsNullOrWhiteSpace(search.CompanyCode)) query = query.Where(x => x.Header.CD_FIRM == search.CompanyCode);
            if (!string.IsNullOrWhiteSpace(search.DateFrom)) query = query.Where(x => x.Header.DT_PO.CompareTo(search.DateFrom) >= 0);
            if (!string.IsNullOrWhiteSpace(search.DateTo)) query = query.Where(x => x.Header.DT_PO.CompareTo(search.DateTo) <= 0);
            if (!string.IsNullOrWhiteSpace(search.PurchaseOrderNo)) query = query.Where(x => x.Header.NO_PO.Contains(search.PurchaseOrderNo, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(search.Partner)) query = query.Where(x => x.Header.CD_PARTNER.Contains(search.Partner, StringComparison.OrdinalIgnoreCase) || x.Header.NM_PARTNER.Contains(search.Partner, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(search.Status)) query = query.Where(x => x.Header.ST_PO == search.Status);
            return Task.FromResult<IReadOnlyList<PurchaseOrder>>(query.OrderByDescending(x => x.Header.DT_PO).ThenByDescending(x => x.Header.NO_PO).Select(Clone).ToArray());
        }
    }

    public Task<PurchaseOrder?> GetAsync(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken)
    {
        lock (_gate) return Task.FromResult(_orders.Where(x => x.Header.CD_FIRM == companyCode && x.Header.NO_PO == purchaseOrderNo).Select(Clone).SingleOrDefault());
    }

    public Task AddAsync(PurchaseOrder purchaseOrder, CancellationToken cancellationToken) { lock (_gate) _orders.Add(Clone(purchaseOrder)); return Task.CompletedTask; }
    public Task UpdateAsync(PurchaseOrder purchaseOrder, CancellationToken cancellationToken) { lock (_gate) { var index = _orders.FindIndex(x => x.Header.CD_FIRM == purchaseOrder.Header.CD_FIRM && x.Header.NO_PO == purchaseOrder.Header.NO_PO); if (index >= 0) _orders[index] = Clone(purchaseOrder); } return Task.CompletedTask; }
    public Task<bool> DeleteAsync(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken) { lock (_gate) return Task.FromResult(_orders.RemoveAll(x => x.Header.CD_FIRM == companyCode && x.Header.NO_PO == purchaseOrderNo) > 0); }

    private static PurchaseOrder Create(string firm, string no, string date, string partnerCode, string partnerName, string itemCode, string itemName, string standard, string unit, decimal quantity, decimal price, string warehouseCode, string warehouseName)
    {
        var supply = decimal.Round(quantity * price, 0, MidpointRounding.AwayFromZero); var vat = decimal.Round(supply * 0.1m, 0, MidpointRounding.AwayFromZero);
        return new PurchaseOrder { Header = new PurchaseOrderHeader { CD_FIRM = firm, NO_PO = no, DT_PO = date, CD_PARTNER = partnerCode, NM_PARTNER = partnerName, CD_EMP = "E-001", NM_EMP = "Buyer", CD_CURRENCY = "KRW", RT_EXCHANGE = 1, ST_PO = "New", DC_RMK = "In-memory sample" }, Lines = [new PurchaseOrderLine { CD_FIRM = firm, NO_PO = no, NO_LINE = 1, CD_ITEM = itemCode, NM_ITEM = itemName, STND_ITEM = standard, UNIT_ITEM = unit, QT_PO = quantity, UM_PO = price, AM_SUPPLY = supply, AM_VAT = vat, AM_TOTAL = supply + vat, DT_DLV = "2026-07-20", CD_WH = warehouseCode, NM_WH = warehouseName, DC_RMK = "" }] };
    }
    private static PurchaseOrder Clone(PurchaseOrder order) => new() { Header = order.Header with { }, Lines = order.Lines.Select(x => x with { }).ToArray() };
}
