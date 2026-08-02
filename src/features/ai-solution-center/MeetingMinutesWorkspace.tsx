import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "../../api/apiClient";
import { demoEnvironment } from "../../api/demoApi";
import { demoMeetingApi, type DemoMeetingDto } from "../../api/demoMeetingApi";
import { useDemoRole } from "../../components/DemoEnvironmentGate";
import { RangeValidationDialog } from "../../components/common/validation/RangeValidationDialog";
import { validateDateRange } from "../../components/common/validation/rangeValidation";
import { createClientId } from "../../utils/clientId";
import { extractMeetingDocument, maximumMeetingFileBytes, meetingFileAccept, type MeetingSourceSegment } from "./meetingDocumentExtractor";

interface MeetingFileState {
  name: string;
  size: number;
  status: "대기" | "추출 중" | "완료" | "실패";
  segmentCount: number;
  error?: string;
}

interface MeetingQuestion {
  id: string;
  question: string;
  answer: string;
  sourceSegmentId: string;
}

function id() {
  return createClientId("meeting");
}

const today = new Date().toISOString().slice(0, 10);

function keywords(value: string) {
  return value.toLocaleLowerCase().split(/[^0-9a-zA-Z가-힣]+/).filter((word) => word.length >= 2);
}

export function MeetingMinutesWorkspace() {
  const shared = demoEnvironment === "shared";
  const demoRole = useDemoRole();
  const [title, setTitle] = useState("주간 생산회의");
  const [meetingDate, setMeetingDate] = useState(today);
  const [meetingDateFrom, setMeetingDateFrom] = useState("");
  const [meetingDateTo, setMeetingDateTo] = useState("");
  const [appliedMeetingDates, setAppliedMeetingDates] = useState({ from: "", to: "" });
  const [meetings, setMeetings] = useState<DemoMeetingDto[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [rangeDialogOpen, setRangeDialogOpen] = useState(false);
  const invalidDateInputRef = useRef<HTMLInputElement | null>(null);
  const [meetingCreated, setMeetingCreated] = useState(false);
  const [files, setFiles] = useState<MeetingFileState[]>([]);
  const [segments, setSegments] = useState<MeetingSourceSegment[]>([]);
  const [status, setStatus] = useState<"초안" | "추출 중" | "검토 대기" | "승인" | "실패">("초안");
  const [error, setError] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState<MeetingQuestion[]>([]);
  const [meetingId, setMeetingId] = useState("");
  const [meetingVersion, setMeetingVersion] = useState(0);
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const selectedFilesRef = useRef<File[]>([]);
  const segmentRefs = useRef(new Map<string, HTMLTableRowElement>());

  const decisions = useMemo(() => {
    const matched = segments.filter((segment) => /결정|합의|확정|승인/.test(segment.text));
    return (matched.length > 0 ? matched : segments.slice(0, 2)).slice(0, 8);
  }, [segments]);
  const tasks = useMemo(() => {
    const matched = segments.filter((segment) => /할 일|조치|담당|기한|TODO|까지/.test(segment.text));
    return matched.slice(0, 10);
  }, [segments]);
  const summary = useMemo(() => segments.slice(0, 6), [segments]);
  const visibleMeetings = useMemo(() => meetings.filter((meeting) => {
    const date = meeting.MeetingDate || meeting.CreatedAt.slice(0, 10);
    return (!appliedMeetingDates.from || date >= appliedMeetingDates.from) && (!appliedMeetingDates.to || date <= appliedMeetingDates.to);
  }), [appliedMeetingDates, meetings]);

  const selectFiles = (nextFiles: File[]) => {
    const existing = new Set(selectedFilesRef.current.map((file) => `${file.name}::${file.size}::${file.lastModified}`));
    const uniqueFiles = nextFiles.filter((file) => !existing.has(`${file.name}::${file.size}::${file.lastModified}`));
    selectedFilesRef.current = [...selectedFilesRef.current, ...uniqueFiles];
    setFiles((current) => [...current, ...uniqueFiles.map((file) => ({ name: file.name, size: file.size, status: "대기" as const, segmentCount: 0 }))]);
    setSegments([]);
    setStatus("초안");
    setError("");
  };

  const loadMeetings = async (dates = appliedMeetingDates, selectFirst = false) => {
    if (!shared) return;
    setLoadingMeetings(true);
    try {
      const nextMeetings = await demoMeetingApi.list();
      setMeetings(nextMeetings);
      const nextVisible = nextMeetings.filter((meeting) => {
        const date = meeting.MeetingDate || meeting.CreatedAt.slice(0, 10);
        return (!dates.from || date >= dates.from) && (!dates.to || date <= dates.to);
      });
      if ((selectFirst || !meetingId) && nextVisible[0]) selectMeeting(nextVisible[0]);
      setError("");
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setLoadingMeetings(false);
    }
  };

  const searchMeetings = () => {
    if (!validateDateRange(meetingDateFrom, meetingDateTo).valid) {
      setRangeDialogOpen(true);
      return;
    }
    const dates = { from: meetingDateFrom, to: meetingDateTo };
    setAppliedMeetingDates(dates);
    void loadMeetings(dates, true);
  };

  const selectMeeting = (meeting: DemoMeetingDto, expand = false) => {
    setMeetingId(meeting.Id);
    setMeetingCreated(true);
    setTitle(meeting.Title);
    setMeetingDate(meeting.MeetingDate || meeting.CreatedAt.slice(0, 10));
    selectedFilesRef.current = [];
    applyServerMeeting(meeting);
    if (expand) setEditorExpanded(true);
  };

  const processFiles = async () => {
    if (!meetingCreated) { setError("회의를 먼저 생성하세요."); return; }
    if (selectedFilesRef.current.length === 0) { setError("추출할 파일을 등록하세요."); return; }
    setStatus("추출 중");
    setError("");
    if (shared) {
      if (!meetingId) { setError("회의를 다시 생성하세요."); setStatus("실패"); return; }
      try {
        let latest = await demoMeetingApi.get(meetingId);
        for (const file of selectedFilesRef.current) {
          latest = await demoMeetingApi.upload(meetingId, file, latest.Version);
          setFilesFromServer(latest);
        }
        latest = await waitForServerExtraction(meetingId);
        applyServerMeeting(latest);
        if (latest.Status === "일부 실패") setError("일부 파일을 추출하지 못했습니다. 실패 파일과 오류를 확인하세요.");
      } catch (caught) {
        setStatus("실패");
        setError(apiMessage(caught));
      }
      return;
    }
    const collected: MeetingSourceSegment[] = [];
    let failed = false;
    for (const file of selectedFilesRef.current) {
      setFiles((current) => current.map((item) => item.name === file.name ? { ...item, status: "추출 중", error: undefined } : item));
      try {
        const extracted = await extractMeetingDocument(file);
        if (extracted.length === 0) throw new Error("추출된 원문 구간이 없습니다.");
        collected.push(...extracted);
        setFiles((current) => current.map((item) => item.name === file.name ? { ...item, status: "완료", segmentCount: extracted.length } : item));
      } catch (caught) {
        failed = true;
        const message = caught instanceof Error ? caught.message : "문서 추출에 실패했습니다.";
        setFiles((current) => current.map((item) => item.name === file.name ? { ...item, status: "실패", segmentCount: 0, error: message } : item));
      }
    }
    setSegments(collected);
    setSelectedSegmentId(collected[0]?.id ?? "");
    setStatus(collected.length > 0 ? "검토 대기" : "실패");
    if (failed) setError("일부 파일을 추출하지 못했습니다. 실패 파일을 확인한 뒤 재처리할 수 있습니다.");
  };

  const goToEvidence = (segmentId: string) => {
    setSelectedSegmentId(segmentId);
    segmentRefs.current.get(segmentId)?.scrollIntoView({ block: "center" });
    segmentRefs.current.get(segmentId)?.focus();
  };

  const ask = async () => {
    if (!question.trim()) { setError("회의 질문을 입력하세요."); return; }
    if (segments.length === 0) { setError("인용할 원문 구간이 없습니다."); return; }
    if (shared) {
      try { applyServerMeeting(await demoMeetingApi.ask(meetingId, question.trim(), meetingVersion)); setQuestion(""); setError(""); }
      catch (caught) { setError(apiMessage(caught)); }
      return;
    }
    const terms = keywords(question);
    const source = segments.find((segment) => terms.some((term) => segment.text.toLocaleLowerCase().includes(term))) ?? segments[0];
    setQuestions((current) => [...current, { id: id(), question: question.trim(), answer: `회의 원문에서 확인된 내용: ${source.text}`, sourceSegmentId: source.id }]);
    setQuestion("");
    setError("");
  };

  const createMeeting = async () => {
    if (!title.trim()) { setError("회의명을 입력하세요."); return; }
    if (!shared) { setMeetingCreated(true); setError(""); return; }
    setCreatingMeeting(true);
    try {
      const created = await demoMeetingApi.create(title.trim(), meetingDate);
      setMeetingId(created.Id); setMeetingVersion(created.Version); setMeetingCreated(true); setError("");
      applyServerMeeting(created);
      setMeetings((current) => [created, ...current.filter((meeting) => meeting.Id !== created.Id)]);
    } catch (caught) { setError(apiMessage(caught)); }
    finally { setCreatingMeeting(false); }
  };

  const approveMeeting = async () => {
    if (!shared) { setStatus("승인"); return; }
    try { applyServerMeeting(await demoMeetingApi.approve(meetingId, meetingVersion)); }
    catch (caught) { setError(apiMessage(caught)); }
  };

  function setFilesFromServer(meeting: DemoMeetingDto) {
    setFiles(meeting.Files.map((file) => ({ name: file.OriginalName, size: file.Size, status: file.Status, segmentCount: file.Segments.length, error: file.Error })));
  }

  function applyServerMeeting(meeting: DemoMeetingDto) {
    const sourceSegments: MeetingSourceSegment[] = meeting.Files.flatMap((file) => file.Segments.map((segment) => ({ id: segment.Id, fileName: segment.FileName, locator: segment.Locator, text: segment.Text })));
    setMeetingVersion(meeting.Version);
    setMeetingId(meeting.Id);
    setMeetingCreated(true);
    setTitle(meeting.Title);
    setMeetingDate(meeting.MeetingDate || meeting.CreatedAt.slice(0, 10));
    setFilesFromServer(meeting);
    setSegments(sourceSegments);
    setSelectedSegmentId(sourceSegments[0]?.id ?? "");
    setStatus(meeting.Status === "일부 실패" ? "실패" : meeting.Status);
    setQuestions(meeting.Questions.map((item) => ({ id: item.Id, question: item.Question, answer: item.Answer, sourceSegmentId: item.SourceSegmentId })));
    setMeetings((current) => current.map((item) => item.Id === meeting.Id ? meeting : item));
  }

  async function waitForServerExtraction(id: string) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const current = await demoMeetingApi.get(id);
      if (current.Files.every((file) => file.Status === "완료" || file.Status === "실패")) return current;
      await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(100 + attempt * 25, 500)));
    }
    throw new Error("문서 추출이 계속 진행 중입니다. 잠시 후 회의를 다시 열어 상태를 확인하세요.");
  }

  function apiMessage(reason: unknown) {
    if (reason instanceof ApiClientError && reason.traceId) return `${reason.message} (추적 ID: ${reason.traceId})`;
    return reason instanceof Error ? reason.message : "회의록 작업을 완료하지 못했습니다.";
  }

  const canMutate = !shared || demoRole !== "Viewer";
  const canApprove = !shared || demoRole === "Manager" || demoRole === "Admin";

  useEffect(() => {
    if (!editorExpanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setEditorExpanded(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [editorExpanded]);

  useEffect(() => {
    void loadMeetings();
  }, [shared]);

  return <section className={`knowledge-workspace${editorExpanded ? " meeting-fullscreen" : ""}`} data-testid="meeting-minutes-workspace">
    <header className="knowledge-workspace__heading"><div><h2>회의록</h2><p>회의 내용을 등록하고 결정사항과 할 일을 원문 근거와 함께 확인합니다.</p></div><div className="knowledge-workspace__actions"><span className="meeting-status" data-testid="meeting-status">{status}</span>{editorExpanded && <button data-testid="meeting-close-fullscreen" onClick={() => setEditorExpanded(false)} type="button">닫기</button>}</div></header>
    <section className="meeting-browser" aria-label="회의록 목록과 선택 상세">
      <div className="meeting-list-panel">
        <div className="meeting-search-fields">
          <label>회의일자 From<input data-testid="meeting-filter-date-from" type="date" value={meetingDateFrom} onChange={(event) => { const nextValue = event.currentTarget.value; if (!validateDateRange(nextValue, meetingDateTo).valid) { invalidDateInputRef.current = event.currentTarget; setRangeDialogOpen(true); return; } setMeetingDateFrom(nextValue); }} /></label>
          <label>회의일자 To<input data-testid="meeting-filter-date-to" type="date" value={meetingDateTo} onChange={(event) => { const nextValue = event.currentTarget.value; if (!validateDateRange(meetingDateFrom, nextValue).valid) { invalidDateInputRef.current = event.currentTarget; setRangeDialogOpen(true); return; } setMeetingDateTo(nextValue); }} /></label>
          <button data-testid="meeting-search" disabled={loadingMeetings} onClick={searchMeetings} type="button">{loadingMeetings ? "조회 중..." : "조회"}</button>
        </div>
        <div className="sales-conversion-table-wrap"><table data-testid="meeting-list-grid"><thead><tr><th>회의일자</th><th>회의록 제목</th><th>상태</th></tr></thead><tbody>
          {shared ? visibleMeetings.map((meeting) => <tr className={meeting.Id === meetingId ? "is-selected" : ""} data-testid={`meeting-list-row-${meeting.Id}`} key={meeting.Id} onClick={() => selectMeeting(meeting)} onDoubleClick={() => selectMeeting(meeting, true)} tabIndex={0}><td>{meeting.MeetingDate || meeting.CreatedAt.slice(0, 10)}</td><td>{meeting.Title}</td><td>{meeting.Status}</td></tr>) : <tr className="is-selected" onDoubleClick={() => setEditorExpanded(true)} tabIndex={0}><td>{meetingDate}</td><td>{title}</td><td>{status}</td></tr>}
          {shared && !loadingMeetings && visibleMeetings.length === 0 && <tr><td colSpan={3}>조회된 회의록이 없습니다.</td></tr>}
        </tbody></table><p className="ai-solution-center__muted">행을 선택하면 상세를 확인하고, 더블클릭하면 전체 화면에서 편집합니다.</p></div>
      </div>
      <article className="meeting-selected-summary" data-testid="meeting-selected-summary"><h3>{title}</h3><p>{summary[0]?.text ?? "파일을 등록하면 선택한 회의록의 최종 요약이 표시됩니다."}</p><dl><div><dt>결정사항</dt><dd>{decisions.length}건</dd></div><div><dt>할 일</dt><dd>{tasks.length}건</dd></div></dl></article>
    </section>
    <section className="knowledge-workspace__editor"><div className="knowledge-workspace__fields"><label>회의록 제목<input data-testid="meeting-title" disabled={!canMutate || creatingMeeting} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>회의일자<input data-testid="meeting-date" type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.currentTarget.value)} /></label></div><div className="knowledge-workspace__actions"><button data-testid="meeting-create" disabled={!canMutate || creatingMeeting} onClick={() => void createMeeting()} type="button">{creatingMeeting ? "회의 등록 중..." : "회의등록"}</button><label className="ai-solution-center__file-label">파일등록<input accept={meetingFileAccept} data-testid="meeting-files" disabled={!canMutate || (shared && !meetingCreated)} multiple type="file" onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label><button className="primary" data-testid="meeting-process" disabled={!canMutate || (shared && !meetingCreated) || status === "추출 중"} onClick={() => void processFiles()} type="button">{segments.length > 0 ? "재처리" : "원문 추출"}</button></div><p className="ai-solution-center__muted">TXT, MD, DOCX, XLSX, PPTX 파일을 한 번에 여러 개 등록할 수 있습니다. 파일당 최대 {maximumMeetingFileBytes / 1024 / 1024}MB입니다.</p>{error && <p className="sales-conversion-error" data-testid="meeting-error" role="alert">{error}</p>}</section>
    <section><h3>추출 작업 상태</h3><div className="sales-conversion-table-wrap"><table data-testid="meeting-file-grid"><thead><tr><th>파일</th><th>크기</th><th>상태</th><th>구간 수</th><th>오류</th></tr></thead><tbody>{files.map((file) => <tr key={file.name}><td>{file.name}</td><td>{file.size.toLocaleString()} B</td><td>{file.status}</td><td>{file.segmentCount}</td><td>{file.error ?? "-"}</td></tr>)}</tbody></table></div></section>
    <details className="ai-disclosure" data-testid="meeting-source-disclosure"><summary>파일별 전체 원문</summary><div className="meeting-segment-grid sales-conversion-table-wrap"><table data-testid="meeting-segment-grid"><thead><tr><th>파일</th><th>원문 위치</th><th>원문</th></tr></thead><tbody>{segments.map((segment) => <tr className={selectedSegmentId === segment.id ? "is-selected" : ""} data-testid={`meeting-segment-${segment.id}`} key={segment.id} ref={(element) => { if (element) segmentRefs.current.set(segment.id, element); else segmentRefs.current.delete(segment.id); }} tabIndex={-1}><td>{segment.fileName}</td><td>{segment.locator}</td><td>{segment.text}</td></tr>)}</tbody></table></div></details>
    <div className="sales-conversion-preview"><section><h3>구조화 요약</h3><ul data-testid="meeting-summary-grid">{summary.map((segment) => <li key={segment.id}><button onClick={() => goToEvidence(segment.id)} type="button">{segment.text}</button><small>{segment.locator}</small></li>)}</ul></section><section><h3>결정사항</h3><ul data-testid="meeting-decisions">{decisions.map((segment) => <li key={segment.id}><button onClick={() => goToEvidence(segment.id)} type="button">{segment.text}</button></li>)}</ul></section></div>
    <section><h3>할 일 / 담당자 / 기한</h3><div className="sales-conversion-table-wrap"><table data-testid="meeting-tasks"><thead><tr><th>할 일 근거</th><th>담당자</th><th>기한</th><th>원문 위치</th></tr></thead><tbody>{tasks.map((segment) => <tr key={segment.id}><td>{segment.text}</td><td>검토 필요</td><td>검토 필요</td><td><button onClick={() => goToEvidence(segment.id)} type="button">{segment.locator}</button></td></tr>)}</tbody></table></div></section>
    <section className="knowledge-workspace__editor"><h3>회의별 Q&amp;A</h3><div className="lookup-input-group"><input data-testid="meeting-question" disabled={!canMutate} placeholder="회의 원문에 질문" value={question} onChange={(event) => setQuestion(event.target.value)} /><button data-testid="meeting-ask" disabled={!canMutate} onClick={() => void ask()} type="button">질문</button></div>{questions.map((item) => <article data-testid={`meeting-answer-${item.id}`} key={item.id}><strong>{item.question}</strong><p>{item.answer}</p><button onClick={() => goToEvidence(item.sourceSegmentId)} type="button">인용 근거로 이동</button></article>)}</section>
    <section className="knowledge-workspace__editor"><h3>검토 / 승인</h3><p>요약과 할 일은 규칙 기반 검토 초안이며 자동 확정이 아닙니다. 담당자가 원문 근거를 확인한 뒤 승인합니다.</p><div className="knowledge-workspace__actions"><button data-testid="meeting-review" disabled={segments.length === 0} onClick={() => setStatus("검토 대기")} type="button">검토 상태</button><button className="primary" data-testid="meeting-approve" disabled={!canApprove || segments.length === 0} onClick={() => void approveMeeting()} type="button">회의록 승인</button></div></section>
    <details className="ai-disclosure ai-solution-center__security" data-testid="meeting-security-disclosure"><summary>보안 감사 보존</summary><ul><li>허용된 파일 형식, 20MB 제한, 안전한 파일명 검사를 적용합니다.</li><li>{shared ? "원본은 웹 공개 경로 밖에 저장되며 작성자와 관리자만 조회합니다." : "현재 입력은 브라우저 메모리에서 처리합니다."}</li><li>외부 서비스로 전송하지 않습니다.</li></ul></details>
    <RangeValidationDialog open={rangeDialogOpen} onClose={() => { setRangeDialogOpen(false); requestAnimationFrame(() => invalidDateInputRef.current?.focus()); }} />
  </section>;
}
