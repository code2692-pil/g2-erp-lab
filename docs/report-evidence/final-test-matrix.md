# 최종 테스트 매트릭스

| 영역 | 기능 | Mock | InMemory | Headed | 해상도 | Mutation/진단 | 정적 검증 | 결과 | 한계 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 조회·Header/상세 | 수주·발주·작업지시 조회와 선택 | 50개 전체 범위 포함 | API CRUD·작업지시 조회 포함 | 3 화면 기본 흐름 통과 | 4종 | 진단 출력 제거 | typecheck/build | 통과 | SQL Server 미검증 |
| 신규·저장·삭제 | ConfirmDialog, 중복 클릭 방지, 복구 | 수주·발주·작업지시 포함 | 수주·발주·작업지시 API 포함 | 1440x900 확장 흐름 통과 | 1440x900 | mutation 코드 0 | .NET 개별 빌드 | 통과 | 운영 데이터 미검증 |
| first-wins/latest-wins/unmount | Gate 9 요청 수명주기 | 해당 없음 | 3/3 통과 | 해당 없음 | 해당 없음 | GATE9 진단 표식 0 | API readiness 분리 | 통과 | cold start 실행기 한계 |
| 입력 검증 | 필수값, 수량, 단가, 오류 해제 | 수주 Validation 6/6, 발주·작업지시 포함 | 서버 오류·복구 포함 | 발주/작업지시 확장 흐름 | 1440x900 | assertion 약화 없음 | typecheck | 통과 | 고객 규칙 미적용 |
| dirty guard | 조회·신규·문서 전환 전 보호 | 수주·발주·작업지시 포함 | API 화면 전환 포함 | 기본 화면 전환 통과 | 4종 | native confirm 미사용 | focused E2E | 통과 | 브라우저 종료 보호 미포함 |
| Grid | Enter/Tab, Ctrl+V, 행 추가·삭제 | 수주·발주·작업지시 포함 | 해당 API 화면 조회 포함 | 수주 확장 흐름 | 1440x900 | test.only/skip 실사용 0 | focused E2E | 통과 | 대용량 실데이터 미검증 |
| API 오류 복구 | 400/409/500, 재시도 | Mock 저장 검증 | 수주·발주·작업지시 복구 포함 | 해당 없음 | 해당 없음 | route cleanup 안정화 | API 테스트 | 통과 | SQL Server 미검증 |
| 자동 유지보수 | ACTIVE/FREEZE, 위험 차단, 후보·보고서 | 해당 없음 | 해당 없음 | CLI/보고서 파일 | 해당 없음 | finalDecision AI 미기입 | Node 8/8, quick gate | 통과 | 원격 Action 미실행 |

## 실제 실행 집계

- Mock: 수주 31/31, 발주 8/8, 작업지시 10/10, 개발도구 1/1 = **50/50**.
- InMemory: `api-mode.spec.ts` 11/11, `work-order-api-mode.spec.ts` 5/5, `work-order-api-validation.spec.ts` 1/1, `development-data.spec.ts` 1/1 = **18/18**.
- 최종 quick 품질 게이트: 6/6 통과, 누적 실행 시간 117,279ms. TypeScript, Vite build, .NET solution build은 모두 종료 코드 0이었다.
- headless 전체 회귀는 runner 상한에 맞춰 spec·기능군으로 분할했다. 각 명령은 worker 1, retry 0, 기존 timeout을 사용했다.
- headed 확인은 4개 해상도 x 3개 화면 12/12와 확장 흐름 3/3으로 수행했다.

## 실행기와 제품 실패의 구분

`scripts/run-mode.mjs`가 API cold start에 대해 고정 60초를 사용하므로, 과거 InMemory 전체 명령은 테스트 시작 전에 중단된 이력이 있다. 관문 11에서는 별도 API 프로세스와 HTTP readiness polling으로 이를 분리했다. API가 HTTP 200을 반환한 뒤 실행한 18개 테스트는 모두 통과했으므로, 이 이력은 제품 기능 실패로 계산하지 않는다.
