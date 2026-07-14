using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public sealed class InMemorySalesOrderRepository : ISalesOrderRepository
{
    private readonly object _gate = new();
    private readonly List<SalesOrder> _orders =
    [
        Create("1000", "SO2026070001", "2026-07-01", "P-10021", "G2 Trading", "ITM-1001", "Controller A", "CTRL-A / 24V", "EA", 12, 280000, "2026-07-15"),
        Create("1000", "SO2026070002", "2026-07-02", "P-10044", "Hanul Industry", "ITM-2102", "Electrical Enclosure", "400x300x200", "EA", 25, 135000, "2026-07-25"),
        Create("2000", "SO2026070003", "2026-07-04", "P-20012", "Daeyang Distribution", "ITM-3100", "Packaging Set", "BOX-L / 10EA", "SET", 100, 8000, "2026-07-08")
    ];

    public Task<IReadOnlyList<SalesOrder>> GetAllAsync(CancellationToken cancellationToken)
    {
        lock (_gate) return Task.FromResult<IReadOnlyList<SalesOrder>>(_orders.Select(Clone).ToArray());
    }

    public Task<SalesOrder?> GetAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken)
    {
        lock (_gate) return Task.FromResult(_orders.Where(x => x.Header.CD_FIRM == companyCode && x.Header.NO_SO == salesOrderNo).Select(Clone).SingleOrDefault());
    }

    public Task AddAsync(SalesOrder salesOrder, CancellationToken cancellationToken)
    {
        lock (_gate) _orders.Add(Clone(salesOrder));
        return Task.CompletedTask;
    }

    public Task UpdateAsync(SalesOrder salesOrder, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            var index = _orders.FindIndex(x => x.Header.CD_FIRM == salesOrder.Header.CD_FIRM && x.Header.NO_SO == salesOrder.Header.NO_SO);
            if (index >= 0) _orders[index] = Clone(salesOrder);
        }
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken)
    {
        lock (_gate) return Task.FromResult(_orders.RemoveAll(x => x.Header.CD_FIRM == companyCode && x.Header.NO_SO == salesOrderNo) > 0);
    }

    private static SalesOrder Create(string firm, string no, string date, string partnerCode, string partnerName, string itemCode, string itemName, string standard, string unit, decimal quantity, decimal price, string deliveryDate)
    {
        var supply = decimal.Round(quantity * price, 0, MidpointRounding.AwayFromZero);
        var vat = decimal.Round(supply * 0.1m, 0, MidpointRounding.AwayFromZero);
        return new SalesOrder
        {
            Header = new SalesOrderHeader { CD_FIRM = firm, NO_SO = no, DT_SO = date, CD_PARTNER = partnerCode, NM_PARTNER = partnerName, CD_EMP = "E-001", ST_SO = "Confirmed", DC_RMK = "In-memory sample" },
            Lines = [new SalesOrderLine { CD_FIRM = firm, NO_SO = no, NO_LINE = 1, CD_ITEM = itemCode, NM_ITEM = itemName, STND_ITEM = standard, UNIT_ITEM = unit, QT_SO = quantity, UM_SO = price, AM_SUPPLY = supply, AM_VAT = vat, AM_TOTAL = supply + vat, DT_DLV = deliveryDate, DC_RMK = "" }]
        };
    }

    private static SalesOrder Clone(SalesOrder order) => new() { Header = order.Header with { }, Lines = order.Lines.Select(line => line with { }).ToArray() };
}
