# ERP Grid 보기 설정 저장 개발 가이드

## 구조

공통 로직은 다음 파일에 있다.

- `src/components/common/gridViewPreferences.ts`: 설정 schema, 저장/복구, 정규화, 적용.
- `src/components/common/GridViewSettingsDialog.tsx`: 적용 전 draft를 유지하는 공통 Dialog.
- `src/components/common/ErpDataGrid.tsx`: 상세 Grid 연결, 키보드·검증 오류 연계.

`ErpDataGrid`는 `dataTestId`가 아래 중 하나일 때만 보기 설정을 연결한다.

```text
sales-order-line-grid    -> sales-order-lines
purchase-line-grid       -> purchase-order-lines
work-order-process-grid  -> work-order-lines
```

## 저장 형식

키는 `g2-erp.grid-view-preferences.v1.<gridId>`다. 저장값은 다음 metadata만 허용한다.

```json
{
  "schemaVersion": 1,
  "gridId": "sales-order-lines",
  "columns": [
    { "id": "NO_LINE", "visible": true, "order": 0 },
    { "id": "CD_ITEM", "visible": false, "order": 1 }
  ]
}
```

열 ID는 화면에 표시되는 한글 제목이나 위치가 아니라 기존 Grid의 안정된 field ID를 사용한다. 이 값에 문서 행이나 업무 데이터는 넣지 않는다.

## 새 상세 Grid 연결 방법

1. 해당 `ErpDataGrid`에 안정된 `dataTestId`를 부여한다.
2. `gridViewSettingsByDataTestId`에 Grid ID, Dialog 제목, 고정 열 ID를 등록한다.
3. 고정 열은 데이터 식별·업무 흐름에 필요한 최소 열만 지정한다.
4. 열 정의의 `id`가 없으면 `field`를 안정 ID로 사용한다. 제목 또는 배열 index로 만들지 않는다.
5. 새 Grid마다 저장 key와 E2E를 분리해 다른 화면 설정이 섞이지 않게 한다.

## 정규화 규칙

- schema version 또는 Grid ID가 다르면 기본값을 쓴다.
- JSON 파싱/저장/삭제 예외는 잡고 화면을 계속 사용한다.
- 저장된 삭제 열은 무시하고, 새 열은 기본 표시 상태로 추가한다.
- 중복 열은 첫 항목만 사용한다.
- 잘못된 표시 값이나 순서는 해당 열의 기본값으로 복구한다.
- 고정 열은 항상 보이고 이동하지 않는다.
- 모든 열 숨김 요청은 허용하지 않는다.

## UX 및 키보드 규칙

Dialog에서만 draft를 바꾸고 **적용**할 때만 Grid와 localStorage에 반영한다. **취소**는 저장하지 않는다. 초기화는 `confirm`을 거쳐 해당 Grid key만 제거한다.

`ErpDataGrid`는 적용된 `visibleColumns`를 단일 기준으로 사용한다. 따라서 헤더, 렌더링, Tab/Enter 이동, 붙여넣기 대상이 모두 같은 열 순서를 따른다. 필수 검증 오류가 숨긴 열에 생기면 해당 열을 공개한다.

## 검증 명령

```powershell
pnpm run typecheck
pnpm run test:grid-view-preferences
pnpm exec playwright test tests/e2e/grid-view-preferences.spec.ts --workers=1 --retries=0
pnpm run build
pnpm run check:bundle-budget
```

단위 테스트는 정상 저장, Grid 분리/초기화, 손상값, schema, 신규·삭제·중복 열, 잠금 열, 모든 열 숨김 방지, storage 예외, 검증 열 공개를 다룬다.

## 문제 해결

- 설정이 예상과 다르면 브라우저의 해당 Grid key만 삭제하거나 Dialog의 **기본값으로 초기화**를 사용한다.
- 저장 권한 오류는 업무 데이터 오류가 아니다. 설정은 세션에 유지되지만 브라우저를 다시 열면 기본값으로 돌아갈 수 있다.
- 새 열 추가 후에도 기존 설정은 정규화된다. schema version을 올리는 것은 저장 형식 자체가 호환되지 않을 때만 고려한다.
