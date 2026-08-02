using G2Erp.Api.Services;

namespace G2Erp.Api.Middleware;

public sealed class DemoAccessMiddleware(RequestDelegate next, IConfiguration configuration)
{
    public async Task InvokeAsync(HttpContext context, IDemoAccessService access)
    {
        var demoMode = configuration.GetValue<bool>("DemoMode");
        if (!demoMode && context.Request.Path.StartsWithSegments("/api/demo"))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(new { error = "Demo API is not enabled.", traceId = context.TraceIdentifier });
            return;
        }
        if (!demoMode || !context.Request.Path.StartsWithSegments("/api"))
        {
            await next(context);
            return;
        }

        if (context.Request.Path.StartsWithSegments("/api/demo/users") || context.Request.Path.StartsWithSegments("/api/demo/session"))
        {
            await next(context);
            return;
        }

        var session = access.ResolveSession(context.Request.Headers["X-Demo-Session"].FirstOrDefault());
        if (session is null)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Demo 사용자를 선택해 세션을 시작하세요.", traceId = context.TraceIdentifier });
            return;
        }

        context.Items["DemoSession"] = session;
        if (!access.CanAccess(session, context.Request.Method, context.Request.Path))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { error = "현재 Demo 역할에는 이 작업 권한이 없습니다.", traceId = context.TraceIdentifier });
            access.AppendAudit(session, context);
            return;
        }

        await next(context);
        if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method))
            access.AppendAudit(session, context);
    }
}
