# 관문 1~10 변경 이력 감사

| 구간 | Git 근거 | 목적과 실제 구현 | 테스트 근거 | 알려진 한계 |
| --- | --- | --- | --- | --- |
| 관문 1 | `000427a Initial commit - 수주등록 화면 샘플` | 수주등록 PoC 출발점 | 이후 Playwright 기반으로 회귀 범위 편입 | 초기 PoC, 운영 적용 아님 |
| 관문 2 | `2e9d90f feat: 공통 Lookup(거래처/품목) 1차 구현`, `17e0063 feat: ERP 공통 Grid 2차 고도화` | 거래처·품목 찾기 창과 공통 Grid | 수주·발주·작업지시 Lookup/Grid E2E | 회사 기준정보 미연동 |
| 관문 3 | `9bda850 test: Playwright 기반 ERP UI 자동검증 환경 구축`, `ca64f38 feat: 수주등록 공통 Validation 1차 구현` | UI 회귀 기반과 입력 검증 | Validation·Paste 계약 테스트 | 운영 업무 규칙 전체 아님 |
| 관문 4 | `ee2f5e8 feat: ASP.NET Core 공통 API Layer PoC 구축` 이후 작업지시 API/Repository 커밋 | API 모드·작업지시 PoC 확장 | InMemory CRUD와 UI E2E | SQL Server 운영 검증 아님 |
| 관문 5 | `f6466d4 feat: ERP 공통 UX/UI 및 API E2E 안정화` | 세 화면 UX/UI와 API E2E 안정화 | Mock/InMemory 집중 회귀 | 운영 배포 미수행 |
| 관문 6 | `f14a67d feat: ERP 미저장 변경 보호 추가` | 조회·신규·문서 전환 전 변경 보호와 수정됨 표시 | Mock 46/46, InMemory 15/15 당시 근거 | 브라우저 종료 보호 미포함 |
| 관문 7 | `0368634 feat: ERP Grid 키보드 연속 입력 개선` | Enter/Tab focus와 연속 입력 | Grid keyboard/Ctrl+V 계약 | 운영 대용량 검증 아님 |
| 관문 8 | `2d9b333 feat: ERP 입력 오류 안내 및 검증 UX 표준화` | 오류 요약·오류 셀·복구 UX | Validation 집중 E2E | 회사별 규칙 미적용 |
| 관문 9 | `6df7927 feat: ERP 요청 처리 수명주기 안정화` | pending·중복 요청·latest-wins·unmount 방어 | 관문 11 readiness 이후 Gate 9 3/3 재검증 | API cold start는 환경 이슈 |
| 관문 10 | `e239ed3 feat: AI 자동 유지보수 및 검증 기반 구축` | ANALYZE/PREDEVELOP, 위험 분류, quality gate, 보고서, workflow 계약 | Node 8/8, quick 6/6 당시 근거 | 원격 Action·사전개발 미실행 |

초기 관문 1~4는 관문 이름이 도입되기 전의 연속 커밋이므로, 단일 해시를 임의로 고르지 않고 실제 구현 체인을 함께 기록했다. 이 감사는 Git log와 `origin/main..e239ed3` diff 통계를 기준으로 작성했다.
