# Playwright 테스트 수명주기 가이드

## 기본 책임

Playwright 기본 `page` fixture가 만든 browser context와 page는 Playwright가 닫는다. 테스트는 이 객체를 직접 닫지 않는다. 직접 `browser.newContext()` 또는 `context.newPage()`를 만든 경우에만, 만든 코드가 `finally`에서 한 번 닫는다.

테스트가 끝난 뒤에는 Playwright runner가 browser 종료를 완료한 다음 runner process가 끝나야 한다. runner는 이 경계 이후에 Vite와 InMemory API를 종료한다.

## 기본 4-worker 실행 경로

`pnpm run test:e2e:mock`와 `pnpm run test:e2e:api:inmemory`는 `scripts/run-mode.mjs`를 사용한다. 기본 Playwright worker, retry, timeout과 `fullyParallel` 설정은 바꾸지 않는다.

테스트 실행(`test`)에서는 다음 순서를 지킨다.

1. 이전 관리 artifact를 정리하고 InMemory 모드면 로컬 API를 기동한다.
2. 현재 데이터 모드로 Vite production bundle을 `e2e` mode로 만든다.
3. `vite preview`를 5173에서 기동한다. 개발 서버의 HMR module 변환 부하를 병렬 테스트의 첫 browser context에 남기지 않는다.
4. 별도 headless browser에서 수주 조회, 발주 조회, 작업지시 신규 화면, 개발 도구 Preview까지 읽기/미저장 흐름을 한 번 준비한다.
5. 준비 browser를 닫은 후에만 Playwright 전체 suite를 기본 4-worker로 실행한다.

준비 단계는 저장, 삭제, sample 생성, SQL Server 접근을 하지 않는다. 작업지시 신규는 저장하지 않은 임시 문서만 만들며, API 모드에서도 InMemory API만 사용한다. `VITE_E2E_TEST_MODE=true`는 이 production bundle을 만들 때에만 개발 도구 화면을 loopback에서 보이게 하는 빌드 플래그다. 일반 production build에서는 활성화되지 않는다.

## 실행 순서 변형

재현성 확인에만 `PLAYWRIGHT_TEST_ORDER`를 쓸 수 있다.

- `default`: 기존 파일 순서
- `reverse`: 파일 순서를 반대로 실행

그 외 값은 runner가 오류로 중단한다. 이 변수는 테스트를 제외하거나 직렬화하지 않으며, 기본 실행에는 설정하지 않는다.

## Route와 pending 요청

- route는 필요한 API 또는 module URL에만 등록한다. `**/*` 같은 광범위 route는 피한다.
- handler의 모든 경로는 `continue`, `fulfill`, `abort` 중 하나로 끝낸다.
- 의도적으로 실패를 주입한 handler는 성공 경로 전에 `unroute`한다.
- held response는 `finally`에서 release하고 `unroute` 또는 `unrouteAll()` 한다.
- cleanup 오류를 무시하는 빈 catch로 숨기지 않는다.

## Dialog, popup, focus

- 확인/취소 dialog 테스트는 기본 버튼 동작을 누르고, 필요한 경우 dialog가 열렸음을 assertion으로 확인한다.
- popup을 직접 만들면 만든 테스트가 닫는다. 현재 기본 E2E는 직접 만든 popup을 사용하지 않는다.
- 키보드 focus 테스트는 `waitForTimeout` 대신 focus, value, status assertion으로 완료를 확인한다.

## 서버 종료와 artifact

`scripts/run-mode.mjs`는 자신이 만든 Vite, preview, InMemory API, Playwright PID만 추적한다. 포트 번호나 전역 Node/Chrome 목록으로 다른 프로젝트의 프로세스를 종료하지 않는다.

성공 실행 뒤에는 `.artifacts/playwright/`의 관리 artifact를 정리한다. 실패 실행의 trace와 screenshot은 원인 분석을 위해 남기며, 다음 실행 전 또는 분석 뒤에 아래 명령으로 정리·확인한다.

```powershell
node scripts/qa/check-test-cleanup.mjs --clean-artifacts
```

이 검사는 5173·5080 LISTEN, runner가 추적한 PID, 관리 artifact만 검사한다. 정상은 종료 코드 0이며, 테스트 본문 PASS와 runner 종료 PASS를 함께 확인해야 한다.

## 테스트 데이터 격리

- Mock 테스트는 browser context별 상태를 사용하며 다른 테스트의 row나 local storage를 공유하지 않는다.
- InMemory 테스트는 로컬 API process마다 새 상태로 시작한다.
- worker 충돌이 의심되면 업무 데이터의 고정 식별자를 재사용하지 말고 자동 번호 또는 고유 suffix 규칙을 따른다.
- SQL Server와 운영 데이터 cleanup을 E2E runner에 추가하지 않는다.

## 실패 시 확인 순서

1. runner 종료 코드와 failure trace를 확인한다.
2. 첫 `newPage`, `goto`, 메뉴 전환, lookup/preview 요청이 과도하게 지연됐는지 확인한다.
3. `check-test-cleanup.mjs` 결과와 다음 정상 집중 테스트를 확인한다.
4. 테스트 순서, worker 격리, route 해제를 점검한다.
5. timeout, retry, sleep, `force`, `test.skip`, `test.only`로 현상을 숨기지 않는다.

## 고급 spec 체크리스트

- 기본 fixture page/context만 사용하는가?
- 직접 만든 page/context, popup, route를 만든 주체가 해제하는가?
- pending response를 `finally`에서 release하는가?
- dialog 확인 또는 취소를 실제로 검증하는가?
- 성공 screenshot/video를 불필요하게 남기지 않는가?
- 상태 assertion으로 완료를 확인하는가?
- Mock과 InMemory에 맞는 runner를 선택했는가?
- 실행 뒤 cleanup 결과가 clean인가?
