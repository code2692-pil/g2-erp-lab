# 릴리스 후보 체크리스트

## Git·범위

- [x] 기준점 `2c6a946`에서 로컬 `release/g2-erp-lab-rc1` 생성
- [x] `origin/main` 병합, push, PR, tag, 배포를 수행하지 않음
- [x] API endpoint, DTO, DB schema, SQL 업무 로직, Repository 계약 변경 없음
- [x] 신규 제품 기능·dependency·lockfile·README 변경 없음
- [x] 고객 데이터, secret, 테스트 artifact, 진단 코드 미포함

## 통합 인수

- [x] 기능 인벤토리 상태 분류
- [x] PC·모바일·PDA → same wrapper → endpoint → Repository → `SAL_SOH`/`SAL_SOL` 흐름 감사
- [x] AI 로컬 분석·redaction·human review 경계 감사
- [x] 유지보수 Freeze/human decision 경계 감사
- [x] 중요 관문 checkpoint commit 존재 및 merge commit 부재 확인
- [x] 주요 메뉴·전역 Shell smoke, console/pageerror 0
- [x] Mock 50/50, InMemory 18/18, SQL Server 교차 검증 완료
- [x] Headed 4/4 및 desktop/mobile/PDA target viewport smoke 완료
- [x] 6개 대표 결함 주입 후 즉시 원복

## 최종 정적 확인

- [x] `pnpm run typecheck` (build 내부) 통과
- [x] `pnpm run build` 통과
- [x] `dotnet build server/G2Erp.sln --nologo` 통과
- [x] `git diff --check` 통과
- [x] `waitForTimeout`, 실제 `test.only`/`test.skip`, `dangerouslySetInnerHTML`, 로컬 절대 경로 0건
- [x] 정적 scanner 자체, 테스트용 민감정보 문자열, 로컬 실행 스크립트의 `console.log`/session cleanup은 오탐으로 분류

## 최종 조건

- [x] Release Blocking 0건
- [x] SQL Server 테스트 문서 Header/Line 0건
- [ ] 문서·RC smoke 테스트를 한 개의 checkpoint commit으로 확정
- [ ] commit 후 clean working tree, staged 0, untracked 0, port 5173/5080 미청취 재확인
