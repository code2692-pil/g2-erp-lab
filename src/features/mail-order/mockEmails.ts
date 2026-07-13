import type { MailMessage } from "./types";

export const mockEmails: readonly MailMessage[] = [
  {
    MAIL_ID: "mock-mail-normal-001",
    FROM_ADDRESS: "order@sample-semyung.test",
    FROM_NAME: "세명테크 수주팀",
    SUBJECT: "[수주] 테스트 컨트롤러 7월 발주",
    RECEIVED_AT: "2026-07-10 09:14",
    BODY_TEXT: `안녕하세요. 테스트 수주를 요청드립니다.\n거래처명: 세명테크\n거래처코드: P-10021\n수주일자: 2026/07/10\n비고: 테스트 정상 수주\n품목: ITM-1001 | 산업용 컨트롤러 A | 수량: 3 | 단가: 120,000 | 납기: 2026-07-22 | 비고: 우선 납품`,
    ATTACHMENTS: [],
    PARSE_STATUS: "대기",
    ERROR_MESSAGE: null
  },
  {
    MAIL_ID: "mock-mail-multiple-002",
    FROM_ADDRESS: "po@sample-hanbit.test",
    FROM_NAME: "한빛산업 구매팀",
    SUBJECT: "[수주] 테스트 품목 2종 발주",
    RECEIVED_AT: "2026-07-10 10:02",
    BODY_TEXT: `거래처명: 한빛산업\n거래처코드: P-10044\n수주일자: 2026-07-10\n비고: 분할 납품 요청\n품목: ITM-1204 | 센서 모듈 B | 수량: 10 | 단가: 45,000 | 납기: 2026-07-25 | 비고: 1차\n품목: ITM-1410 | 제어반 배선 키트 | 수량: 2 | 단가: 90,000 | 납기: 2026-07-30 | 비고: 2차`,
    ATTACHMENTS: [{ FILE_NAME: "test-po.txt", MIME_TYPE: "text/plain", SIZE: 248, MOCK_CONTENT: "mock only" }],
    PARSE_STATUS: "대기",
    ERROR_MESSAGE: null
  },
  {
    MAIL_ID: "mock-mail-partner-missing-003",
    FROM_ADDRESS: "purchase@sample-unknown.test",
    FROM_NAME: "가상 거래처 담당자",
    SUBJECT: "[수주] 거래처 코드 누락 테스트",
    RECEIVED_AT: "2026-07-10 11:15",
    BODY_TEXT: `수주일자: 2026-07-10\n비고: 거래처 정보가 없습니다\n품목: ITM-1001 | 산업용 컨트롤러 A | 수량: 1 | 단가: 100,000 | 납기: 2026-07-24 | 비고: 확인 필요`,
    ATTACHMENTS: [],
    PARSE_STATUS: "대기",
    ERROR_MESSAGE: null
  },
  {
    MAIL_ID: "mock-mail-item-missing-004",
    FROM_ADDRESS: "order@sample-mirae.test",
    FROM_NAME: "미래정밀 수주팀",
    SUBJECT: "[수주] 품목코드 일부 누락 테스트",
    RECEIVED_AT: "2026-07-10 13:30",
    BODY_TEXT: `거래처명: 미래정밀\n거래처코드: P-10058\n수주일자: 2026-07-10\n품목: ITM-1308 | 서보 드라이브 2kW | 수량: 1 | 단가: 500,000 | 납기: 2026-07-26 | 비고: 정상\n품목:  | 미등록 테스트 품목 | 수량: 2 | 단가: 10,000 | 납기: 2026-07-26 | 비고: 코드 확인 필요`,
    ATTACHMENTS: [],
    PARSE_STATUS: "대기",
    ERROR_MESSAGE: null
  },
  {
    MAIL_ID: "mock-mail-quantity-error-005",
    FROM_ADDRESS: "order@sample-cheongsol.test",
    FROM_NAME: "청솔전자 구매팀",
    SUBJECT: "[수주] 수량 형식 오류 테스트",
    RECEIVED_AT: "2026-07-10 15:05",
    BODY_TEXT: `거래처명: 청솔전자\n거래처코드: P-10073\n수주일자: 2026-07-10\n품목: ITM-1204 | 센서 모듈 B | 수량: 세 개 | 단가: 45,000 | 납기: 2026-07-28 | 비고: 수량 원문 유지`,
    ATTACHMENTS: [],
    PARSE_STATUS: "대기",
    ERROR_MESSAGE: null
  },
  {
    MAIL_ID: "mock-mail-general-006",
    FROM_ADDRESS: "notice@sample-internal.test",
    FROM_NAME: "테스트 운영공지",
    SUBJECT: "[공지] 테스트 시스템 점검 안내",
    RECEIVED_AT: "2026-07-10 16:20",
    BODY_TEXT: "이번 주말 테스트 시스템 점검이 예정되어 있습니다. 수주 요청이나 품목 정보는 포함되어 있지 않습니다.",
    ATTACHMENTS: [],
    PARSE_STATUS: "대기",
    ERROR_MESSAGE: null
  }
];
