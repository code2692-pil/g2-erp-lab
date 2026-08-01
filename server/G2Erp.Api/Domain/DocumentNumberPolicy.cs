using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Domain;

public static class DocumentNumberPolicy
{
    public const int MaximumMonthlySerial = 9_999;

    public static string BusinessYearMonth(string businessDate)
    {
        if (!DateOnly.TryParse(businessDate, out var date))
            throw new ArgumentException("The business date must be a valid date.", nameof(businessDate));
        return date.ToString("yyyyMM");
    }

    public static bool IsTemporarySalesOrder(string number) =>
        number.StartsWith("TEMP_SO_", StringComparison.OrdinalIgnoreCase);

    public static bool IsTemporaryPurchaseOrder(string number) =>
        number.StartsWith("TEMP_PO_", StringComparison.OrdinalIgnoreCase);

    public static bool IsTemporaryWorkOrder(string number) =>
        number.StartsWith("TEMP-WO-", StringComparison.OrdinalIgnoreCase);

    public static string Format(string prefix, string yearMonth, int serial)
    {
        if (serial is < 1 or > MaximumMonthlySerial)
            throw new DocumentNumberLimitException($"{prefix}{yearMonth} reached the monthly serial limit 9999.");
        return $"{prefix}{yearMonth}{serial:D4}";
    }

    public static int FindMaximum(string prefix, string yearMonth, IEnumerable<string> numbers)
    {
        var expectedPrefix = $"{prefix}{yearMonth}";
        return numbers
            .Where(number => number.Length == 13 && number.StartsWith(expectedPrefix, StringComparison.Ordinal))
            .Select(number => int.TryParse(number[expectedPrefix.Length..], out var serial) ? serial : 0)
            .DefaultIfEmpty(0)
            .Max();
    }

    public static SalesOrder Assign(SalesOrder order, string number) => new()
    {
        Header = order.Header with { NO_SO = number },
        Lines = order.Lines.Select(line => line with { NO_SO = number }).ToArray()
    };

    public static PurchaseOrder Assign(PurchaseOrder order, string number) => new()
    {
        Header = order.Header with { NO_PO = number },
        Lines = order.Lines.Select(line => line with { NO_PO = number }).ToArray()
    };

    public static WorkOrder Assign(WorkOrder order, string number) => new()
    {
        Header = order.Header with { NO_WO = number },
        Processes = order.Processes.Select(process => process with { NO_WO = number }).ToArray()
    };
}

public sealed class DocumentNumberLimitException(string message) : Exception(message);
