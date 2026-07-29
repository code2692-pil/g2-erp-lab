# Playwright 테스트 수명주기 가이드

## 기본 책임

Playwright 기본 `page` fixture가 만든 browser context와 page는 Playwright가 닫는다. 테스트는 이 객체를 직접 닫지 않는다. 직접 `browser.newContext()` 또는 `context.newPage()`를 만든 경우에만, 만든 코드가 `finally`에서 한 번 닫는다.

테스트가 끝난 뒤에는 Playwright runner가 browser 종료를 완료한 다음 runner process가 끝나야 한다. runner는 이 경계 이후에 Vite와 InMemory API를 종료한다.

## Route와 pending 요청

- route는 필요한 API 또는 module URL만 등록한다. `**/*` 같은 광범위한 route는 피한다.
- handler의 모든 경로는 `continue`, `fulfill`, `abort` 중 하나로 끝낸다.
- 한 번만 실패를 주입한 handler는 성공 경로 전에 `unroute`한다.
- held response나 gate는 `finally`에서 release한 뒤 `unroute` 또는 `unrouteAll()` 한다.
- cleanup 오류를 `ignoreErrors`나 빈 catch로 숨기지 않는다.

## Dialog, popup, focus

- 확인·취소 dialog를 연 테스트는 기대한 버튼을 눌러 닫고, 필요한 경우 dialog가 사라졌음을 assertion으로 확인한다.
- popup을 직접 만들면 생성 테스트가 닫는다. 현재 대표 E2E에는 직접 만든 popup이 없다.
- 키보드 테스트는 `waitForTimeout` 대신 focus, value, status assertion으로 완료를 확인한다.

## 서버 수명주기

`scripts/run-mode.mjs`는 Mock에서는 Vite, InMemory에서는 API와 Vite를 시작한다. `scripts/run-playwright.mjs`는 기본 Vite runner다.

- readiness polling은 서버 시작 확인용이며 Playwright action timeout과 별개다.
- 종료 시에는 `exit` listener를 먼저 준비한 다음 child process에 graceful 종료를 요청한다.
- runner가 생성한 PID만 cleanup 검사에 전달한다. 포트 번호나 전역 Node·Chrome 목록으로 다른 프로젝트를 종료하지 않는다.
- 5173은 Vite, 5080은 InMemory API 확인에만 사용한다.

## Artifact와 실패 분석

성공 실행은 `.artifacts/playwright/`의 관리 artifact를 정리한다. 실패 실행은 screenshot·trace를 같은 관리 경로에 남겨 원인을 확인할 수 있게 한다. 다음 실행 전 또는 검토가 끝난 뒤에는 아래 명령으로 정리·검사한다.

```powershell
node scripts/qa/check-test-cleanup.mjs --clean-artifacts
```

이 도구는 5173·5080 LISTEN, runner가 전달한 PID, 관리 artifact만 검사한다. 정상은 0, 잔류는 1을 반환한다.

## 테스트 데이터 격리

- Mock test는 context별 상태를 전제로 하며 다른 테스트의 row나 local storage에 의존하지 않는다.
- InMemory test는 local API process마다 새 상태로 시작한다.
- worker 충돌을 피하려면 업무 데이터 식별을 재사용하지 말고 현재 자동 번호 또는 고유 suffix 방식을 따른다.
- SQL Server·운영 데이터 cleanup을 E2E runner에 추가하지 않는다.

## 실패와 중단 뒤 확인

의도치 않은 실패 뒤에는 먼저 runner 종료 코드와 failure trace를 확인한다. 이어서 cleanup 검사와 다음 정상 집중 테스트를 실행한다. 테스트 본문 PASS와 runner 종료 PASS를 같은 의미로 취급하지 않는다.

## 신규 spec 체크리스트

- 기본 fixture page/context만 사용했는가?
- 직접 만든 page/context, popup, route를 생성 주체가 해제하는가?
- pending response를 `finally`에서 release하는가?
- dialog를 확인 또는 취소로 끝내는가?
- 성공 screenshot·video를 불필요하게 남기지 않는가?
- timeout, retry, `force`, `waitForTimeout`, `test.only`, `test.skip` 없이 상태 assertion으로 완료를 확인하는가?
- Mock과 InMemory 중 영향을 받는 runner를 선택했는가?
- 실행 뒤 `check-test-cleanup.mjs` 결과가 clean인가?
