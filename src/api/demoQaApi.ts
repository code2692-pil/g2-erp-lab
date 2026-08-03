import { apiClient } from "./apiClient";

export interface DemoQaAnswerDto {
  Id: string;
  Body: string;
  AuthorUserId: string;
  AuthorName: string;
  CreatedAt: string;
  Version: number;
  Deleted: boolean;
}

export interface DemoQaQuestionDto {
  Id: string;
  Title: string;
  Body: string;
  Category: string;
  Tags: string[];
  Visibility: "전체" | "담당자 전용";
  AuthorUserId: string;
  AuthorName: string;
  RelatedRecordType: string;
  RelatedInternalId: string;
  DisplayDocumentNumber: string;
  Status: "미답변" | "답변됨" | "해결" | "재오픈";
  Answers: DemoQaAnswerDto[];
  AcceptedAnswerId?: string;
  KnowledgeApproved: boolean;
  CreatedAt: string;
  UpdatedAt: string;
  Version: number;
  Deleted: boolean;
}

function post<T>(path: string, body: unknown) {
  return apiClient<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export const demoQaApi = {
  search(query: string, unansweredOnly: boolean) {
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set("query", query.trim());
    if (unansweredOnly) parameters.set("unansweredOnly", "true");
    const suffix = parameters.size ? `?${parameters}` : "";
    return apiClient<DemoQaQuestionDto[]>(`/api/demo/qa/questions${suffix}`);
  },
  create(request: {
    Title: string;
    Body: string;
    Category: string;
    Tags: string[];
    Visibility: "전체" | "담당자 전용";
    RelatedRecordType: string;
    RelatedInternalId: string;
    DisplayDocumentNumber: string;
  }) {
    return post<DemoQaQuestionDto>("/api/demo/qa/questions", request);
  },
  answer(questionId: string, body: string, expectedVersion: number) {
    return post<DemoQaQuestionDto>(`/api/demo/qa/questions/${encodeURIComponent(questionId)}/answers`, { Body: body, ExpectedVersion: expectedVersion });
  },
  accept(questionId: string, answerId: string, expectedVersion: number) {
    return post<DemoQaQuestionDto>(`/api/demo/qa/questions/${encodeURIComponent(questionId)}/accept`, { AnswerId: answerId, ExpectedVersion: expectedVersion });
  },
  reopen(questionId: string, expectedVersion: number) {
    return post<DemoQaQuestionDto>(`/api/demo/qa/questions/${encodeURIComponent(questionId)}/reopen`, { ExpectedVersion: expectedVersion });
  },
  knowledge(questionId: string, approved: boolean, expectedVersion: number) {
    return post<DemoQaQuestionDto>(`/api/demo/qa/questions/${encodeURIComponent(questionId)}/knowledge`, { Approved: approved, ExpectedVersion: expectedVersion });
  }
};
