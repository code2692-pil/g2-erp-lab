using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using System.Xml.Linq;
using System.Xml;
using G2Erp.Api.Domain;

namespace G2Erp.Api.Services;

public sealed class DemoMeetingService : BackgroundService, IDemoMeetingService
{
    public const long MaximumFileBytes = 20 * 1024 * 1024;
    private const long MaximumArchiveEntryBytes = 10 * 1024 * 1024;
    private const long MaximumArchiveExpandedBytes = 40 * 1024 * 1024;
    private static readonly IReadOnlyDictionary<string, string[]> AllowedContentTypes = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        [".txt"] = ["text/plain"],
        [".md"] = ["text/markdown", "text/plain"],
        [".docx"] = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        [".xlsx"] = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        [".pptx"] = ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
    };

    private readonly object gate = new();
    private readonly string metadataPath;
    private readonly string uploadDirectory;
    private readonly Channel<(string MeetingId, string FileId)> jobs = Channel.CreateUnbounded<(string, string)>();
    private List<DemoMeeting> meetings;

    public DemoMeetingService(IHostEnvironment environment, IConfiguration configuration)
    {
        var root = configuration["DemoDataPath"] is { Length: > 0 } configured
            ? configured
            : Path.GetFullPath(Path.Combine(environment.ContentRootPath, "..", "..", ".local-runtime", "final-internal-demo"));
        metadataPath = Path.Combine(root, "meetings.json");
        uploadDirectory = Path.Combine(root, "meeting-uploads");
        meetings = Load() ?? [];
        SaveLocked();
        foreach (var pending in meetings.SelectMany(meeting => meeting.Files.Where(file => file.Status is "대기" or "추출 중").Select(file => (meeting.Id, file.Id))))
            jobs.Writer.TryWrite(pending);
    }

    public IReadOnlyList<DemoMeeting> List(DemoUser user)
    {
        lock (gate) return meetings.Where(meeting => !meeting.Deleted && (meeting.OwnerUserId == user.Id || IsManager(user))).OrderByDescending(meeting => meeting.UpdatedAt).ToArray();
    }

    public DemoMeeting Get(DemoUser user, string meetingId)
    {
        lock (gate)
        {
            var meeting = FindLocked(meetingId);
            RequireVisible(user, meeting);
            return meeting;
        }
    }

    public DemoMeeting Create(DemoUser user, CreateDemoMeeting request)
    {
        RequireMutation(user);
        if (string.IsNullOrWhiteSpace(request.Title)) throw new DomainValidationException(["회의명을 입력하세요."]);
        lock (gate)
        {
            var now = DateTime.UtcNow;
            var meeting = new DemoMeeting($"MEET-{Guid.NewGuid():N}", request.Title.Trim(), user.Id, "초안", [], [], now, now, 1, false);
            meetings.Insert(0, meeting);
            SaveLocked();
            return meeting;
        }
    }

    public async Task<DemoMeeting> UploadAsync(DemoUser user, string meetingId, IFormFile file, int expectedVersion, CancellationToken cancellationToken)
    {
        RequireMutation(user);
        ValidateFile(file);
        DemoMeeting meeting;
        lock (gate)
        {
            meeting = FindLocked(meetingId);
            RequireOwnerOrManager(user, meeting);
            RequireVersion(meeting, expectedVersion);
        }

        Directory.CreateDirectory(uploadDirectory);
        var storageName = $"{Guid.NewGuid():N}.upload";
        var storagePath = Path.Combine(uploadDirectory, storageName);
        string hash;
        try
        {
            await using var target = new FileStream(storagePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous);
            await file.CopyToAsync(target, cancellationToken);
        }
        catch
        {
            if (File.Exists(storagePath)) File.Delete(storagePath);
            throw;
        }
        try
        {
            await using var content = File.OpenRead(storagePath);
            hash = Convert.ToHexString(await SHA256.HashDataAsync(content, cancellationToken));
        }
        catch
        {
            if (File.Exists(storagePath)) File.Delete(storagePath);
            throw;
        }

        DemoMeeting updated;
        lock (gate)
        {
            try { meeting = FindLocked(meetingId); RequireVersion(meeting, expectedVersion); }
            catch { File.Delete(storagePath); throw; }
            if (meeting.Files.Any(item => item.Sha256 == hash))
            {
                File.Delete(storagePath);
                throw new DomainConflictException("동일한 파일이 이미 이 회의에 등록되어 있습니다.");
            }
            var uploaded = new DemoMeetingFile($"FILE-{Guid.NewGuid():N}", Path.GetFileName(file.FileName), file.ContentType, file.Length, hash, storageName, "대기", null, DateTime.UtcNow, []);
            updated = meeting with { Files = [.. meeting.Files, uploaded], Status = "추출 중", UpdatedAt = DateTime.UtcNow, Version = meeting.Version + 1 };
            ReplaceLocked(updated);
            SaveLocked();
            jobs.Writer.TryWrite((meetingId, uploaded.Id));
        }
        return updated;
    }

    public DemoMeeting Approve(DemoUser user, string meetingId, DemoMeetingVersionRequest request)
    {
        RequireManager(user);
        lock (gate)
        {
            var meeting = FindLocked(meetingId);
            RequireVersion(meeting, request.ExpectedVersion);
            if (meeting.Files.Count == 0 || meeting.Files.Any(file => file.Status != "완료"))
                throw new DomainValidationException(["모든 파일 추출이 완료되어야 회의록을 승인할 수 있습니다."]);
            var updated = meeting with { Status = "승인", UpdatedAt = DateTime.UtcNow, Version = meeting.Version + 1 };
            ReplaceLocked(updated); SaveLocked(); return updated;
        }
    }

    public DemoMeeting Ask(DemoUser user, string meetingId, AskDemoMeetingQuestion request)
    {
        RequireMutation(user);
        if (string.IsNullOrWhiteSpace(request.Question)) throw new DomainValidationException(["회의 질문을 입력하세요."]);
        lock (gate)
        {
            var meeting = FindLocked(meetingId); RequireOwnerOrManager(user, meeting); RequireVersion(meeting, request.ExpectedVersion);
            var segments = meeting.Files.SelectMany(file => file.Segments).ToArray();
            if (segments.Length == 0) throw new DomainValidationException(["인용할 원문 구간이 없습니다."]);
            var terms = request.Question.ToLowerInvariant().Split([' ', '?', '.', ',', '/', ':'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Where(term => term.Length >= 2).ToArray();
            var source = segments.FirstOrDefault(segment => terms.Any(term => segment.Text.Contains(term, StringComparison.OrdinalIgnoreCase))) ?? segments[0];
            var question = new DemoMeetingQuestion($"MQ-{Guid.NewGuid():N}", request.Question.Trim(), $"회의 원문에서 확인된 내용: {source.Text}", source.Id, user.Id, DateTime.UtcNow);
            var updated = meeting with { Questions = [.. meeting.Questions, question], UpdatedAt = DateTime.UtcNow, Version = meeting.Version + 1 };
            ReplaceLocked(updated); SaveLocked(); return updated;
        }
    }

    public DemoMeeting Retry(DemoUser user, string meetingId, string fileId, DemoMeetingVersionRequest request)
    {
        if (user.Role != DemoRole.Admin) throw new DevelopmentDataAccessException("시스템 관리자만 실패 작업을 재처리할 수 있습니다.");
        lock (gate)
        {
            var meeting = FindLocked(meetingId); RequireVersion(meeting, request.ExpectedVersion);
            if (!meeting.Files.Any(file => file.Id == fileId && file.Status == "실패")) throw new DomainValidationException(["재처리할 실패 파일을 찾을 수 없습니다."]);
            var updated = meeting with { Files = meeting.Files.Select(file => file.Id == fileId ? file with { Status = "대기", Error = null } : file).ToArray(), Status = "추출 중", UpdatedAt = DateTime.UtcNow, Version = meeting.Version + 1 };
            ReplaceLocked(updated); SaveLocked(); jobs.Writer.TryWrite((meetingId, fileId)); return updated;
        }
    }

    public (string Path, DemoMeetingFile File) Download(DemoUser user, string meetingId, string fileId)
    {
        lock (gate)
        {
            var meeting = FindLocked(meetingId); RequireVisible(user, meeting);
            var file = meeting.Files.SingleOrDefault(candidate => candidate.Id == fileId) ?? throw new KeyNotFoundException();
            return (Path.Combine(uploadDirectory, file.StorageName), file);
        }
    }

    public void Reset()
    {
        lock (gate)
        {
            foreach (var file in meetings.SelectMany(meeting => meeting.Files))
            {
                var path = Path.Combine(uploadDirectory, file.StorageName);
                if (File.Exists(path)) File.Delete(path);
            }
            meetings = [];
            SaveLocked();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in jobs.Reader.ReadAllAsync(stoppingToken))
        {
            try { Process(job.MeetingId, job.FileId); }
            catch (Exception exception) { MarkFailed(job.MeetingId, job.FileId, exception.Message); }
        }
    }

    private void Process(string meetingId, string fileId)
    {
        lock (gate)
        {
            var meeting = FindLocked(meetingId);
            var file = meeting.Files.Single(candidate => candidate.Id == fileId);
            var path = Path.Combine(uploadDirectory, file.StorageName);
            var extension = Path.GetExtension(file.OriginalName).ToLowerInvariant();
            var segments = extension switch
            {
                ".txt" or ".md" => ExtractText(file, path),
                ".docx" => ExtractDocx(file, path),
                ".xlsx" => ExtractXlsx(file, path),
                ".pptx" => ExtractPptx(file, path),
                _ => throw new InvalidOperationException("지원하지 않는 파일 형식입니다.")
            };
            if (segments.Count == 0) throw new InvalidOperationException("추출된 원문 구간이 없습니다.");
            var updatedFiles = meeting.Files.Select(item => item.Id == fileId ? item with { Status = "완료", Error = null, Segments = segments } : item).ToArray();
            var status = updatedFiles.All(item => item.Status == "완료") ? "검토 대기" : updatedFiles.Any(item => item.Status == "실패") ? "일부 실패" : "추출 중";
            ReplaceLocked(meeting with { Files = updatedFiles, Status = status, UpdatedAt = DateTime.UtcNow, Version = meeting.Version + 1 });
            SaveLocked();
        }
    }

    private void MarkFailed(string meetingId, string fileId, string error)
    {
        lock (gate)
        {
            var meeting = FindLocked(meetingId);
            var files = meeting.Files.Select(item => item.Id == fileId ? item with { Status = "실패", Error = error, Segments = [] } : item).ToArray();
            ReplaceLocked(meeting with { Files = files, Status = "일부 실패", UpdatedAt = DateTime.UtcNow, Version = meeting.Version + 1 });
            SaveLocked();
        }
    }

    private static IReadOnlyList<DemoMeetingSegment> ExtractText(DemoMeetingFile file, string path) =>
        File.ReadAllLines(path, Encoding.UTF8).Select((text, index) => Segment(file, $"줄 {index + 1}", text)).Where(segment => segment.Text.Length > 0).ToArray();

    private static IReadOnlyList<DemoMeetingSegment> ExtractDocx(DemoMeetingFile file, string path)
    {
        using var archive = ZipFile.OpenRead(path);
        EnsureSafeArchive(archive);
        var document = ReadXml(archive, "word/document.xml");
        return document.Descendants().Where(node => node.Name.LocalName == "p").Select((paragraph, index) => Segment(file, $"DOCX 문단 {index + 1}", string.Concat(paragraph.Descendants().Where(node => node.Name.LocalName == "t").Select(node => node.Value)))).Where(segment => segment.Text.Length > 0).ToArray();
    }

    private static IReadOnlyList<DemoMeetingSegment> ExtractXlsx(DemoMeetingFile file, string path)
    {
        using var archive = ZipFile.OpenRead(path);
        EnsureSafeArchive(archive);
        var sharedEntry = archive.GetEntry("xl/sharedStrings.xml");
        var shared = sharedEntry is null ? [] : ReadXml(sharedEntry).Descendants().Where(node => node.Name.LocalName == "si").Select(item => string.Concat(item.Descendants().Where(node => node.Name.LocalName == "t").Select(node => node.Value))).ToArray();
        var result = new List<DemoMeetingSegment>();
        foreach (var entry in archive.Entries.Where(entry => entry.FullName.StartsWith("xl/worksheets/sheet", StringComparison.Ordinal) && entry.FullName.EndsWith(".xml", StringComparison.Ordinal)).OrderBy(entry => entry.FullName, StringComparer.Ordinal))
        {
            var sheetName = Path.GetFileNameWithoutExtension(entry.Name).Replace("sheet", "Sheet", StringComparison.OrdinalIgnoreCase);
            foreach (var cell in ReadXml(entry).Descendants().Where(node => node.Name.LocalName == "c"))
            {
                var value = cell.Descendants().FirstOrDefault(node => node.Name.LocalName == "v")?.Value ?? string.Empty;
                if (cell.Attribute("t")?.Value == "s" && int.TryParse(value, out var index) && index >= 0 && index < shared.Length) value = shared[index];
                var reference = cell.Attribute("r")?.Value ?? "?";
                if (value.Trim().Length > 0) result.Add(Segment(file, $"XLSX {sheetName}!{reference}", value));
            }
        }
        return result;
    }

    private static IReadOnlyList<DemoMeetingSegment> ExtractPptx(DemoMeetingFile file, string path)
    {
        using var archive = ZipFile.OpenRead(path);
        EnsureSafeArchive(archive);
        var result = new List<DemoMeetingSegment>();
        foreach (var entry in archive.Entries.Where(entry => entry.FullName.StartsWith("ppt/slides/slide", StringComparison.Ordinal) && entry.FullName.EndsWith(".xml", StringComparison.Ordinal)).OrderBy(entry => entry.FullName, StringComparer.Ordinal))
        {
            var slide = Path.GetFileNameWithoutExtension(entry.Name).Replace("slide", string.Empty, StringComparison.OrdinalIgnoreCase);
            var text = ReadXml(entry).Descendants().Where(node => node.Name.LocalName == "t").Select(node => node.Value.Trim()).Where(value => value.Length > 0).ToArray();
            for (var index = 0; index < text.Length; index++) result.Add(Segment(file, $"PPTX 슬라이드 {slide} 문단 {index + 1}", text[index]));
        }
        return result;
    }

    private static DemoMeetingSegment Segment(DemoMeetingFile file, string locator, string text) => new($"SEG-{Guid.NewGuid():N}", file.Id, file.OriginalName, locator, text.Trim());
    private static XDocument ReadXml(ZipArchive archive, string name) => ReadXml(archive.GetEntry(name) ?? throw new InvalidOperationException($"필수 문서 항목이 없습니다: {name}"));
    private static XDocument ReadXml(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var reader = XmlReader.Create(stream, new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = MaximumArchiveEntryBytes
        });
        return XDocument.Load(reader, LoadOptions.None);
    }

    private static void EnsureSafeArchive(ZipArchive archive)
    {
        long total = 0;
        foreach (var entry in archive.Entries)
        {
            if (entry.Length > MaximumArchiveEntryBytes) throw new InvalidOperationException("압축 문서의 개별 항목이 안전 제한을 초과했습니다.");
            total = checked(total + entry.Length);
            if (total > MaximumArchiveExpandedBytes) throw new InvalidOperationException("압축 문서의 해제 크기가 안전 제한을 초과했습니다.");
            if (entry.Length > 1024 * 1024 && entry.CompressedLength > 0 && entry.Length / entry.CompressedLength > 100)
                throw new InvalidOperationException("비정상적으로 높은 압축률을 감지했습니다.");
        }
    }

    private static void ValidateFile(IFormFile file)
    {
        if (file.Length <= 0 || file.Length > MaximumFileBytes) throw new DomainValidationException(["파일은 1바이트 이상 20MB 이하여야 합니다."]);
        if (Path.GetFileName(file.FileName) != file.FileName || file.FileName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            throw new DomainValidationException(["안전한 파일명을 사용하세요."]);
        var extension = Path.GetExtension(file.FileName);
        if (!AllowedContentTypes.TryGetValue(extension, out var types) || !types.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase))
            throw new DomainValidationException(["확장자와 콘텐츠 형식을 확인하세요. 지원 형식은 TXT, MD, DOCX, XLSX, PPTX입니다."]);
        using var stream = file.OpenReadStream();
        Span<byte> signature = stackalloc byte[4];
        var count = stream.Read(signature);
        var office = extension.Equals(".docx", StringComparison.OrdinalIgnoreCase) || extension.Equals(".xlsx", StringComparison.OrdinalIgnoreCase) || extension.Equals(".pptx", StringComparison.OrdinalIgnoreCase);
        if (office && (count < 4 || signature[0] != (byte)'P' || signature[1] != (byte)'K')) throw new DomainValidationException(["Office 파일의 실제 형식이 확장자와 일치하지 않습니다."]);
        if (!office && signature[..count].Contains((byte)0)) throw new DomainValidationException(["텍스트 파일에서 이진 콘텐츠를 감지했습니다."]);
    }

    private DemoMeeting FindLocked(string id) => meetings.SingleOrDefault(meeting => meeting.Id == id && !meeting.Deleted) ?? throw new KeyNotFoundException();
    private void ReplaceLocked(DemoMeeting meeting) => meetings[meetings.FindIndex(item => item.Id == meeting.Id)] = meeting;
    private static void RequireVersion(DemoMeeting meeting, int version) { if (meeting.Version != version) throw new DomainConflictException("다른 사용자가 먼저 회의를 변경했습니다. 새로고침 후 다시 시도하세요."); }
    private static bool IsManager(DemoUser user) => user.Role is DemoRole.Manager or DemoRole.Admin;
    private static void RequireManager(DemoUser user) { if (!IsManager(user)) throw new DevelopmentDataAccessException("관리자만 회의록을 승인할 수 있습니다."); }
    private static void RequireMutation(DemoUser user) { if (user.Role == DemoRole.Viewer) throw new DevelopmentDataAccessException("조회 사용자는 회의록을 변경할 수 없습니다."); }
    private static void RequireVisible(DemoUser user, DemoMeeting meeting) { if (meeting.OwnerUserId != user.Id && !IsManager(user)) throw new KeyNotFoundException(); }
    private static void RequireOwnerOrManager(DemoUser user, DemoMeeting meeting) { if (meeting.OwnerUserId != user.Id && !IsManager(user)) throw new DevelopmentDataAccessException("회의 작성자와 관리자만 파일을 변경할 수 있습니다."); }

    private List<DemoMeeting>? Load()
    {
        if (!File.Exists(metadataPath)) return null;
        try
        {
            var loaded = JsonSerializer.Deserialize<List<DemoMeeting>>(File.ReadAllText(metadataPath)) ?? throw new InvalidOperationException("회의록 저장소가 비어 있습니다.");
            return loaded.Select(meeting => meeting with { Questions = meeting.Questions ?? [] }).ToList();
        }
        catch (Exception exception) { throw new InvalidOperationException("회의록 저장소를 읽지 못했습니다. 자동 초기화하지 않고 시작을 차단합니다.", exception); }
    }
    private void SaveLocked() { Directory.CreateDirectory(Path.GetDirectoryName(metadataPath)!); var temp = $"{metadataPath}.{Guid.NewGuid():N}.tmp"; File.WriteAllText(temp, JsonSerializer.Serialize(meetings, new JsonSerializerOptions { WriteIndented = true })); File.Move(temp, metadataPath, true); }
}
