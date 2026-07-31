# 최종 기능 인벤토리

상태는 구현 여부와 실제 검증 근거를 함께 나타낸다. `IMPLEMENTED_NOT_PRODUCTION_VERIFIED`는 기능이 없다는 뜻이 아니라 운영환경 검증을 아직 하지 않았다는 뜻이다.

| 기능 | 상태 | 이번 기준 근거 | 경계 |
| --- | --- | --- | --- |
| ERP/MES 개발환경 개선 PoC | IMPLEMENTED_AND_VERIFIED | Mock·InMemory·로컬 SQL Server 교차 검증 | 운영 시스템 아님 |
| PC 수주등록 | IMPLEMENTED_AND_VERIFIED | 조회, 신규, Lookup, 행, 계산, 저장/삭제, 오류 회복 E2E | 회사 규칙 UAT 필요 |
| 발주등록 | IMPLEMENTED_AND_VERIFIED | Mock 8건, InMemory CRUD·검증 | 운영 DB 미검증 |
| 작업지시등록 | IMPLEMENTED_AND_VERIFIED | Mock 10건, InMemory 6건 | 생산 실행·MES 연동 아님 |
| 메일 수주 후보 생성·반영 | IMPLEMENTED_AND_VERIFIED | Mail A~F Mock | 실제 Gmail/메일 서버 연동 아님 |
| 공통 ERP Grid·Lookup | IMPLEMENTED_AND_VERIFIED | 세 화면 Grid, Ctrl+V, keyboard E2E | 대용량 성능 미검증 |
| 연속 입력·Focus 흐름 | IMPLEMENTED_AND_VERIFIED | Gate 7 수주·발주·작업지시 E2E | 접근성 전문 감사 미수행 |
| 입력 검증·오류 안내 | IMPLEMENTED_AND_VERIFIED | Validation E2E 및 API 400 | 회사별 규칙 확장 필요 |
| 미저장 변경 보호 | IMPLEMENTED_AND_VERIFIED | 수주·발주·작업지시 dirty guard | 브라우저 종료 보호 제외 |
| 중복 실행·최신 조회 우선 | IMPLEMENTED_AND_VERIFIED | pending·Gate 9·compact hardening | 분산 동시성 정책 별도 |
| HTTP 오류 복구 | IMPLEMENTED_AND_VERIFIED | 400/409/network recovery E2E | 운영 장애 대응 체계 별도 |
| Mock/InMemory/SQL Server 테스트 체계 | IMPLEMENTED_AND_VERIFIED | 50/50, 18/18, 로컬 SQL 교차 | 운영 DB 연결 금지 |
| AI 자동 유지보수·Freeze Gate | IMPLEMENTED_AND_VERIFIED | Node 9/9, quick 6/6, ANALYZE | AI가 최종 결정하지 않음 |
| AI 솔루션 센터 기본 PoC | IMPLEMENTED_AND_VERIFIED | AI 센터 A/B/C, 고객 Q&A | 외부 AI 서비스 미연동 |
| 회사 지식팩·후속 질문·내보내기 | IMPLEMENTED_AND_VERIFIED | Gate 12-2·12-3 E2E | 실제 지식 관리 시스템 미연동 |
| 근거·인계·대안·로드맵 | IMPLEMENTED_AND_VERIFIED | Gate 12-4~12-6 E2E | 견적·효과 수치 자동 산정 아님 |
| 검토 기록·케이스 패키지 | IMPLEMENTED_AND_VERIFIED | strict package import/export E2E | 전자결재 대체 아님 |
| 파일 인텔리전스·민감정보 가림 | IMPLEMENTED_AND_VERIFIED | TXT/CSV/JSON/MP4/차단 파일/민감정보 E2E | PDF·Office 본문, OCR/STT 제외 |
| ERP/MES 실전 시나리오 예시 | IMPLEMENTED_PARTIALLY_VERIFIED | Gate 12-7 시나리오 입력·추천 | 실제 현장 데이터 미검증 |
| 모바일 수주 웹 화면 | IMPLEMENTED_AND_VERIFIED | Mock/ InMemory 조회·저장·오류·responsive | 네이티브 앱 아님 |
| PDA 수주 웹 화면 | IMPLEMENTED_AND_VERIFIED | Enter 입력·오류·저장·responsive | PDA SDK/스캐너 미연동 |
| PC·모바일·PDA 동일 수주 데이터 | IMPLEMENTED_AND_VERIFIED | Mock/InMemory/SQL Server 교차 | 운영 동시 수정 정책 미검증 |
| 실제 외부 AI·메일·고객 시스템 연결 | PROPOSAL_ONLY | 의도적으로 미구현 | 별도 보안·계약 필요 |
| BOM·공정경로·재고·출하·검사·PLC | OUT_OF_SCOPE | 요청 범위 밖 | 다음 후보로만 기록 |
