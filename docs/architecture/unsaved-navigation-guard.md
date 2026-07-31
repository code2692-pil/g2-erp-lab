# RC2 미저장 변경 이동 보호

## 목적과 적용 범위

수주, 발주, 작업지시, AI 솔루션 센터, 모바일 수주, PDA 수주에서 아직 저장되지 않은 업무 입력이 화면 이동으로 사라지지 않도록 보호한다. 조회 전용 화면과 이미 독립적으로 영속화되는 Grid 보기 설정은 업무 문서의 미저장 변경으로 등록하지 않는다.

보호 대상은 다음과 같다.

- 앱 메뉴와 화면 안의 다른 업무 화면 이동
- 브라우저 Back/Forward로 발생하는 동일 앱 이력 이동
- 새로고침, 탭 닫기, 주소 변경 등 문서가 떠나는 이동
- 저장 또는 삭제 요청이 진행 중인 상태의 이동

## 상태 등록과 단일 확인 창

`useDirtyState`는 화면별 `dirty`와 `saving` 상태를 전역 `DirtyNavigationCoordinator`에 등록한다. 등록 항목에는 안정적인 React ID, 사용자에게 보이는 화면명, dirty/saving 값이 포함된다. 화면이 unmount되면 등록도 제거된다.

전역 coordinator가 보호 상태를 집계하므로 동시에 여러 입력 영역이 등록되어도 현재 변경 원인 목록을 한 번에 판단한다. 이동 요청은 다음 중 하나로만 결정된다.

| 상태 | 동작 |
| --- | --- |
| clean | 즉시 이동 |
| dirty | 기존 `ConfirmDialog` 하나로 계속 편집 또는 변경사항 버리기 선택 |
| saving | 취소/폐기 버튼 없는 안내 창으로 현재 화면 유지 |
| 이미 확인 중 | 두 번째 이동 요청을 무시 |

변경사항 버리기를 확정한 경우에만 등록 상태를 비우고 보류된 한 건의 이동을 실행한다. 취소는 입력 상태와 보류 이동을 그대로 유지한다. 화면 내부의 조회·신규·행 선택 확인은 기존 화면별 흐름을 유지하되, 화면 간 이동에 별도 확인 창을 중첩하지 않는다.

`ConfirmDialog`와 `ErpDialog`의 기존 focus trap, Escape 취소, `aria` 역할, 이전 포커스 복원을 그대로 사용한다. 저장 중 안내는 확인 버튼만 제공하며, 저장 요청을 취소하거나 데이터를 버리는 선택지를 제공하지 않는다.

## 브라우저 이력 계약

앱이 만든 이력 항목은 `history.state.g2ErpAppNavigation`에 다음 값을 보관한다.

```ts
{ version: 1, id: string, index: number, page: AppPage }
```

- `id`는 항목을 구분하는 UUID 기반 값이다.
- `index`는 앱 안의 앞뒤 이동량을 계산하는 단조 증가 값이다.
- 기존 `history.state`의 다른 속성은 보존한다.
- 페이지 주소는 수주(`/`), 발주(`/purchase-orders`), 작업지시(`/work-orders`), 개발 데이터, AI 솔루션 센터, 모바일/PDA 수주에 맞게 동기화한다.

dirty 상태에서 Back/Forward가 들어오면 앱은 먼저 현재 항목으로 이력을 되돌린 뒤, 원래 목적지를 보류한다. 사용자가 취소하면 현재 화면과 URL을 유지한다. 사용자가 변경사항 버리기를 확정하면 보류했던 정확한 이력 delta를 한 번만 재생한다. `restoreTarget`과 `replayTarget`은 이 두 단계만 구별하기 위한 메모리 플래그이며, sentinel 항목을 추가하거나 무한 popstate 루프를 만들지 않는다.

앱이 만들지 않은 이전 문서로 떠나는 Back/Forward나 주소창 이동은 브라우저 문서 전환이므로 `beforeunload` 보호를 사용한다.

## 브라우저 종료 보호의 한계

dirty 또는 saving source가 하나라도 있을 때만 `beforeunload` listener를 등록한다. clean 상태에서는 listener가 없으므로 일반 이동과 성능에 영향을 주지 않는다.

브라우저는 종료/새로고침 경고의 문구와 표시 여부를 제어한다. 제품은 임의 문구나 자체 다이얼로그를 강제하지 않고 표준 이벤트만 취소한다. 자동 테스트는 실제 브라우저 경고 문구를 검증하지 않으며, listener가 취소 가능한 `BeforeUnloadEvent`를 막는지와 clean 상태에서 listener가 없는지를 검증한다.

## 저장 경합 규칙

저장·삭제 요청이 시작되면 해당 source는 `saving=true`로 등록된다. 이때 이동은 보류하지 않고 현재 화면에 남긴다. 저장 성공 시 화면의 기존 `clearDirty` 흐름이 실행되어 이후 이동은 즉시 가능하다. 실패 시 기존 입력과 dirty 표시를 유지하므로 사용자가 수정 후 다시 저장할 수 있다. 요청이 완료되기 전에 화면을 unmount하지 않으므로 오래된 응답이 다른 화면 상태를 덮지 않는다.

## 회귀 검증

- `tests/unit/dirty-navigation-state.test.ts`: source 집계, 중복 이동 억제, discard 시점, saving 정책, 이력 상태 파싱과 delta.
- `tests/e2e/unsaved-navigation-guard.spec.ts`: 메뉴 취소/확정, focus 복원, dirty Back 취소·재생, clean Back/Forward, beforeunload 등록, AI·모바일 적용.
- `tests/e2e/unsaved-navigation-saving.spec.ts`: InMemory API 저장 요청을 보류한 상태에서 모바일 화면 이동이 단일 비파괴 안내로 막히고 저장 완료 뒤 이동하는지 확인.
- 기존 수주·발주·작업지시·모바일/PDA dirty 회귀와 Grid 보기 설정의 비업무 dirty 회귀를 함께 유지한다.

전체 RC2 검증은 `pnpm run qa:rc2:full`이 이 Playwright 목록과 로컬 SQL worker 검증을 한 번의 전달 증거로 실행한다.

## 2026-07-31 최종 RC2 검증

- 기준: `feat/rc2-unsaved-navigation-guard-v1` / `19dff36c80490b98cddf7c4b44dd1f63c3d70e68`
- `pnpm run qa:rc2:full`은 2026-07-31 09:04:54–09:21:44 KST에 exit 0으로 완료했다.
- Mock UX 71/71에는 전역 dirty navigation 6건이 포함되고, InMemory mobile/PDA 6/6에는 저장 중 이동 보호가 포함된다. Mock core 50/50, InMemory core 18/18, production direct-route 1/1도 함께 통과했다.
- 앱 내 이동·Back/Forward는 URL과 `history.state.g2ErpAppNavigation`을 일치시켜 검증했다. production의 차단된 `/development-data` 직접 경로도 현재 history entry를 수주등록(`/`, `sales`)으로 교체하므로 차단 경로가 이력에 남지 않는다.
- 브라우저 native `beforeunload`는 사용자 지정 문구와 실제 표시 여부를 보장하지 않는다. 이는 웹 표준 제한이며, 제품은 dirty/saving 상태에서 취소 가능한 표준 이벤트만 등록한다.
