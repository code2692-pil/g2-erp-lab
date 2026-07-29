# 관문 12-16: Playwright 기본 4-worker 병렬 실행 안정화

## 목적과 범위

기본 4-worker E2E 실행의 간헐적 초기 지연을 재현·분석하고, 제품 기능이나 API·DB 동작을 바꾸지 않은 채 실행 환경을 안정화했다. SQL Server, 배포, 신규 업무 기능은 범위에 포함하지 않았다.

## 기준과 진단

- 기준 브랜치: `feature/erp-follow-up-priority-v2`의 `1b5b502`에서 `test/playwright-parallel-stability-v1` 생성
- 기준 조건: 기본 worker 4, 기본 retry/timeout, `fullyParallel` 기존값 유지
- Mock 사전 실행: 50/50 (271.2초), 49/50 (272.1초), 50/50 (233.8초)
- InMemory 사전 실행: 18/18 (158.7초), 18/18 (139.8초), 18/18 (139.2초)

Mock의 1회 실패는 `sales-order.spec.ts`의 Gate 7 화면 진입 중 `page.goto`가 약 28초 동안 지연된 사례였다. trace에서 Vite 개발 서버의 첫 browser context module/HMR 준비와 화면 첫 lookup 요청이 같은 시간대에 겹쳤다. 초기 preview 전환 후에는 작업지시 신규과 개발 도구 preview의 첫 요청도 테스트 본문 30초 경계에 가까워지는 것을 계측으로 확인했다.

제품 상태값, 저장 처리, API 응답 DTO, SQL 데이터가 아니라 개발 서버 cold start와 4개 browser context의 동시 첫 화면 준비가 원인이었다. 데이터 고립, route 해제, storage 충돌도 audit했으며 직접적인 충돌 근거는 없었다.

## 적용한 최소 변경

1. `scripts/run-mode.mjs`의 E2E 실행은 Vite dev 대신 현재 모드의 production bundle과 `vite preview`를 사용한다.
2. 별도 headless browser로 수주·발주 조회, 작업지시 신규(미저장), 개발 도구 Preview를 한 번 준비한 뒤 browser를 닫고 suite를 시작한다.
3. `VITE_E2E_TEST_MODE=true`는 e2e bundle에서 loopback 개발 도구 확인만 허용한다. 일반 production build에는 적용되지 않는다.
4. 재현성 확인용으로만 `PLAYWRIGHT_TEST_ORDER=default|reverse`를 지원한다. worker, retry, timeout, serial, skip/only, sleep, force는 변경하지 않았다.

이 변경은 프런트엔드 테스트 runner와 e2e build gate에 한정된다. 제품 저장/삭제 동작, backend repository, DB schema/data에는 변경이 없다.

## 최종 4-worker 증거

기본 순서(`default`)의 새 실행 결과:

| 모드 | 1회 | 2회 | 3회 | 판정 |
| --- | --- | --- | --- | --- |
| Mock | 50/50, 136.2초 | 50/50, 98.3초 | 50/50, 113.1초 | 3/3 PASS |
| InMemory | 18/18, 96.5초 | 18/18, 109.4초 | 18/18, 102.5초 | 3/3 PASS |

순서 변형 새 실행 결과:

| 모드 | 순서 | 결과 | 시간 | 판정 |
| --- | --- | --- | --- | --- |
| Mock | reverse | 50/50 | 123.1초 | PASS |
| InMemory | reverse | 18/18 | 105.7초 | PASS |

모든 위 실행은 Playwright 출력의 `Running 50 tests using 4 workers` 또는 `Running 18 tests using 4 workers`를 확인했고, 매회 `[test-cleanup] PASS`로 종료했다. 비교용 worker 1 Mock 실행도 50/50, 273.2초로 한 번 수행했으며, worker 수를 낮춰 해결책으로 사용하지 않았다.

관련 mutation은 준비 단계를 임시로 생략하는 형태로 한 번만 수행한 뒤 즉시 복원했다. 해당 단일 실행은 비결정적으로 통과했으므로 이를 안정성 증명으로 사용하지 않았으며, 복원 뒤의 4-worker 반복·순서 변형 결과만 최종 근거로 삼았다.

## 잔여 위험과 운영 기준

- 새 대형 화면이나 Vite/브라우저 버전이 추가되면 해당 화면의 최초 lookup 경로를 준비 단계에 명시적으로 추가하고, 4-worker Mock·InMemory 반복을 다시 실행한다.
- 실패가 재발하면 timeout 증가가 아니라 trace의 첫 navigation/요청 지연, route 해제, test data 격리, cleanup을 먼저 확인한다.
- SQL Server E2E는 이 관문의 증거에 포함하지 않았다. 로컬 DB 조건을 사용자가 준비했을 때 별도 안전 검증으로 다룬다.
- 현재 기본 4-worker Mock 50개와 InMemory 18개 suite의 릴리스 차단 요인은 없다.
