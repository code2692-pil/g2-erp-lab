using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryWorkOrderRepository : IWorkOrderRepository
{
    private readonly object _gate = new();
    private readonly List<WorkOrder> _workOrders =
    [
        Create("1000", "WO2026070001", "2026-07-01", "ITM-1001", "Controller A", "CTRL-A / 24V", "EA", 100, 0, "2026-07-03", "2026-07-04", "LINE-A", "Assembly Line A", "미확정", "N", 10, "PROC-010", "Material preparation", "EQ-A01", "Assembly station A1", 100, 0, "2026-07-03T08:00", "2026-07-03T10:00", "대기"),
        Create("1000", "WO2026070002", "2026-07-02", "ITM-1204", "Sensor Module B", "SENSOR-B / IP67", "EA", 240, 0, "2026-07-05", "2026-07-07", "LINE-B", "Assembly Line B", "확정", "N", 10, "PROC-010", "Material preparation", "EQ-B01", "Precision fastening", 240, 0, "2026-07-05T08:00", "2026-07-05T11:00", "대기", (20, "PROC-020", "Module assembly", "EQ-B01", "Precision fastening", "2026-07-05T13:00", "2026-07-06T16:00", 0), (30, "PROC-030", "Functional inspection", "EQ-B01", "Precision fastening", "2026-07-07T09:00", "2026-07-07T17:00", 0)),
        Create("1000", "WO2026070003", "2026-07-04", "ITM-1410", "Control Cable", "CABLE-10M", "EA", 80, 32, "2026-07-06", "2026-07-08", "LINE-A", "Assembly Line A", "진행", "N", 10, "PROC-020", "Module assembly", "EQ-A01", "Assembly station A1", 80, 40, "2026-07-06T08:00", "2026-07-07T12:00", "진행", (20, "PROC-030", "Functional inspection", "EQ-C01", "Functional tester", "2026-07-07T13:00", "2026-07-08T16:00", 24)),
        Create("1000", "WO2026070004", "2026-07-05", "ITM-2102", "Electrical Enclosure", "400x300x200", "EA", 50, 50, "2026-07-06", "2026-07-06", "LINE-C", "Quality Line C", "완료", "N", 10, "PROC-040", "Final inspection", "EQ-C02", "Gauge inspection", 50, 50, "2026-07-06T08:00", "2026-07-06T12:00", "완료"),
        Create("1000", "WO2026070005", "2026-07-07", "ITM-1001", "Controller A", "CTRL-A / 24V", "EA", 30, 0, "2026-07-07", "2026-07-08", "LINE-B", "Assembly Line B", "확정", "Y", 10, "PROC-020", "Module assembly", "EQ-B02", "Torque measuring device", 30, 0, "2026-07-07T08:00", "2026-07-07T14:00", "대기", (20, "PROC-030", "Functional inspection", "EQ-B01", "Precision fastening", "2026-07-08T08:00", "2026-07-08T11:00", 0)),
        Create("2000", "WO2026070006", "2026-07-09", "ITM-3100", "Packaging Set", "BOX-L / 10EA", "SET", 120, 90, "2026-07-10", "2026-07-11", "LINE-E", "Packaging Line E", "진행", "N", 10, "PROC-070", "Packaging", "EQ-E01", "Packaging machine", 120, 100, "2026-07-10T08:00", "2026-07-10T16:00", "완료", (20, "PROC-080", "Packing inspection", "EQ-E01", "Packaging machine", "2026-07-11T08:00", "2026-07-11T14:00", 90))
    ];

    public Task<IReadOnlyList<WorkOrder>> GetAllAsync(WorkOrderSearch search, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            var query = _workOrders.AsEnumerable();
            if (!string.IsNullOrWhiteSpace(search.CompanyCode)) query = query.Where(x => x.Header.CD_FIRM == search.CompanyCode);
            if (!string.IsNullOrWhiteSpace(search.DateFrom)) query = query.Where(x => x.Header.DT_WO.CompareTo(search.DateFrom) >= 0);
            if (!string.IsNullOrWhiteSpace(search.DateTo)) query = query.Where(x => x.Header.DT_WO.CompareTo(search.DateTo) <= 0);
            if (!string.IsNullOrWhiteSpace(search.WorkOrderNo)) query = query.Where(x => x.Header.NO_WO.Contains(search.WorkOrderNo, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(search.Item)) query = query.Where(x => ($"{x.Header.CD_ITEM} {x.Header.NM_ITEM}").Contains(search.Item, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(search.ProductionLine)) query = query.Where(x => ($"{x.Header.CD_LINE} {x.Header.NM_LINE}").Contains(search.ProductionLine, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(search.Status)) query = query.Where(x => x.Header.ST_WO == search.Status);
            if (!string.IsNullOrWhiteSpace(search.Urgent)) query = query.Where(x => x.Header.YN_URGENT == search.Urgent);
            return Task.FromResult<IReadOnlyList<WorkOrder>>(query.OrderByDescending(x => x.Header.DT_WO).ThenByDescending(x => x.Header.NO_WO).Select(Clone).ToArray());
        }
    }

    public Task<WorkOrder?> GetAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        lock (_gate) return Task.FromResult(_workOrders.Where(x => x.Header.CD_FIRM == companyCode && x.Header.NO_WO == workOrderNo).Select(Clone).SingleOrDefault());
    }

    public Task<bool> ExistsAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        lock (_gate) return Task.FromResult(_workOrders.Any(x => x.Header.CD_FIRM == companyCode && x.Header.NO_WO == workOrderNo));
    }

    public Task AddAsync(WorkOrder workOrder, CancellationToken cancellationToken)
    {
        lock (_gate) _workOrders.Add(Clone(workOrder));
        return Task.CompletedTask;
    }

    public Task UpdateAsync(WorkOrder workOrder, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            var index = _workOrders.FindIndex(x => x.Header.CD_FIRM == workOrder.Header.CD_FIRM && x.Header.NO_WO == workOrder.Header.NO_WO);
            if (index >= 0) _workOrders[index] = Clone(workOrder);
        }
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        lock (_gate) return Task.FromResult(_workOrders.RemoveAll(x => x.Header.CD_FIRM == companyCode && x.Header.NO_WO == workOrderNo) > 0);
    }

    private static WorkOrder Create(string firm, string number, string date, string itemCode, string itemName, string standard, string unit, decimal workQuantity, decimal resultQuantity, string planStart, string planEnd, string lineCode, string lineName, string status, string urgent, int firstNo, string firstProcessCode, string firstProcessName, string firstEquipmentCode, string firstEquipmentName, decimal firstPlanQuantity, decimal firstResultQuantity, string firstStart, string firstEnd, string firstStatus, params (int No, string ProcessCode, string ProcessName, string EquipmentCode, string EquipmentName, string Start, string End, decimal? ResultQuantity)[] remaining)
    {
        var processes = new List<WorkOrderProcess>
        {
            Process(firstNo, firstProcessCode, firstProcessName, firstEquipmentCode, firstEquipmentName, firstPlanQuantity, firstResultQuantity, firstStart, firstEnd, firstStatus)
        };
        processes.AddRange(remaining.Select(x => Process(x.No, x.ProcessCode, x.ProcessName, x.EquipmentCode, x.EquipmentName, workQuantity, x.ResultQuantity ?? 0, x.Start, x.End, firstStatus)));
        return new WorkOrder
        {
            Header = new WorkOrderHeader { CD_FIRM = firm, NO_WO = number, DT_WO = date, CD_ITEM = itemCode, NM_ITEM = itemName, STND_ITEM = standard, UNIT_ITEM = unit, QT_WO = workQuantity, QT_RESULT = resultQuantity, DT_PLAN_START = planStart, DT_PLAN_END = planEnd, CD_LINE = lineCode, NM_LINE = lineName, ST_WO = status, YN_URGENT = urgent, DC_RMK = "In-memory sample", CD_USER_REG = "SYSTEM", TM_REG = DateTime.UtcNow },
            Processes = processes
        };

        WorkOrderProcess Process(int no, string processCode, string processName, string equipmentCode, string equipmentName, decimal planQuantity, decimal processResultQuantity, string start, string end, string processStatus) => new()
        {
            CD_FIRM = firm, NO_WO = number, NO_PROC = no, CD_PROC = processCode, NM_PROC = processName, CD_EQUIP = equipmentCode, NM_EQUIP = equipmentName, QT_PLAN = planQuantity, QT_RESULT = processResultQuantity, TM_PLAN_START = start, TM_PLAN_END = end, ST_PROC = processStatus, DC_RMK = "", CD_USER_REG = "SYSTEM", TM_REG = DateTime.UtcNow
        };
    }

    private static WorkOrder Clone(WorkOrder workOrder) => new() { Header = workOrder.Header with { }, Processes = workOrder.Processes.Select(x => x with { }).ToArray() };
}
