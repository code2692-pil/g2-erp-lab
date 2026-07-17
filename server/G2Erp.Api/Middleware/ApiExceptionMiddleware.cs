using G2Erp.Api.Services;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Middleware;

public sealed class ApiExceptionMiddleware(RequestDelegate next)
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
        catch (KeyNotFoundException)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(new { error = "Resource not found.", traceId = context.TraceIdentifier });
        }
        catch (FeatureNotAvailableException exception)
        {
            context.Response.StatusCode = StatusCodes.Status501NotImplemented;
            await context.Response.WriteAsJsonAsync(new { error = exception.Message, traceId = context.TraceIdentifier });
        }
        catch (SqlException)
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { error = "A database operation failed. Contact support with the traceId.", traceId = context.TraceIdentifier });
        }
        catch (Exception)
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { error = "An unexpected operation failed. Contact support with the traceId.", traceId = context.TraceIdentifier });
        }
    }
}
