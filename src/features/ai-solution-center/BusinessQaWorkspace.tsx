import { useMemo, useState } from "react";

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
}

const initialQuestions: QaQuestion[] = [{
  id: "FINAL-UAT-202608-QA-01",
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
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function BusinessQaWorkspace() {
  const [questions, setQuestions] = useState<QaQuestion[]>(initialQuestions);
  const [selectedId, setSelectedId] = useState(initialQuestions[0].id);
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

  const visible = useMemo(() => questions.filter((question) => {
    const keyword = search.trim().toLocaleLowerCase();
    const matched = !keyword || [question.title, question.body, question.category, question.relatedDocument, ...question.tags].join(" ").toLocaleLowerCase().includes(keyword);
    return matched && (!unansweredOnly || question.answers.length === 0);
  }), [questions, search, unansweredOnly]);
  const selected = questions.find((question) => question.id === selectedId);

  const createQuestion = () => {
    if (!title.trim() || !body.trim()) { setMessage("제목과 질문 내용을 입력하세요."); return; }
    const next: QaQuestion = {
      id: newId("FINAL-UAT-202608-QA"),
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

  const addAnswer = () => {
    if (!selected || !answer.trim()) { setMessage("사람 답변을 입력하세요."); return; }
    const nextAnswer: QaAnswer = { id: newId("ANSWER"), body: answer.trim(), author: "UAT 담당자", createdAt: new Date().toISOString() };
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, answers: [...question.answers, nextAnswer], status: "답변됨" } : question));
    setAnswer("");
    setMessage("답변이 등록되었습니다.");
  };

  const accept = (answerId: string) => {
    if (!selected) return;
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, acceptedAnswerId: answerId, status: "해결" } : question));
    setMessage("채택 답변은 질문당 한 건으로 지정되었습니다.");
  };

  const reopen = () => {
    if (!selected) return;
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, acceptedAnswerId: undefined, knowledgeCandidate: false, status: "재오픈" } : question));
    setMessage("질문을 재오픈했습니다.");
  };

  const toggleKnowledge = () => {
    if (!selected?.acceptedAnswerId) { setMessage("채택 답변이 있어야 승인된 지식 후보로 지정할 수 있습니다."); return; }
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, knowledgeCandidate: !question.knowledgeCandidate } : question));
  };

  return <section className="knowledge-workspace" data-testid="business-qa-workspace">
    <header className="knowledge-workspace__heading"><div><h2>업무 Q&amp;A</h2><p>AI 결과와 분리된 사람 중심 질문·답변 공간입니다. AI 기능이 실패해도 질문과 답변은 계속 사용할 수 있습니다.</p></div><button data-testid="qa-new" onClick={() => setCreating(true)} type="button">질문 등록</button></header>
    <div className="knowledge-workspace__toolbar"><input aria-label="업무 Q&A 검색" data-testid="qa-search" placeholder="제목·본문·태그·문서번호 검색" value={search} onChange={(event) => setSearch(event.target.value)} /><label><input checked={unansweredOnly} data-testid="qa-unanswered-only" onChange={(event) => setUnansweredOnly(event.target.checked)} type="checkbox" />미답변만</label><span>검색 결과 {visible.length}건</span></div>
    {message && <p className="knowledge-workspace__message" data-testid="qa-message" role="status">{message}</p>}
    {creating && <section className="knowledge-workspace__editor" data-testid="qa-create-form"><h3>새 질문</h3><div className="knowledge-workspace__fields"><label>제목<input data-testid="qa-title" value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>분류<select data-testid="qa-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>영업</option><option>구매</option><option>생산</option><option>공통</option></select></label><label>태그<input data-testid="qa-tags" placeholder="쉼표로 구분" value={tags} onChange={(event) => setTags(event.target.value)} /></label><label>관련 ERP 문서<input data-testid="qa-related-document" placeholder="예: SOR2026080001/1" value={relatedDocument} onChange={(event) => setRelatedDocument(event.target.value)} /></label><label>공개 범위<select data-testid="qa-scope" value={scope} onChange={(event) => setScope(event.target.value as QaQuestion["scope"])}><option>전체</option><option>담당자 전용</option></select></label><label>첨부<input data-testid="qa-attachments" multiple type="file" onChange={(event) => setAttachments(Array.from(event.target.files ?? []).map((file) => file.name))} /></label></div><label>질문 내용<textarea data-testid="qa-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} /></label><div className="knowledge-workspace__actions"><button onClick={() => setCreating(false)} type="button">취소</button><button className="primary" data-testid="qa-create" onClick={createQuestion} type="button">등록</button></div></section>}
    <div className="knowledge-workspace__layout"><aside className="knowledge-workspace__list" aria-label="질문 목록">{visible.map((question) => <button className={selectedId === question.id ? "is-active" : ""} data-testid={`qa-question-${question.id}`} key={question.id} onClick={() => setSelectedId(question.id)} type="button"><strong>{question.title}</strong><span>{question.category} · {question.status} · 답변 {question.answers.length}</span><small>{question.tags.join(" · ") || "태그 없음"}</small></button>)}{visible.length === 0 && <p>조건에 맞는 질문이 없습니다.</p>}</aside>
      <article className="knowledge-workspace__detail" data-testid="qa-detail">{selected ? <><div className="knowledge-workspace__detail-heading"><div><h3>{selected.title}</h3><p>{selected.category} · {selected.status} · {selected.scope}</p></div>{selected.status === "해결" && <button data-testid="qa-reopen" onClick={reopen} type="button">재오픈</button>}</div><p>{selected.body}</p><dl><div><dt>태그</dt><dd>{selected.tags.join(", ") || "없음"}</dd></div><div><dt>관련 ERP 문서</dt><dd data-testid="qa-related-link">{selected.relatedDocument || "연결 없음"}</dd></div><div><dt>첨부</dt><dd>{selected.attachments.join(", ") || "없음"}</dd></div></dl><section><h4>사람 답변</h4>{selected.answers.map((item) => <article className={selected.acceptedAnswerId === item.id ? "is-accepted" : ""} data-testid={`qa-answer-${item.id}`} key={item.id}><p>{item.body}</p><small>{item.author} · {item.createdAt.slice(0, 10)}</small><button data-testid={`qa-accept-${item.id}`} disabled={selected.acceptedAnswerId === item.id} onClick={() => accept(item.id)} type="button">{selected.acceptedAnswerId === item.id ? "채택됨" : "답변 채택"}</button></article>)}<textarea data-testid="qa-answer-input" placeholder="사람 답변을 입력하세요." rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} /><button className="primary" data-testid="qa-answer-create" onClick={addAnswer} type="button">답변 등록</button></section><label className="knowledge-workspace__knowledge"><input checked={selected.knowledgeCandidate} data-testid="qa-knowledge-candidate" onChange={toggleKnowledge} type="checkbox" />승인된 지식 후보로 지정 <span>채택 답변과 관련 문서를 인용 근거로 유지합니다.</span></label></> : <p>질문을 선택하세요.</p>}</article>
    </div>
  </section>;
}
