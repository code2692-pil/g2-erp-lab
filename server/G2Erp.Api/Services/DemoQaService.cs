using System.Text.Json;
using G2Erp.Api.Domain;

namespace G2Erp.Api.Services;

public sealed class DemoQaService : IDemoQaService
{
    private readonly object gate = new();
    private readonly string storagePath;
    private List<DemoQaQuestion> questions;

    public DemoQaService(IHostEnvironment environment, IConfiguration configuration)
    {
        storagePath = configuration["DemoDataPath"] is { Length: > 0 } configured
            ? Path.Combine(configured, "business-qa.json")
            : Path.GetFullPath(Path.Combine(environment.ContentRootPath, "..", "..", ".local-runtime", "final-internal-demo", "business-qa.json"));
        questions = Load() ?? Seed();
        SaveLocked();
    }

    public IReadOnlyList<DemoQaQuestion> Search(DemoUser user, string? query, bool unansweredOnly)
    {
        lock (gate)
        {
            var keyword = query?.Trim() ?? string.Empty;
            return questions
                .Where(question => !question.Deleted)
                .Where(question => question.Visibility == "전체" || question.AuthorUserId == user.Id || IsManager(user))
                .Where(question => !unansweredOnly || question.Answers.All(answer => answer.Deleted))
                .Where(question => keyword.Length == 0 || SearchText(question).Contains(keyword, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(question => question.UpdatedAt)
                .ToArray();
        }
    }

    public DemoQaQuestion Create(DemoUser user, CreateDemoQaQuestion request)
    {
        RequireMutation(user);
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Body))
            throw new DomainValidationException(["제목과 질문 내용을 입력하세요."]);
        if (request.Visibility is not ("전체" or "담당자 전용"))
            throw new DomainValidationException(["공개 범위를 확인하세요."]);

        lock (gate)
        {
            var now = DateTime.UtcNow;
            var question = new DemoQaQuestion(
                $"QA-{Guid.NewGuid():N}",
                request.Title.Trim(),
                request.Body.Trim(),
                request.Category.Trim(),
                (request.Tags ?? []).Select(tag => tag.Trim()).Where(tag => tag.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(20).ToArray(),
                request.Visibility,
                user.Id,
                user.Name,
                request.RelatedRecordType?.Trim() ?? string.Empty,
                request.RelatedInternalId?.Trim() ?? string.Empty,
                request.DisplayDocumentNumber?.Trim() ?? string.Empty,
                "미답변",
                [],
                null,
                false,
                now,
                now,
                1,
                false);
            questions.Insert(0, question);
            SaveLocked();
            return question;
        }
    }

    public DemoQaQuestion AddAnswer(DemoUser user, string questionId, AddDemoQaAnswer request)
    {
        RequireMutation(user);
        if (string.IsNullOrWhiteSpace(request.Body)) throw new DomainValidationException(["답변 내용을 입력하세요."]);
        return Update(questionId, request.ExpectedVersion, question => question with
        {
            Answers = [.. question.Answers, new DemoQaAnswer($"ANS-{Guid.NewGuid():N}", request.Body.Trim(), user.Id, user.Name, DateTime.UtcNow, 1, false)],
            Status = "답변됨"
        });
    }

    public DemoQaQuestion AcceptAnswer(DemoUser user, string questionId, AcceptDemoQaAnswer request)
    {
        RequireManager(user);
        return Update(questionId, request.ExpectedVersion, question =>
        {
            if (!question.Answers.Any(answer => !answer.Deleted && answer.Id == request.AnswerId))
                throw new DomainValidationException(["채택할 답변을 찾을 수 없습니다."]);
            return question with { AcceptedAnswerId = request.AnswerId, Status = "해결" };
        });
    }

    public DemoQaQuestion Reopen(DemoUser user, string questionId, DemoQaVersionRequest request)
    {
        RequireManager(user);
        return Update(questionId, request.ExpectedVersion, question => question with
        {
            AcceptedAnswerId = null,
            KnowledgeApproved = false,
            Status = "재오픈"
        });
    }

    public DemoQaQuestion SetKnowledgeApproval(DemoUser user, string questionId, SetDemoQaKnowledgeRequest request)
    {
        RequireManager(user);
        return Update(questionId, request.ExpectedVersion, question =>
        {
            if (request.Approved && question.AcceptedAnswerId is null)
                throw new DomainValidationException(["채택 답변이 있어야 지식 후보를 승인할 수 있습니다."]);
            return question with { KnowledgeApproved = request.Approved };
        });
    }

    public void Reset()
    {
        lock (gate)
        {
            questions = Seed();
            SaveLocked();
        }
    }

    private DemoQaQuestion Update(string id, int expectedVersion, Func<DemoQaQuestion, DemoQaQuestion> change)
    {
        lock (gate)
        {
            var index = questions.FindIndex(question => question.Id == id && !question.Deleted);
            if (index < 0) throw new KeyNotFoundException();
            var current = questions[index];
            if (current.Version != expectedVersion)
                throw new DomainConflictException("다른 사용자가 먼저 질문을 변경했습니다. 새로고침 후 다시 시도하세요.");
            var updated = change(current) with { Version = current.Version + 1, UpdatedAt = DateTime.UtcNow };
            questions[index] = updated;
            SaveLocked();
            return updated;
        }
    }

    private List<DemoQaQuestion>? Load()
    {
        if (!File.Exists(storagePath)) return null;
        try { return JsonSerializer.Deserialize<List<DemoQaQuestion>>(File.ReadAllText(storagePath)) ?? throw new InvalidOperationException("업무 Q&A 저장소가 비어 있습니다."); }
        catch (Exception exception) { throw new InvalidOperationException("업무 Q&A 저장소를 읽지 못했습니다. 자동 초기화하지 않고 시작을 차단합니다.", exception); }
    }

    private void SaveLocked()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(storagePath)!);
        var temporary = $"{storagePath}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(questions, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, storagePath, true);
    }

    private static List<DemoQaQuestion> Seed()
    {
        var now = DateTime.UtcNow;
        return
        [
            new DemoQaQuestion(
                "FINAL-UAT-202608-QA-01",
                "부분 발주 후 발주 가능 잔량은 어떻게 계산하나요?",
                "취소되지 않은 발주수량 합계를 원본 수주수량에서 차감하는 기준을 확인하고 싶습니다.",
                "구매",
                ["수주", "발주", "잔량"],
                "전체",
                "demo-manager",
                "Demo Manager",
                "SalesOrderLine",
                "FINAL-UAT-202608-SO-01-L1",
                "SOR2026080001/1",
                "미답변",
                [],
                null,
                false,
                now,
                now,
                1,
                false)
        ];
    }

    private static string SearchText(DemoQaQuestion question) => string.Join(' ',
        question.Title, question.Body, question.Category, question.DisplayDocumentNumber, question.RelatedInternalId, string.Join(' ', question.Tags));

    private static bool IsManager(DemoUser user) => user.Role is DemoRole.Manager or DemoRole.Admin;
    private static void RequireMutation(DemoUser user)
    {
        if (user.Role == DemoRole.Viewer) throw new DevelopmentDataAccessException("Demo Viewer는 질문과 답변을 변경할 수 없습니다.");
    }
    private static void RequireManager(DemoUser user)
    {
        if (!IsManager(user)) throw new DevelopmentDataAccessException("Demo Manager 이상만 이 작업을 수행할 수 있습니다.");
    }
}
