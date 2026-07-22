# G2-ERP-Lab 작업 지침

## 1. 프로젝트 목적과 범위

- 이 저장소는 **ERP/MES 개발환경 개선 PoC**다.
- 현재 대표 화면은 수주등록, 발주등록, 작업지시등록이다.
- 고객 운영시스템을 구축하는 단계가 아니며, 회사가 검토 가능한 PoC 품질을 목표로 한다.

현재 우선순위:

1. 수주·발주·작업지시 화면의 실제 사용성 개선
2. 세 화면의 버튼, Grid, 상태, 오류 처리 통일
3. 코드 중복과 임시 구현 정리
4. 회사 설명용 PPT, 매뉴얼, 기술 구조 정리
5. 임원·기술직 검토 후 다음 기능 하나만 선택

명시적 요청 없이는 다음을 추가하지 않는다.

- BOM, 공정경로, 생산실적
- 재고, 출하, 검사
- MES·PLC 실제 연동
- 모바일·PDA
- 신규 업무 모듈

## 2. 실제 기술 구조와 실행

- Frontend: React 19, TypeScript, Vite (`src/`)
- Backend: .NET 8 API (`server/G2Erp.Api`)
- Backend 테스트: xUnit (`server/G2Erp.Api.Tests`)
- DB 설정 도구: .NET 8 (`server/G2Erp.DbSetup`)
- 로컬 DB 스크립트: `database/local/`
- E2E: Playwright (`tests/e2e/`)
- 데이터 모드: Mock, InMemory API, SqlServer API

`package.json`에 있는 실행·검증 명령만 우선 사용한다.

```powershell
pnpm run dev
pnpm run dev:mock
pnpm run dev:api:inmemory
pnpm run dev:api:sqlserver
pnpm run typecheck
pnpm run build
pnpm run test:e2e:mock
pnpm run test:e2e:api:inmemory
pnpm run test:e2e:api:sqlserver
pnpm run test:e2e
pnpm run test:e2e:ui
pnpm run test:e2e:report
```

기본 주소는 다음과 같다.

- Frontend: `http://127.0.0.1:5173`
- InMemory/SqlServer API: `http://127.0.0.1:5080`
- Preview: `http://127.0.0.1:4173`

Backend 변경 시에는 실제 솔루션을 대상으로 필요할 때만 다음을 사용한다.

```powershell
dotnet build server/G2Erp.sln
dotnet test server/G2Erp.Api.Tests/G2Erp.Api.Tests.csproj
```

## 3. DB 안전수칙

- 회사, 고객, 운영 DB에는 접근하지 않는다. 로컬 개발 DB만 사용한다.
- 기존 로컬 서버·DB 조건과 Windows 통합 인증을 유지한다.
- Connection String, 토큰, 비밀번호 등 민감정보를 출력하거나 코드에 추가하지 않는다.
- `DROP DATABASE`, 시스템 DB 변경, 로그인·서버 역할·서버 설정 변경을 금지한다.
- 광범위한 `DELETE`, `TRUNCATE`를 실행하지 않는다.
- DB Schema·Seed 변경은 사용자의 명시적 요청이 있을 때만 한다.
- SqlServer 검증은 안전한 로컬 조건에서만 수행하고, Windows 계정 또는 권한 확인이 필요하면 사용자에게 명확히 보고한다.

## 4. Git 안전수칙

작업 시작 전 반드시 확인한다.

```powershell
pwd
git rev-parse --show-toplevel
git remote -v
git status
```

사용자 명시 요청 없이는 다음을 실행하지 않는다.

- `git add`, `git commit`, `git push`
- `git reset`, `git clean`
- `git checkout`으로 변경 폐기
- 기존 미커밋 변경사항 덮어쓰기

다른 작업의 변경사항은 보존한다. 현재 요청과 무관한 변경을 되돌리거나 정리하지 않는다.

## 5. 작업 범위 원칙

- 요청된 파일과 직접 관련된 공통 파일만 수정한다.
- 기존 공통 컴포넌트와 Hook을 우선 재사용한다.
- 불필요한 리팩터링, 새 Framework, 대규모 구조 재설계를 하지 않는다.
- 테스트 통과만을 위해 제품 기능을 약화하지 않는다.
- Assertion 삭제, 무조건 성공 처리, timeout·sleep 증가로 오류를 숨기지 않는다.
- 일반 사용자 화면에 `Mock`, `Repository`, `API Mode`, DTO명 등 개발 용어를 노출하지 않는다.
- 사용성·상태·오류 UX 변경 시 수주·발주·작업지시 세 화면의 일관성을 함께 확인한다.

## 6. 검증 기준

위험도에 맞춰 최소 검증을 수행한다.

| 변경 유형 | 최소 검증 |
| --- | --- |
| 문구, 색상, 레이아웃 | `pnpm run typecheck`, 관련 집중 테스트, `git diff --check` |
| 화면 기능, 상태, 공통 UX | `pnpm run typecheck`, `pnpm run build`, 관련 Mock E2E, 관련 InMemory E2E, `git diff --check` |
| Backend, Repository, DB | `dotnet build`, 관련 비DB 테스트, 관련 Mock/InMemory 테스트, 안전한 경우 로컬 SqlServer 검증 |

- 실행하지 않은 검증을 PASS로 보고하지 않는다.
- 테스트 결과에는 가능하면 전체 수, 통과, 실패, 종료 코드를 기록한다.

## 7. 사용자 테스트 병행

- 사용자는 SqlServer 모드에서 수주·발주·작업지시를 상시 테스트한다.
- 피드백이 들어오면 현재 작업과 충돌하는지 먼저 확인하고, 충돌하면 사용자 피드백을 우선순위에 반영한다.
- 중요한 변경 전후에는 Codex 작업과 사용자 테스트의 진행 상태를 다시 맞춘다.
- 새 업무 모듈은 임의로 확장하지 않는다.

## 8. 최종 보고 형식

사용자는 ERP/MES 업무 전문가이지만 비전공자다. 최종 보고는 다음 순서로 작성한다.

1. 무엇을 만들거나 고쳤는지
2. 왜 필요한지
3. 사용자가 알아야 할 핵심 3가지
4. 기술 상세
5. 사용자 확인 방법

최소 포함 항목:

- 변경 목적과 변경 내용
- 수정 파일
- 테스트 결과와 실행하지 못한 검증
- 제품 기능·DB 영향
- 사용자 수동 확인 필요사항과 남은 위험
- 커밋 가능 여부
