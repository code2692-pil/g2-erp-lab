using G2Erp.Api.Services;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Middleware;

public sealed class ApiExceptionMiddleware(RequestDelegate next, ILogger<ApiExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try { await next(context); }
        catch (DomainValidationException exception)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new { errors = exception.Errors, traceId = context.TraceIdentifier });
        }
        catch (DomainConflictException exception)
        {
            context.Response.StatusCode = StatusCodes.Status409Conflict;
            await context.Response.WriteAsJsonAsync(new { error = exception.Message, traceId = context.TraceIdentifier });
        }
        catch (DevelopmentDataAccessException exception)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { error = exception.Message, traceId = context.TraceIdentifier });
        }
        catch (KeyNotFoundException)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(new { error = "Resource not found.", traceId = context.TraceIdentifier });
        }
        catch (SqlException exception)
        {
            LogSafely(logger, exception, context, "Database operation failed.");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { error = "A database operation failed. Contact support with the traceId.", traceId = context.TraceIdentifier });
        }
        catch (Exception exception)
        {
            LogSafely(logger, exception, context, "Unexpected API operation failure.");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { error = "An unexpected operation failed. Contact support with the traceId.", traceId = context.TraceIdentifier });
        }
    }

    private static void LogSafely(ILogger logger, Exception exception, HttpContext context, string message)
    {
        try
        {
            logger.LogError(exception, "{Message} Operation: {Operation}; Company: {CompanyCode}; WorkOrder: {WorkOrderNo}; TraceId: {TraceId}; ExceptionType: {ExceptionType}", message, context.Request.Method, context.Request.RouteValues["companyCode"], context.Request.RouteValues["workOrderNo"], context.TraceIdentifier, exception.GetType().FullName);
        }
        catch
        {
            // A denied Windows Event Log sink must not replace the API's sanitized error response.
        }
    }
}
