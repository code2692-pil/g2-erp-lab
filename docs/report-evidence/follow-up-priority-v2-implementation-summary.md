# Gate 12-15 구현·검증 요약

## 최종 판정

선정 후보 **“상세 Grid 열 너비 조절 및 보기 설정 저장”** 을 한 건만 구현하고 검증했다.
범위는 수주·발주·작업지시의 기존 상세 Grid 보기 설정이며, 업무 데이터·API·DTO·Repository·DB/SQL·의존성은 변경하지 않았다.

## 구현 내용

- 기존 `GridViewPreferences`의 화면별 `localStorage` 데이터에 선택적 `width`(px)를 추가했다.
- 기존 열의 기본 너비를 그대로 사용하고, 사용자가 입력한 너비만 48~480px 범위로 정규화한다.
- 이전 저장 형식(너비 없음), 숫자가 아닌 저장값, 빈 입력은 기존 기본 너비로 안전하게 복구한다.
- 기존 Grid의 `colgroup`에 저장된 너비를 적용한다. 보기 설정 초기화는 표시 여부·순서·너비를 기본값으로 되돌린다.
- 보기 설정 대화상자에 열별 숫자 입력을 추가했다. 숨김·순서·키보드 흐름·검증 오류 열 복구는 기존 동작을 유지한다.
- E2E는 수주 너비 저장/새로고침/초기화, 손상값·최소/최대 범위, 발주·작업지시 화면별 기본값 분리를 확인한다.

## 수정 파일

- `src/components/common/gridViewPreferences.ts`
- `src/components/common/GridViewSettingsDialog.tsx`
- `src/components/common/ErpDataGrid.tsx`
- `src/styles.css`
- `tests/unit/grid-view-preferences.test.ts`
- `tests/e2e/grid-view-preferences.spec.ts`
- `docs/report-evidence/follow-up-priority-v2-evaluation.md`
- `docs/report-evidence/follow-up-priority-v2-implementation-summary.md`
- `docs/report-evidence/final-follow-up-candidates.md`

## 검증 근거

| 검증 | 결과 |
| --- | --- |
| Grid 보기 설정 단위 테스트 | 17/17 PASS |
| Grid 보기 설정 Mock E2E (worker 1) | 8/8 PASS, 새로고침·초기화·손상값·4개 PC 폭 확인 |
| 전체 Mock E2E (worker 1) | 50/50 PASS |
| 전체 InMemory API E2E (worker 1) | 18/18 PASS |
| TypeScript typecheck | PASS |
| Production build | PASS |
| 번들 예산 | entry gzip 87,784 B / 예산 98,600 B, PASS |
| .NET 솔루션 빌드 | 경고 0, 오류 0, PASS |
| 빠른 품질 Gate | 7/7 PASS |
| 테스트 정리 검사 | PASS, 5173/5080 LISTEN 없음 |
| `git diff --check` | PASS |

### Mutation 검증

너비 최대값 제한을 임시로 480px에서 479px로 훼손했다. 관련 단위 테스트는
`479 !== 480`으로 16/17 실패했다. 즉시 원복한 뒤 17/17 PASS를 재확인했다.

### 병렬 실행 관찰

기본 4-worker 전체 Mock 묶음은 이번 변경을 사용하지 않는 기존 Lookup/확인 대화상자 테스트에서
서로 다른 30초 안정화 timeout을 보였다(첫 실행 49/50, 두 번째 48/50). 실패했던 작업지시 저장
테스트는 worker 1 단독 1/1 PASS였고, 전체 worker 1 실행은 50/50 PASS였다. 테스트 timeout,
retry, assertion 및 제품 코드는 이 관찰을 위해 변경하지 않았다. 이는 Gate 12-14에서 남은 병렬
자원 경합 관찰 항목이며, 이번 한 건의 Grid 생산성 개선 범위에는 포함하지 않았다.

## 사용자 확인 방법

1. 수주·발주·작업지시의 상세 Grid에서 **보기 설정**을 연다.
2. 품목명·규격·비고 등 원하는 열의 너비를 48~480px로 입력하고 **적용**한다.
3. 화면을 새로고침해 같은 너비가 유지되는지 확인한다.
4. **기본값으로 초기화**를 확인하면 기본 너비와 기존 열 표시·순서가 복구되고, 문서 입력값은 유지된다.

## 영향과 남은 범위

- 저장되는 값은 Grid ID, 열 ID, 표시 여부, 순서, 너비뿐이며 수주·발주·작업지시 업무 데이터는 포함하지 않는다.
- SQL Server E2E는 API/DB/SQL 변경이 없어 실행하지 않았다.
- 열 머리글 드래그 리사이즈, 계정 간 동기화, 모바일/PDA 보기 설정은 명시적 비범위다.
