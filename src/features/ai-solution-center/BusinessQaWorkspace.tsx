import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/apiClient";
import { demoEnvironment } from "../../api/demoApi";
import { demoQaApi, type DemoQaQuestionDto } from "../../api/demoQaApi";
import { useDemoRole } from "../../components/DemoEnvironmentGate";
import { createClientId } from "../../utils/clientId";

interface QaAnswer {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

interface QaQuestion {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  relatedDocument: string;
  scope: "전체" | "담당자 전용";
  status: "미답변" | "답변됨" | "해결" | "재오픈";
  attachments: string[];
  answers: QaAnswer[];
  acceptedAnswerId?: string;
  knowledgeCandidate: boolean;
  version?: number;
}

const initialQuestions: QaQuestion[] = [{
  id: "QA-202608-01",
  title: "부분 발주 후 발주 가능 잔량은 어떻게 계산하나요?",
  body: "취소되지 않은 발주수량 합계를 원본 수주수량에서 차감하는 기준을 확인하고 싶습니다.",
  category: "구매",
  tags: ["수주", "발주", "잔량"],
  relatedDocument: "SOR2026080001/1",
  scope: "전체",
  status: "미답변",
  attachments: [],
  answers: [],
  knowledgeCandidate: false
}];

function newId(prefix: string) {
  const value = createClientId("qa");
  return `${prefix}-${value}`;
}

function fromServer(question: DemoQaQuestionDto): QaQuestion {
  return {
    id: question.Id,
    title: question.Title,
    body: question.Body,
    category: question.Category,
    tags: question.Tags,
    relatedDocument: question.DisplayDocumentNumber,
    scope: question.Visibility,
    status: question.Status,
    attachments: [],
    answers: question.Answers.filter((answer) => !answer.Deleted).map((answer) => ({ id: answer.Id, body: answer.Body, author: answer.AuthorName, createdAt: answer.CreatedAt })),
    acceptedAnswerId: question.AcceptedAnswerId,
    knowledgeCandidate: question.KnowledgeApproved,
    version: question.Version
  };
}

export function BusinessQaWorkspace() {
  const shared = demoEnvironment === "shared";
  const demoRole = useDemoRole();
  const [questions, setQuestions] = useState<QaQuestion[]>(shared ? [] : initialQuestions);
  const [selectedId, setSelectedId] = useState(shared ? "" : initialQuestions[0].id);
  const [search, setSearch] = useState("");
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("영업");
  const [tags, setTags] = useState("");
  const [relatedDocument, setRelatedDocument] = useState("");
  const [scope, setScope] = useState<QaQuestion["scope"]>("전체");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(shared);

  const loadSharedQuestions = async () => {
    if (!shared) return;
    setLoading(true);
    try {
      const loaded = (await demoQaApi.search(search, unansweredOnly)).map(fromServer);
      setQuestions(loaded);
      setSelectedId((current) => loaded.some((question) => question.id === current) ? current : loaded[0]?.id ?? "");
    } catch (reason) {
      setMessage(apiMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!shared) return;
    const timer = window.setTimeout(() => void loadSharedQuestions(), 150);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, search, unansweredOnly]);

  const visible = useMemo(() => questions.filter((question) => {
    const keyword = search.trim().toLocaleLowerCase();
    const matched = !keyword || [question.title, question.body, question.category, question.relatedDocument, ...question.tags].join(" ").toLocaleLowerCase().includes(keyword);
    return matched && (!unansweredOnly || question.answers.length === 0);
  }), [questions, search, unansweredOnly]);
  const selected = questions.find((question) => question.id === selectedId);

  const createQuestion = async () => {
    if (!title.trim() || !body.trim()) { setMessage("제목과 질문 내용을 입력하세요."); return; }
    if (shared) {
      try {
        const created = fromServer(await demoQaApi.create({
          Title: title.trim(), Body: body.trim(), Category: category,
          Tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), Visibility: scope,
          RelatedRecordType: relatedDocument.trim() ? "ERPDocument" : "",
          RelatedInternalId: "",
          DisplayDocumentNumber: relatedDocument.trim()
        }));
        setQuestions((current) => [created, ...current]);
        setSelectedId(created.id);
        setCreating(false);
        setTitle(""); setBody(""); setTags(""); setRelatedDocument(""); setAttachments([]);
        setMessage("질문을 등록했습니다.");
      } catch (reason) { setMessage(apiMessage(reason)); }
      return;
    }
    const next: QaQuestion = {
      id: newId("QA"),
      title: title.trim(),
      body: body.trim(),
      category,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      relatedDocument: relatedDocument.trim(),
      scope,
      status: "미답변",
      attachments,
      answers: [],
      knowledgeCandidate: false
    };
    setQuestions((current) => [next, ...current]);
    setSelectedId(next.id);
    setCreating(false);
    setTitle(""); setBody(""); setTags(""); setRelatedDocument(""); setAttachments([]);
    setMessage("질문이 등록되었습니다.");
  };

  const addAnswer = async () => {
    if (!selected || !answer.trim()) { setMessage("사람 답변을 입력하세요."); return; }
    if (shared) {
      try {
        const updated = fromServer(await demoQaApi.answer(selected.id, answer.trim(), selected.version ?? 0));
        replaceQuestion(updated); setAnswer(""); setMessage("답변을 등록했습니다.");
      } catch (reason) { setMessage(apiMessage(reason)); }
      return;
    }
    const nextAnswer: QaAnswer = { id: newId("ANSWER"), body: answer.trim(), author: "업무 담당자", createdAt: new Date().toISOString() };
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, answers: [...question.answers, nextAnswer], status: "답변됨" } : question));
    setAnswer("");
    setMessage("답변이 등록되었습니다.");
  };

  const accept = async (answerId: string) => {
    if (!selected) return;
    if (shared) {
      try { replaceQuestion(fromServer(await demoQaApi.accept(selected.id, answerId, selected.version ?? 0))); setMessage("채택 답변을 저장했습니다."); }
      catch (reason) { setMessage(apiMessage(reason)); }
      return;
    }
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, acceptedAnswerId: answerId, status: "해결" } : question));
    setMessage("채택 답변은 질문당 한 건으로 지정되었습니다.");
  };

  const reopen = async () => {
    if (!selected) return;
    if (shared) {
      try { replaceQuestion(fromServer(await demoQaApi.reopen(selected.id, selected.version ?? 0))); setMessage("질문을 재오픈했습니다."); }
      catch (reason) { setMessage(apiMessage(reason)); }
      return;
    }
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, acceptedAnswerId: undefined, knowledgeCandidate: false, status: "재오픈" } : question));
    setMessage("질문을 재오픈했습니다.");
  };

  const toggleKnowledge = async (approved = !selected?.knowledgeCandidate) => {
    if (!selected?.acceptedAnswerId) { setMessage("채택 답변이 있어야 승인된 지식 후보로 지정할 수 있습니다."); return; }
    if (shared) {
      const previous = selected;
      replaceQuestion({ ...selected, knowledgeCandidate: approved });
      try { replaceQuestion(fromServer(await demoQaApi.knowledge(selected.id, approved, selected.version ?? 0))); }
      catch (reason) { replaceQuestion(previous); setMessage(apiMessage(reason)); }
      return;
    }
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, knowledgeCandidate: approved } : question));
  };

  const canMutate = !shared || demoRole !== "Viewer";
  const canManage = !shared || demoRole === "Manager" || demoRole === "Admin";

  function replaceQuestion(updated: QaQuestion) {
    setQuestions((current) => current.map((question) => question.id === updated.id ? updated : question));
  }

  function apiMessage(reason: unknown) {
    if (reason instanceof ApiClientError && reason.status === 409) return `${reason.message} 목록을 새로 불러오세요.`;
    if (reason instanceof ApiClientError && reason.traceId) return `${reason.message} (추적 ID: ${reason.traceId})`;
    return reason instanceof Error ? reason.message : "업무 Q&A 작업을 완료하지 못했습니다.";
  }

  return <section className="knowledge-workspace" data-testid="business-qa-workspace" aria-busy={loading}>
    <header className="knowledge-workspace__heading"><div><h2>업무 Q&amp;A</h2><p>{shared ? "권한이 적용된 질문·답변 공간입니다." : "AI 결과와 분리된 사람 중심 질문·답변 공간입니다. 이 브라우저에서 유지됩니다."}</p></div><div className="knowledge-workspace__actions">{shared && <button data-testid="qa-refresh" onClick={() => void loadSharedQuestions()} type="button">새로고침</button>}<button data-testid="qa-new" disabled={!canMutate} onClick={() => setCreating(true)} type="button">질문 등록</button></div></header>
    <div className="knowledge-workspace__toolbar"><input aria-label="업무 Q&A 검색" data-testid="qa-search" placeholder="제목·본문·태그·문서번호 검색" value={search} onChange={(event) => setSearch(event.target.value)} /><label><input checked={unansweredOnly} data-testid="qa-unanswered-only" onChange={(event) => setUnansweredOnly(event.target.checked)} type="checkbox" />미답변만</label><span>{loading ? "불러오는 중" : `검색 결과 ${visible.length}건`}</span></div>
    {message && <p className="knowledge-workspace__message" data-testid="qa-message" role="status">{message}</p>}
    {creating && <section className="knowledge-workspace__editor" data-testid="qa-create-form"><h3>새 질문</h3><div className="knowledge-workspace__fields"><label>제목<input data-testid="qa-title" value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>분류<select data-testid="qa-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>영업</option><option>구매</option><option>생산</option><option>공통</option></select></label><label>태그<input data-testid="qa-tags" placeholder="쉼표로 구분" value={tags} onChange={(event) => setTags(event.target.value)} /></label><label>관련 ERP 문서<input data-testid="qa-related-document" placeholder="예: SOR2026080001/1" value={relatedDocument} onChange={(event) => setRelatedDocument(event.target.value)} /></label><label>공개 범위<select data-testid="qa-scope" value={scope} onChange={(event) => setScope(event.target.value as QaQuestion["scope"])}><option>전체</option><option>담당자 전용</option></select></label><label>첨부 {shared && <small>현재 파일 첨부는 지원하지 않음</small>}<input data-testid="qa-attachments" disabled={shared} multiple type="file" onChange={(event) => setAttachments(Array.from(event.target.files ?? []).map((file) => file.name))} /></label></div><label>질문 내용<textarea data-testid="qa-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} /></label><div className="knowledge-workspace__actions"><button onClick={() => setCreating(false)} type="button">취소</button><button className="primary" data-testid="qa-create" onClick={() => void createQuestion()} type="button">등록</button></div></section>}
    <div className="knowledge-workspace__layout"><aside className="knowledge-workspace__list" aria-label="질문 목록">{visible.map((question) => <button className={selectedId === question.id ? "is-active" : ""} data-testid={`qa-question-${question.id}`} key={question.id} onClick={() => setSelectedId(question.id)} type="button"><strong>{question.title}</strong><span>{question.category} · {question.status} · 답변 {question.answers.length}</span><small>{question.tags.join(" · ") || "태그 없음"}</small></button>)}{visible.length === 0 && <p>조건에 맞는 질문이 없습니다.</p>}</aside>
      <article className="knowledge-workspace__detail" data-testid="qa-detail">{selected ? <><div className="knowledge-workspace__detail-heading"><div><h3>{selected.title}</h3><p>{selected.category} · {selected.status} · {selected.scope}</p></div>{selected.status === "해결" && <button data-testid="qa-reopen" disabled={!canManage} onClick={() => void reopen()} type="button">재오픈</button>}</div><p>{selected.body}</p><dl><div><dt>태그</dt><dd>{selected.tags.join(", ") || "없음"}</dd></div><div><dt>관련 ERP 문서</dt><dd data-testid="qa-related-link">{selected.relatedDocument || "연결 없음"}</dd></div><div><dt>첨부</dt><dd>{selected.attachments.join(", ") || "없음"}</dd></div></dl><section><h4>사람 답변</h4>{selected.answers.map((item) => <article className={selected.acceptedAnswerId === item.id ? "is-accepted" : ""} data-testid={`qa-answer-${item.id}`} key={item.id}><p>{item.body}</p><small>{item.author} · {item.createdAt.slice(0, 10)}</small><button data-testid={`qa-accept-${item.id}`} disabled={!canManage || selected.acceptedAnswerId === item.id} onClick={() => void accept(item.id)} type="button">{selected.acceptedAnswerId === item.id ? "채택됨" : "답변 채택"}</button></article>)}<textarea data-testid="qa-answer-input" disabled={!canMutate} placeholder="사람 답변을 입력하세요." rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} /><button className="primary" data-testid="qa-answer-create" disabled={!canMutate} onClick={() => void addAnswer()} type="button">답변 등록</button></section><label className="knowledge-workspace__knowledge"><input checked={selected.knowledgeCandidate} data-testid="qa-knowledge-candidate" disabled={!canManage} onChange={(event) => void toggleKnowledge(event.target.checked)} type="checkbox" />승인된 지식 후보로 지정 <span>채택 답변과 관련 문서를 인용 근거로 유지합니다.</span></label></> : <p>{loading ? "질문을 불러오는 중입니다." : "질문을 선택하세요."}</p>}</article>
    </div>
  </section>;
}
