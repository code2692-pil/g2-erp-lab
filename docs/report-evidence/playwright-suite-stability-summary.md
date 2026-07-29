# Playwright 묶음 실행 안정화 결과

## 목적

관문 12-13 검증 중 보고된 작업지시 Playwright 묶음의 간헐적 종료 지연을 제품 결함과 분리해 확인하고, Mock·InMemory 실행 뒤 테스트 자원을 예측 가능하게 정리한다. 제품 화면, API, DTO, Repository, DB, SQL은 변경하지 않았다.

## 증상과 재현 기준

수정 전 작업지시 Mock 묶음(`tests/e2e/work-order.spec.ts`)을 fresh process로 세 번 실행했다. 세 번 모두 10/10 PASS, exit 0, 5173·5080 LISTEN 없음이었으므로 과거의 context 종료 오류 자체는 재현되지 않았다. 전체 실행 시간은 93.3초, 100.2초, 106.8초였다.

다만 각 성공 실행의 마지막에 Vite가 `playwright-report` 생성 변경을 감지해 reload 로그를 남겼다. 또한 두 runner 모두 자식 process를 종료한 **뒤** `exit` event listener를 붙이고 있었다. 빠르게 끝난 자식의 event를 놓치면 `run-mode`의 기존 5초 graceful-shutdown 대기까지 불필요하게 기다릴 수 있는 구조였다.

## 분류와 실제 원인

| 분류 | 판정 | 근거 |
| --- | --- | --- |
| PRODUCT_DEFECT | 없음 | 작업지시 5회, Mock 전체 2회, InMemory 전체 2회에서 업무 assertion 실패와 화면 오류가 없었다. |
| TEST_DEFECT | 있음 | 성공 시 수동 screenshot 세 건, 실패 여부와 무관한 video recording, route cleanup의 `ignoreErrors`가 artifact·cleanup 관찰을 흐릴 수 있었다. |
| RUNNER_DEFECT | 있음 | 자식 종료 event listener가 `kill()` 뒤에 등록됐고, HTML report가 Vite 감시 루트에 생성됐다. |
| ENVIRONMENT_LIMITATION | 미판정 | 일반 Chrome 프로세스는 사용자 브라우저와 구분할 명령행 열람 권한이 없어 전역 검사 대상으로 삼지 않았다. 대신 Playwright runner 종료와 이 runner가 생성한 PID·포트만 검사했다. |

## 수정 내용

- Playwright output·HTML report를 `.artifacts/playwright/`로 옮기고 Vite가 이 경로를 감시하지 않도록 했다.
- 성공 시 수동 screenshot을 만들던 수주·작업지시 E2E 세 건을 제거했다. 실패 screenshot과 trace는 그대로 보존된다.
- 실패 여부와 무관하게 video recorder를 만들던 설정을 `video: "off"`로 바꿨다. 실패 분석에는 기존 screenshot·trace를 사용한다.
- `run-mode.mjs`, `run-playwright.mjs`에서 exit listener를 `kill()`보다 먼저 등록했다.
- 두 runner가 시작 PID를 최소 로그로 남기고, 성공 후에는 관리 artifact를 정리한 다음 PID·5173·5080·artifact 상태를 검사하도록 했다.
- `scripts/qa/check-test-cleanup.mjs`를 추가했다. 이 도구는 runner가 전달한 PID만 검사하므로 다른 프로젝트의 Node·Chrome을 종료하거나 실패로 처리하지 않는다.
- 세 route test의 `unrouteAll({ behavior: "ignoreErrors" })`를 오류를 숨기지 않는 `unrouteAll()`로 바꿨다.

## 수명주기 감사

- **Page·Context:** E2E는 Playwright 기본 `page` fixture를 사용하며 직접 `newContext`, `newPage`, `page.close`, `context.close`를 호출하지 않는다. 생성 주체인 Playwright가 닫는다.
- **Route·요청:** 현재 route handler는 `continue`, `fulfill`, `abort` 중 하나로 완료되고, API·prefetch·작업지시 route 회귀에서 명시적 해제를 검증했다. held response는 `finally`에서 release한 뒤 해제한다.
- **Dialog·popup:** 테스트는 확인·취소 클릭 후 dialog가 사라지는 assertion을 사용한다. popup을 직접 생성하는 시나리오는 없다.
- **서버·child process:** Mock은 Vite만, InMemory는 API 후 Vite 순으로 시작한다. 종료는 반대 순서로 요청하고, 추적 PID·5173·5080을 확인한다.
- **테스트 데이터:** Mock은 context별 상태를 사용한다. InMemory는 runner마다 새 API process로 시작하며 로컬 InMemory 데이터만 사용한다. SQL Server와 영구 업무 데이터는 실행하지 않았다.

Playwright가 Chromium child PID를 별도로 공개하지는 않으므로, browser 종료 완료 시각은 Playwright runner exit을 경계로 기록했다. 일반 Chrome을 전역 종료하지 않았으며, runner exit 후 tracked PID와 테스트 포트가 남지 않는 것으로 종료 책임을 검증했다.

## 반복·실패 검증

| 검증 | 결과 |
| --- | --- |
| 작업지시 Mock 묶음 5회 | 매회 10/10 PASS, exit 0, cleanup PASS. 전체 63.1~80.8초. |
| Mock 전체 2회 | 매회 50/50 PASS, 기본 4 workers, cleanup PASS. |
| InMemory 전체 2회 | 매회 18/18 PASS, 기본 4 workers, API readiness와 cleanup PASS. |
| Grid 보기 설정 | 6/6 PASS, cleanup PASS. |
| prefetch route | 5/5 PASS. 의도적 module fetch 실패 후 회복 assertion을 통과했다. |
| 모바일·PDA | 7/7 PASS, cleanup PASS. |
| AI 솔루션 센터 대표 | 1/1 PASS, cleanup PASS. |
| 의도적 assertion 실패 | 별도 임시 spec이 exit 1로 실패했고, failure screenshot·trace는 관리 경로에 보존됐다. Vite·API 포트와 tracked PID는 clean이었다. |
| 실패 뒤 정상 실행 | 작업지시 생성·저장 1/1 PASS, cleanup PASS. |

적대적 검증으로 post-run artifact 삭제 한 줄을 임시 제거했다. 본문 1/1 PASS였지만 cleanup 검사가 두 artifact 경로를 잔류로 보고하고 runner를 exit 1로 판정했다. 즉시 원복·정리 후 같은 테스트는 다시 PASS했다.

## 정적·quality 검증

- `pnpm run typecheck` PASS
- `qa:quality:quick` 7/7 PASS: diff check, typecheck, frontend build, bundle budget, .NET build, Mock smoke, InMemory smoke
- `git diff --check` PASS

## 남은 한계

Windows 권한상 기존 사용자 Chrome과 Playwright Chromium의 명령행을 안전하게 구분할 수 없었다. 이를 이유로 전역 Chrome 종료를 수행하지 않았다. 대신 이 관문에서 시작한 server·runner PID와 5173·5080만 엄격히 확인한다. 장시간 OS scheduling 영향은 여전히 가능하지만, 현재 반복 측정에는 비정상적인 종료 지연이나 포트 충돌이 없었다.
