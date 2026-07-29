# 최종 테스트 매트릭스 v2

## 이번 관문에서 새로 실행한 핵심 근거

| 영역 | 환경·방법 | 결과 | 비고 |
| --- | --- | --- | --- |
| 메뉴·전역 Shell | Mock, 신규 RC smoke | 1/1 통과 | 수주·발주·작업지시·모바일·PDA·AI·개발도구 |
| PC 해상도 | Mock, 1920×1080 / 1366×768 / 1280×720 | 각 1/1 통과 | 메뉴, 복귀, console/pageerror 0 |
| 모바일 해상도 | Mock, 360×800 / 390×844 | 각 1/1 통과 | 직접 경로, 주요 버튼, 가로 overflow 없음 |
| PDA 해상도 | Mock, 320×480 / 360×640 | 각 1/1 통과 | 직접 경로, 주요 버튼, 가로 overflow 없음 |
| Headed 시연 | Mock, worker 1 | 4/4 통과 | PC→모바일→PDA, 메일, AI 파일·가림 |
| AI 민감정보 | Mock, Gate 12-7H fresh | 1/1 통과 | 화면·Markdown·패키지 원문 미노출 |
| 모바일/PDA API hardening | InMemory | 5/5 통과 | 취소, 최신 결과, 오류 회복, first action wins |
| SQL 교차 | 로컬 `G2ERP_DEV_LOCAL_TEST` | 2/2 통과 | Header/Line 최종 0건 |
| 유지보수 | Node | 9/9 통과 | Freeze·protected path·human decision |
| quick 품질 게이트 | 정적·Mock·InMemory | 6/6 통과 | diff/typecheck/build/.NET/smoke |

## 이전 관문에서 이 기준점까지 누적된 실행 근거

| 그룹 | 전체 | 통과 | 실패 | 실행 환경 | 종료 코드 |
| --- | ---: | ---: | ---: | --- | ---: |
| 기본 ERP Mock 전체 | 50 | 50 | 0 | worker 1, fresh Mock | 0 |
| 기본 ERP InMemory 전체 | 18 | 18 | 0 | worker 1, fresh API | 0 |
| Playwright 등록 목록 | 125 | 해당 없음 | 해당 없음 | 14 files list audit | 0 |

## 결함 주입 방어 검증

| 주입한 결함 | 탐지 근거 | 결과 |
| --- | --- | --- |
| 저장 중 disabled 해제 | API UI duplicate save/delete test | 기대대로 assertion 실패 |
| 이전 query Abort·latest sequence 해제 | Gate 9 stale query test | A가 B를 덮어 기대대로 실패 |
| 화면 입력 검증 3지점 우회 | 실제 InMemory PUT | API가 400으로 거절; 임시 관찰 테스트 정리 단계 timeout은 제품 assertion 아님 |
| invalid item paste 중단 해제 | invalid lookup paste test | 첫 행 부분 반영을 기대대로 검출 |
| sensitive redactor 제거 | Gate 12-7H | sensitive finding 부재를 기대대로 검출 |
| review package top-level key 검사 해제 | Gate 12-6E | `package.script` 거절 근거 소실을 기대대로 검출 |

각 주입은 실행 직후 원복했다. 최종 작업 트리에 주입 코드나 진단 코드는 남기지 않는다.

## 실행 중 분리해 기록한 사항

- 혼합 Mock 선택 실행에서는 Gate 12-7H와 responsive가 timeout으로 끝났으나, 각각 fresh 재실행에서 1/1 통과했다.
- 반응형 최초 RC 메뉴 smoke는 360px에서 의도적으로 숨겨진 desktop side-nav를 클릭하려 해 실패했다. 제품 결함이 아니라 테스트 구조 결함으로 분류했고, 모바일/PDA 직접 경로 smoke로 보정해 네 target viewport에서 통과했다.
- Vite build는 500kB 초과 chunk 경고를 냈으나 build는 성공했다. 기능·보안 release blocking이 아닌 후속 성능 개선 후보다.
