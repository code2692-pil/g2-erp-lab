using G2Erp.Api.Domain;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

internal static class DocumentNumberSqlAllocator
{
    public static async Task<int> ReserveAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string companyCode,
        string documentType,
        string yearMonth,
        CancellationToken cancellationToken)
    {
        const string selectSql = "SELECT LAST_SERIAL FROM POC.DOC_NO_COUNTER WITH (UPDLOCK,HOLDLOCK) WHERE CD_FIRM=@firm AND DOC_TYPE=@type AND YEAR_MONTH=@yearMonth";
        int? current;
        await using (var select = new SqlCommand(selectSql, connection, transaction))
        {
            AddParameters(select, companyCode, documentType, yearMonth);
            current = await select.ExecuteScalarAsync(cancellationToken) is int value ? value : null;
        }

        if (current >= DocumentNumberPolicy.MaximumMonthlySerial)
            throw new DocumentNumberLimitException($"{documentType}{yearMonth} reached the monthly serial limit 9999.");

        var next = (current ?? 0) + 1;
        var writeSql = current is null
            ? "INSERT INTO POC.DOC_NO_COUNTER(CD_FIRM,DOC_TYPE,YEAR_MONTH,LAST_SERIAL,TM_AMD) VALUES(@firm,@type,@yearMonth,@serial,SYSUTCDATETIME())"
            : "UPDATE POC.DOC_NO_COUNTER SET LAST_SERIAL=@serial,TM_AMD=SYSUTCDATETIME() WHERE CD_FIRM=@firm AND DOC_TYPE=@type AND YEAR_MONTH=@yearMonth";
        await using var write = new SqlCommand(writeSql, connection, transaction);
        AddParameters(write, companyCode, documentType, yearMonth);
        write.Parameters.AddWithValue("@serial", next);
        await write.ExecuteNonQueryAsync(cancellationToken);
        return next;
    }

    private static void AddParameters(SqlCommand command, string companyCode, string documentType, string yearMonth)
    {
        command.Parameters.AddWithValue("@firm", companyCode);
        command.Parameters.AddWithValue("@type", documentType);
        command.Parameters.AddWithValue("@yearMonth", yearMonth);
    }
}
