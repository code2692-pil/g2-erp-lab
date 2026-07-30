# RC2 HOLD 재개 지침

## 현재 상태

- 기준 브랜치: `release/g2-erp-lab-rc2`
- 기준 커밋: `96384a569b038da1918627807ba206c833c1aac1`
- 판정: **RC2 NOT READY / SQL ENVIRONMENT HOLD**
- HOLD 사유: SQL Windows 인증/SSPI가 제품 API와 직접 SQL 테스트에서 모두 실패한다.

이 HOLD 체크포인트에는 runner/readiness, PDA SQL E2E 안정화, 관련 테스트 및 SQL 진단 문서만 포함한다. 제품 기능, API 계약, DTO, Repository, DB schema, SQL script, dependency, lockfile, README는 포함하지 않는다.

## SQL 복구 후 순서

1. 관리자 조치가 끝난 환경에서 SQL 서비스·서버명·인증서/SPN 진단을 읽기 전용으로 재확인한다.
2. SQL mode API를 시작해 readiness와 안전한 GET 200 JSON을 확인한다.
3. 실행별 고유 marker로 SQL E2E를 한 번 실행하고 실패 시 로그를 분류한다. 분석 없이 같은 조합을 반복하지 않는다.
4. 첫 성공 뒤 fresh process와 새 marker로 2회를 더 실행한다.
5. 세 실행 모두 PC·모바일·PDA·API 값, `SAL_SOH`·`SAL_SOL`, marker 0 cleanup이 일치하는지 확인한다.
6. Mock/InMemory 영향 범위, static Gate, cleanup 및 포트 해제를 재확인한 뒤 RC2 READY를 다시 판정한다.

## 최소 Gate와 성공 기준

- SQL API smoke: 200 JSON
- SQL 제품 E2E: 3회 연속 PASS
- marker cleanup: `SAL_SOH` 0, `SAL_SOL` 0
- Mock/InMemory: 현재 안정화 결과와 동등한 PASS
- cleanup: 성공 artifact 0, 5173/5080 잔류 0

이 조건 전에는 RC2 READY 문서나 READY 커밋을 만들지 않는다.
