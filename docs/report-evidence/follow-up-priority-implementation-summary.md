# Gate 12-11 1순위 개선 구현·검증 요약

- 기준점: `f6dfbdd2b89fb89ad550423a82c0570f24b2b733`
- 작업 브랜치: `feature/g2-erp-follow-up-priority-v1`
- 선택 후보: 초기 화면 진입용 생산 번들 분할 (평가 87/100)
- 상태: `SELECTED` → `IMPLEMENTED` → `VERIFIED`

## 해결한 문제와 구현 범위

기존 생산 빌드는 모든 주요 화면을 초기 진입 번들에 포함해 500 kB 초과 청크 경고를 냈다. 기본 수주등록은 즉시 표시하는 상태로 유지하고, 발주등록·작업지시등록·개발 데이터 관리·AI 솔루션 센터·모바일/PDA 수주 화면은 사용자가 실제 화면으로 이동할 때 `lazy()`로 불러오도록 변경했다.

화면 모듈을 기다리는 동안에는 `role="status"`, `aria-busy="true"`를 가진 진행 상태를 보여 준다. 첫 모듈 요청이 실패하면 오류를 숨기지 않고 `role="alert"`와 **다시 시도** 버튼을 제공하며, 다시 시도는 현재 앱을 안전하게 새로 열어 기본 수주 화면부터 회복하게 한다.

변경 파일:

- `src/App.tsx` — 지연 로딩, 접근 가능한 로딩 상태, 모듈 로드 오류 경계와 재시도
- `src/styles.css` — 로딩·오류 상태의 최소 시각 처리
- `tests/e2e/lazy-screen-loading.spec.ts` — 실제 모듈 요청 보류와 실패 주입/복구 E2E
- `docs/report-evidence/follow-up-priority-evaluation.md` — 구현 전 후보 평가와 선택 근거
- `docs/report-evidence/final-follow-up-candidates.md` — 원래 후보 순서를 유지한 상태 기록
- 이 문서 — 구현·검증 결과

API, DTO, Repository, DB, SQL, 시드, 의존성, 인증 정책, 고객·운영 환경은 변경하지 않았다.

## 결과와 검증

| 확인 항목 | 결과 |
| --- | --- |
| 변경 전 관련 Mock UI | `release-candidate-menu-smoke` 3/3 통과 (33.8초) |
| 지연 로딩 집중 Mock UI | 2/2 통과 (최종 27.0초) |
| 변경 후 관련 Mock UI | `release-candidate-menu-smoke` 3/3 통과 (20.3초) |
| 관련 InMemory API UI | `release-candidate-menu-smoke` 3/3 통과 (34.0초) |
| TypeScript | `pnpm run typecheck` 통과 |
| 생산 빌드 | `pnpm run build` 통과 |
| .NET 솔루션 | `dotnet build server/G2Erp.sln --no-restore` 통과, 경고 0·오류 0 |
| 생산 번들 | 기본 진입 JS `273.00 kB` (gzip `85.46 kB`), 기존 500 kB 초과 경고 없음 |
| SQL Server | 미실행 — API·DB·SQL 계층 변경이 없는 화면 번들 개선이므로 불필요 |

### UI 시나리오 범위

- 정상·연속 전환: 수주 ↔ 발주 ↔ 작업지시, AI, 모바일/PDA, 직접 모바일/PDA 경로를 실제 클릭으로 확인했다.
- 비동기 순서: 발주 화면 모듈 요청을 보류하고, 진행 상태가 먼저 표시된 뒤 요청 해제 후 발주 화면이 나타나는지 확인했다.
- 접근성·반응형: 로딩 상태의 `status`/`aria-busy`, 오류의 `alert`, 기존 모바일·PDA 가로 오버플로우 검사를 확인했다.
- 오류·재시도: **적대적 변이**로 첫 발주 화면 모듈 네트워크 요청을 한 번 `abort("failed")` 처리했다. 오류 안내가 표시된 것을 확인한 즉시 route를 해제하고 **다시 시도**로 기본 화면을 회복한 뒤 같은 메뉴가 정상 진입하는 것을 확인했다.
- 입력 누락, 빈 목록, 특수문자·대량 값, 저장 전 변경, 데이터 CRUD는 이 후보가 입력·데이터·저장·API를 변경하지 않아 직접 영향 범위가 아니다. 기존 화면 동작을 변경하지 않았으며, 변경 후 메뉴 스모크가 해당 화면 진입을 회귀 확인했다.

## 영향과 잔여 위험

- 사용자는 비기본 화면으로 이동할 때 짧은 로딩 안내를 볼 수 있다. 네트워크가 끊기면 오류를 명확히 보고 기본 수주 화면부터 재시도한다.
- 초기 번들 감소는 실제 생산 빌드 수치로 확인했지만, 실제 고객망의 회선·캐시 조건에서의 체감 시간은 별도 운영 환경 측정이 필요하다.
- 원래 1~10번 후보는 업무 규칙, 권한 정책, 외부 서비스, 실장비, 원격 정책 또는 신규 범위가 필요하므로 이번 구현에 포함하지 않았다.

## 최종 감사

- 진단 로그, `console.log`, `debugger`, 민감정보, 로컬 절대경로, API/DTO/DB/SQL 변경 없음
- `git diff --check` 통과
- 5173/5080 `LISTEN` 없음 (`TIME_WAIT` 연결만 잔존)
