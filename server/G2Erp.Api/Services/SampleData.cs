using System.Globalization;
using G2Erp.Api.Domain;
using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Services;

/// <summary>Fixed fictional data. Keys are the only values eligible for automated cleanup.</summary>
internal static class SampleData
{
    private const string Firm = "1000";
    internal const string SampleDateFormat = "yyyy-MM-dd";
    internal const string SampleDateTimeFormat = "yyyy-MM-ddTHH:mm:ss";
    private static readonly DateTime AuditTime = new(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc);

    public static readonly IReadOnlyList<Item> Items =
    [
        Item("ITEM-SMP-FG01", "Sample Finished Good A", "SMP-FG-A", "EA"),
        Item("ITEM-SMP-FG02", "Sample Finished Good B", "SMP-FG-B", "EA"),
        Item("ITEM-SMP-SF01", "Sample Semi-finished A", "SMP-SF-A", "EA"),
        Item("ITEM-SMP-SF02", "Sample Semi-finished B", "SMP-SF-B", "EA"),
        Item("ITEM-SMP-RM01", "Sample Raw Material A", "SMP-RM-A", "KG"),
        Item("ITEM-SMP-RM02", "Sample Raw Material B", "SMP-RM-B", "L")
    ];

    public static readonly IReadOnlyList<ProductionLine> Lines =
    [
        new() { CD_FIRM = Firm, CD_LINE = "LINE-SMP-01", NM_LINE = "Sample Mixing Line", YN_USE = "Y" },
        new() { CD_FIRM = Firm, CD_LINE = "LINE-SMP-02", NM_LINE = "Sample Assembly Line", YN_USE = "Y" },
        new() { CD_FIRM = Firm, CD_LINE = "LINE-SMP-03", NM_LINE = "Sample Packaging Line", YN_USE = "Y" }
    ];

    public static readonly IReadOnlyList<ProductionProcess> Processes =
    [
        Process("PROC-SMP-01", "Material preparation", 10), Process("PROC-SMP-02", "Mixing", 20),
        Process("PROC-SMP-03", "Assembly", 30), Process("PROC-SMP-04", "Intermediate inspection", 40),
        Process("PROC-SMP-05", "Packaging", 50), Process("PROC-SMP-06", "Label application", 60),
        Process("PROC-SMP-07", "Final inspection", 70), Process("PROC-SMP-08", "Put-away", 80)
    ];

    public static readonly IReadOnlyList<Equipment> Equipment =
    [
        EquipmentRow("EQ-SMP-01", "Sample Mixer 1", "LINE-SMP-01"), EquipmentRow("EQ-SMP-02", "Sample Mixer 2", "LINE-SMP-01"),
        EquipmentRow("EQ-SMP-03", "Sample Assembly Unit 1", "LINE-SMP-02"), EquipmentRow("EQ-SMP-04", "Sample Assembly Unit 2", "LINE-SMP-02"),
        EquipmentRow("EQ-SMP-05", "Sample Inspection Unit 1", "LINE-SMP-02"), EquipmentRow("EQ-SMP-06", "Sample Inspection Unit 2", "LINE-SMP-02"),
        EquipmentRow("EQ-SMP-07", "Sample Packing Unit 1", "LINE-SMP-03"), EquipmentRow("EQ-SMP-08", "Sample Packing Unit 2", "LINE-SMP-03")
    ];

    public static readonly IReadOnlyList<Partner> Partners =
    [
        new() { CD_FIRM = Firm, CD_PARTNER = "PARTNER-SMP-CUST01", NM_PARTNER = "Sample Customer One", NO_COMPANY = "000-00-00001", YN_USE = "Y" },
        new() { CD_FIRM = Firm, CD_PARTNER = "PARTNER-SMP-SUP01", NM_PARTNER = "Sample Supplier One", NO_COMPANY = "000-00-00002", YN_USE = "Y" }
    ];

    public static readonly IReadOnlyList<Warehouse> Warehouses =
    [new() { CD_FIRM = Firm, CD_WH = "WH-SMP-01", NM_WH = "Sample Warehouse", YN_USE = "Y" }];

    public static readonly IReadOnlyList<SalesOrder> SalesOrders = Enumerable.Range(1, 6).Select(BuildSalesOrder).ToArray();
    public static readonly IReadOnlyList<PurchaseOrder> PurchaseOrders = Enumerable.Range(1, 6).Select(BuildPurchaseOrder).ToArray();
    public static readonly IReadOnlyList<WorkOrder> WorkOrders = BuildWorkOrders();

    private static Item Item(string code, string name, string standard, string unit) => new() { CD_FIRM = Firm, CD_ITEM = code, NM_ITEM = name, STND_ITEM = standard, UNIT_ITEM = unit, YN_USE = "Y" };
    private static ProductionProcess Process(string code, string name, int sequence) => new() { CD_FIRM = Firm, CD_PROC = code, NM_PROC = name, NO_SEQ = sequence, YN_USE = "Y" };
    private static Equipment EquipmentRow(string code, string name, string lineCode) => new() { CD_FIRM = Firm, CD_EQUIP = code, NM_EQUIP = name, CD_LINE = lineCode, YN_USE = "Y" };

    private static SalesOrder BuildSalesOrder(int index)
    {
        var number = $"SO-SAMPLE-{index:D4}";
        var statuses = new[] { "Draft", "Confirmed", "Approved", "InProgress", "Closed", "Cancelled" };
        var selectedItems = Items.Take(1 + (index - 1) % 4).ToArray();
        var lines = selectedItems.Select((item, lineIndex) => SalesLine(number, lineIndex + 1, item, 10m * (index + lineIndex), 1000m + 100m * lineIndex)).ToArray();
        return new SalesOrder
        {
            Header = new SalesOrderHeader { CD_FIRM = Firm, NO_SO = number, DT_SO = $"2026-08-{index:D2}", CD_PARTNER = Partners[0].CD_PARTNER, NM_PARTNER = Partners[0].NM_PARTNER, CD_EMP = "SAMPLE", ST_SO = statuses[index - 1], DC_RMK = "Fictional Sample sales order" },
            Lines = lines
        };
    }

    private static SalesOrderLine SalesLine(string orderNo, int lineNo, Item item, decimal quantity, decimal price)
    {
        var supply = quantity * price;
        var vat = decimal.Round(supply * .1m, 0, MidpointRounding.AwayFromZero);
        return new SalesOrderLine { CD_FIRM = Firm, NO_SO = orderNo, NO_LINE = lineNo, CD_ITEM = item.CD_ITEM, NM_ITEM = item.NM_ITEM, STND_ITEM = item.STND_ITEM, UNIT_ITEM = item.UNIT_ITEM, QT_SO = quantity, UM_SO = price, AM_SUPPLY = supply, AM_VAT = vat, AM_TOTAL = supply + vat, DT_DLV = "2026-08-20", DC_RMK = "Sample line" };
    }

    private static PurchaseOrder BuildPurchaseOrder(int index)
    {
        var number = $"PO-SAMPLE-{index:D4}";
        var statuses = new[] { "Draft", "Confirmed", "Approved", "InProgress", "Closed", "Cancelled" };
        var selectedItems = Items.Skip(2).Take(1 + (index - 1) % 4).ToArray();
        var lines = selectedItems.Select((item, lineIndex) => PurchaseLine(number, lineIndex + 1, item, 20m * (index + lineIndex), 700m + 75m * lineIndex)).ToArray();
        return new PurchaseOrder
        {
            Header = new PurchaseOrderHeader { CD_FIRM = Firm, NO_PO = number, DT_PO = $"2026-08-{index:D2}", CD_PARTNER = Partners[1].CD_PARTNER, NM_PARTNER = Partners[1].NM_PARTNER, CD_EMP = "SAMPLE", NM_EMP = "Sample Buyer", CD_CURRENCY = "KRW", RT_EXCHANGE = 1, ST_PO = statuses[index - 1], DC_RMK = "Fictional Sample purchase order" },
            Lines = lines
        };
    }

    private static PurchaseOrderLine PurchaseLine(string orderNo, int lineNo, Item item, decimal quantity, decimal price)
    {
        var supply = quantity * price;
        var vat = decimal.Round(supply * .1m, 0, MidpointRounding.AwayFromZero);
        return new PurchaseOrderLine { CD_FIRM = Firm, NO_PO = orderNo, NO_LINE = lineNo, CD_ITEM = item.CD_ITEM, NM_ITEM = item.NM_ITEM, STND_ITEM = item.STND_ITEM, UNIT_ITEM = item.UNIT_ITEM, QT_PO = quantity, UM_PO = price, AM_SUPPLY = supply, AM_VAT = vat, AM_TOTAL = supply + vat, DT_DLV = "2026-08-24", CD_WH = Warehouses[0].CD_WH, NM_WH = Warehouses[0].NM_WH, DC_RMK = "Sample line" };
    }

    private static IReadOnlyList<WorkOrder> BuildWorkOrders() =>
    [
        Work("WO-SAMPLE-0001", "ITEM-SMP-FG01", "LINE-SMP-02", 120, 0, "Draft", "N", ("PROC-SMP-03", "EQ-SMP-03"), ("PROC-SMP-04", "EQ-SMP-05"), ("PROC-SMP-07", "EQ-SMP-06")),
        Work("WO-SAMPLE-0002", "ITEM-SMP-SF01", "LINE-SMP-01", 80, 0, "Confirmed", "N", ("PROC-SMP-01", "EQ-SMP-01"), ("PROC-SMP-02", "EQ-SMP-02"), ("PROC-SMP-04", "EQ-SMP-01")),
        Work("WO-SAMPLE-0003", "ITEM-SMP-FG02", "LINE-SMP-02", 60, 20, "InProgress", "N", ("PROC-SMP-03", "EQ-SMP-03"), ("PROC-SMP-04", "EQ-SMP-04"), ("PROC-SMP-07", "EQ-SMP-06")),
        Work("WO-SAMPLE-0004", "ITEM-SMP-SF02", "LINE-SMP-01", 100, 100, "Completed", "N", ("PROC-SMP-01", "EQ-SMP-01"), ("PROC-SMP-02", "EQ-SMP-02"), ("PROC-SMP-04", "EQ-SMP-01")),
        Work("WO-SAMPLE-0005", "ITEM-SMP-FG01", "LINE-SMP-02", 40, 0, "Confirmed", "Y", ("PROC-SMP-03", "EQ-SMP-04"), ("PROC-SMP-04", "EQ-SMP-05"), ("PROC-SMP-07", "EQ-SMP-06")),
        Work("WO-SAMPLE-0006", "ITEM-SMP-FG02", "LINE-SMP-03", 30, 30, "InProgress", "N", ("PROC-SMP-05", "EQ-SMP-07"), ("PROC-SMP-06", "EQ-SMP-08"), ("PROC-SMP-08", "EQ-SMP-08"))
    ];

    private static WorkOrder Work(string number, string itemCode, string lineCode, decimal quantity, decimal result, string status, string urgent, params (string Process, string Equipment)[] route)
    {
        var item = Items.Single(x => x.CD_ITEM == itemCode);
        var line = Lines.Single(x => x.CD_LINE == lineCode);
        var numberIndex = int.Parse(number[^4..]);
        var header = new WorkOrderHeader { CD_FIRM = Firm, NO_WO = number, DT_WO = FormatSampleDate(numberIndex + 2), CD_ITEM = item.CD_ITEM, NM_ITEM = item.NM_ITEM, STND_ITEM = item.STND_ITEM, UNIT_ITEM = item.UNIT_ITEM, QT_WO = quantity, QT_RESULT = result, DT_PLAN_START = FormatSampleDate(numberIndex + 3), DT_PLAN_END = FormatSampleDate(numberIndex + 5), CD_LINE = line.CD_LINE, NM_LINE = line.NM_LINE, ST_WO = status, YN_URGENT = urgent, DC_RMK = "Fictional Sample work order", CD_USER_REG = "SYSTEM", TM_REG = AuditTime, CD_USER_AMD = "SYSTEM", TM_AMD = AuditTime };
        var processRows = route.Select((step, index) =>
        {
            var process = Processes.Single(x => x.CD_PROC == step.Process);
            var machine = Equipment.Single(x => x.CD_EQUIP == step.Equipment);
            return new WorkOrderProcess { CD_FIRM = Firm, NO_WO = number, NO_PROC = (index + 1) * 10, CD_PROC = process.CD_PROC, NM_PROC = process.NM_PROC, CD_EQUIP = machine.CD_EQUIP, NM_EQUIP = machine.NM_EQUIP, QT_PLAN = quantity, QT_RESULT = index == 0 ? result : 0, TM_PLAN_START = FormatSampleDateTime(numberIndex + 3, 8 + index), TM_PLAN_END = FormatSampleDateTime(numberIndex + 3, 10 + index), ST_PROC = status == "Completed" ? "Completed" : index == 0 && status == "InProgress" ? "InProgress" : "Waiting", DC_RMK = "", CD_USER_REG = "SYSTEM", TM_REG = AuditTime, CD_USER_AMD = "SYSTEM", TM_AMD = AuditTime };
        }).ToArray();
        return new WorkOrder { Header = header, Processes = processRows };
    }

    internal static string FormatSampleDateTime(DateTime value) => value.ToString(SampleDateTimeFormat, CultureInfo.InvariantCulture);

    private static string FormatSampleDate(int day) => new DateTime(2026, 8, day).ToString(SampleDateFormat, CultureInfo.InvariantCulture);

    private static string FormatSampleDateTime(int day, int hour) => FormatSampleDateTime(new DateTime(2026, 8, day, hour, 0, 0, DateTimeKind.Unspecified));
}
