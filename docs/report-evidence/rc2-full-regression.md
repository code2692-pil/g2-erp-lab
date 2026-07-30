# RC2 전체 회귀 검증 증거

## 실행 기준

- 명령: `pnpm run qa:rc2:full`
- 실행 전 조건: 작업 트리 clean, 5173/5080 포트 비점유, 설치된 로컬 SQL worker가 유휴 상태
- 결과 파일: `.local-runtime/rc2-full-regression/latest-summary.json`
- 단계별 로그: `.local-runtime/rc2-full-regression/logs/`

로컬 런타임 결과와 로그는 사용자 PC에만 남고 Git에는 포함하지 않는다. 실패 시 첫 실패 단계와 해당 로그 경로를 요약 JSON에서 확인한 뒤 원인을 분류하며, 자동 재실행이나 marker 삭제를 하지 않는다.

## 검증 인벤토리

| 범주 | 전체 명령 내부 단계 | DB/worker/포트 | 중복 방지와 결과 |
| --- | --- | --- | --- |
| 정적·메타데이터 | Git whitespace, package JSON, PowerShell parser, SQL 검증 스크립트 정책 검사 | 없음 | 빠른 실패, 각 단계 로그/소요 시간 기록 |
| 운영 스크립트 안전성 | worker install `-ValidateOnly`, local SQL URL `-ValidateOnly` | SQL·Startup·PID 생성 없음 | 경로 계산과 URL 조합만 읽기 전용으로 확인 |
| 프런트엔드 | TypeScript, production build, bundle budget, Grid/AI/bundle/maintenance unit tests | 없음 | build 결과와 bundle 예산을 동일 build 산출물에서 검사 |
| .NET 비SQL | solution build, `FullyQualifiedName!~SqlServer` 테스트 | 로컬 InMemory API만 사용 | SQL 통합 테스트는 제외하여 worker와 중복하지 않음 |
| PC E2E | Mock 핵심 4 spec, InMemory API 핵심 4 spec | 5173, InMemory는 5080 | `run-mode`가 자신이 시작한 Vite/API만 종료 |
| UX·접근성 E2E | AI, Grid 설정, lazy loading, PC↔mobile/PDA, release menu, prefetch | 5173 | production-contract 검사와 분리해 개발 도구 E2E flag 혼입 방지 |
| 운영 번들 계약 | `production-development-data.spec.ts` | 5173 | `PLAYWRIGHT_PRODUCTION_MODE=true`에서 개발 도구 메뉴와 직접 경로를 확인 |
| SQL worker | 암호화 TCP/TLS, API smoke, xUnit SQL 통합, mobile/PDA SQL cross, marker 전후 검사 | worker, 1433, 5173, 5080 | 전체 회귀당 한 번만 실행 |

## SQL marker 안전 경계

기존 수주·발주·작업지시 marker 9개 scope와 mobile/PDA SQL cross marker 2개 scope를 검사한다. mobile/PDA SQL cross는 매 실행 `G2-MPDA-<GUID>`를 사용하고 `afterAll`에서 회사 코드 `1000`과 해당 remark marker가 정확히 일치하는 수주만 API 삭제한 뒤 재조회로 0건을 확인한다. 이 정리는 넓은 prefix 삭제를 사용하지 않는다.

## 재현과 해석

성공 시 마지막 출력은 `RC2 FULL REGRESSION: PASS`, 종료 코드는 0이다. 실패 시 `RC2 FULL REGRESSION: FAIL`, 종료 코드는 1이며, 이후 단계는 실행하지 않는다. SQL worker 결과에는 encrypted TCP/TLS, API endpoint, 11개 marker scope, runner 종료와 5173/5080 해제 상태가 별도로 기록된다.

이 명령은 worker 설치·재시작, SQL Server 설정 변경, 인증서 변경, 자동 데이터 정리, push, PR, merge, rebase, 배포를 수행하지 않는다.
