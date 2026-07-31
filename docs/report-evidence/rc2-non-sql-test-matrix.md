# RC2 비SQL 검증 매트릭스

| 영역 | 최신 결과 | 범위/비고 |
| --- | --- | --- |
| Mock 전체 | 50/50 PASS | 4 workers, retry 0, fresh process, cleanup PASS |
| InMemory 전체 | 18/18 PASS × 2 | 4 workers, retry 0, fresh process, cleanup PASS |
| quick quality gate | 7/7 PASS | diff check, typecheck, build, budget, .NET build, Mock/InMemory smoke |
| readiness | 8/8 PASS | 초기 asset·연속 API JSON·worker 준비·정리 검증 |
| maintenance | 17/17 PASS | runner/경계 규칙 포함 |
| Grid 단위 | 17/17 PASS | 보기·열 너비 |
| AI 파일 단위 | 14/14 PASS | 파일 분석·근거·가림 흐름 |
| bundle 단위 | 8/8 PASS | 성능 예산 |
| typecheck/build/budget | PASS/PASS/PASS | raw 282,533 B/315,000, gzip 87,784 B/98,600 |
| .NET build | PASS | warning/error 0 |
| .NET test | 55 PASS / 7 FAIL | 실패 7건은 SQL SSPI 환경 제한으로 분리 |
| headed·반응형·접근성 | 기존 PASS 기록 | 제품 변경 없이 runner/readiness 범위만 이번에 보완 |
| Playwright cleanup | PASS | 성공 artifact 0, 5173/5080 잔류 없음 |

## 적대적 검증

readiness의 연속 API 성공 확인을 일시적으로 한 번으로 줄였을 때 8개 중 해당 테스트 1개가 실패했다. 즉시 원복한 뒤 maintenance 17/17과 readiness 8/8을 다시 통과했다. 변이 잔존은 없다.

## 이번 runner 보완

InMemory runner의 cold .NET build가 fixed API readiness 창을 소비해 API가 시작되기 전에 timeout이 나는 재현 가능한 결함을 확인했다. runner가 API project를 먼저 `dotnet build --no-restore`로 완료하고, 이후 API를 `dotnet run --no-build`로 시작하도록 최소 변경했다. worker, timeout, retry, 제품 기능, API/DTO/DB 정책은 변경하지 않았다.
