import { apiClient } from "./apiClient";

export interface DemoMeetingSegmentDto {
  Id: string;
  FileId: string;
  FileName: string;
  Locator: string;
  Text: string;
}

export interface DemoMeetingFileDto {
  Id: string;
  OriginalName: string;
  ContentType: string;
  Size: number;
  Status: "대기" | "완료" | "실패";
  Error?: string;
  Segments: DemoMeetingSegmentDto[];
}

export interface DemoMeetingDto {
  Id: string;
  Title: string;
  MeetingDate?: string;
  OwnerUserId: string;
  Status: "초안" | "추출 중" | "검토 대기" | "일부 실패" | "승인";
  Files: DemoMeetingFileDto[];
  Questions: { Id: string; Question: string; Answer: string; SourceSegmentId: string; AuthorUserId: string; CreatedAt: string }[];
  CreatedAt: string;
  UpdatedAt: string;
  Version: number;
}

export const demoMeetingApi = {
  list() {
    return apiClient<DemoMeetingDto[]>("/api/demo/meetings");
  },
  create(title: string, meetingDate: string) {
    return apiClient<DemoMeetingDto>("/api/demo/meetings", { method: "POST", body: JSON.stringify({ Title: title, MeetingDate: meetingDate }) });
  },
  get(meetingId: string) {
    return apiClient<DemoMeetingDto>(`/api/demo/meetings/${encodeURIComponent(meetingId)}`);
  },
  upload(meetingId: string, file: File, expectedVersion: number) {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("expectedVersion", String(expectedVersion));
    return apiClient<DemoMeetingDto>(`/api/demo/meetings/${encodeURIComponent(meetingId)}/files`, { method: "POST", body: form });
  },
  approve(meetingId: string, expectedVersion: number) {
    return apiClient<DemoMeetingDto>(`/api/demo/meetings/${encodeURIComponent(meetingId)}/approve`, {
      method: "POST",
      body: JSON.stringify({ ExpectedVersion: expectedVersion })
    });
  },
  ask(meetingId: string, question: string, expectedVersion: number) {
    return apiClient<DemoMeetingDto>(`/api/demo/meetings/${encodeURIComponent(meetingId)}/questions`, {
      method: "POST",
      body: JSON.stringify({ Question: question, ExpectedVersion: expectedVersion })
    });
  }
};
