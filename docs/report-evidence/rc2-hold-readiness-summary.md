# RC2 NOT READY / SQL ENVIRONMENT HOLD

## 판정

RC2의 제품 기능 결함은 확인되지 않았지만, 로컬 SQL Server의 Windows 통합 인증 연결을 완료할 수 없어 RC2를 Release Candidate Ready로 판정하지 않는다. 이 문서는 SQL 환경 복구 전의 검증 근거를 고정한다.

## 기준

- 시작 기준 브랜치/커밋: `release/g2-erp-lab-rc2` / `96384a569b038da1918627807ba206c833c1aac1`
- 대상 DB: `G2ERP_DEV_LOCAL_TEST`
- 인증: Windows Integrated Authentication
- SQL 서비스: 기본 인스턴스 `MSSQLSERVER`, 실행 중
- 제품 코드, API 계약, DTO, Repository 계약, DB schema 및 SQL script 변경: 없음

## Release Blocking

- SQL mode 제품 API 요청이 HTTP 500으로 실패한다.
- 직접 .NET SQL 통합 테스트 7건이 SSPI 오류로 실패한다.
- 오류 핵심: `target principal name is incorrect`, `cannot generate SSPI context`.
- 따라서 제품 API를 통한 SQL CRUD, PC·모바일·PDA 교차 검증, `SAL_SOH`·`SAL_SOL` marker readback/cleanup을 검증하지 못했다.

## 환경 판단 근거

기본 SQL 서비스는 실행 중이나, 현재 실행 계정은 WORKGROUP의 로컬 계정이다. `localhost`, 로컬 컴퓨터명, Named Pipe 후보가 모두 로그인/SSPI 단계에서 같은 오류를 냈다. SPN 읽기 조회는 LDAP server-down으로 수행할 수 없었고, Kerberos ticket cache도 비어 있었다. Schannel 이벤트에는 `.` 서버명에 대한 인증서 이름 불일치가 남아 있다. 이는 애플리케이션 코드가 아니라 로컬 SQL/Windows 인증·이름 해석 환경의 Hold로 분류한다.

## 통과한 비SQL 검증

- Mock 전체: 50/50 PASS (이번 runner 변경 후 fresh process 1회; 기존 동일 변경 상태 2회 연속 PASS 기록)
- InMemory 전체: 18/18 PASS × 2회 fresh process (기존 동일 변경 상태 5회 연속 PASS 기록)
- `qa:quality:quick`: 7/7 PASS
- readiness: 8/8 PASS, maintenance: 17/17 PASS
- Grid 단위 17/17, AI 파일 단위 14/14, bundle 단위 8/8 PASS
- typecheck, frontend build, bundle budget, .NET build PASS
- .NET 전체: 55 PASS / 7 SQL SSPI 환경 실패
- 기존 대표 headed, Grid 보기/열 너비, 모바일/PDA InMemory, AI 센터, preload/retry 검증은 PASS 기록을 유지한다.

## RC2 READY 필요 조건

1. 관리자 승인 하에 SQL Windows 인증/SPN·인증서·이름 해석 환경을 정상화한다.
2. 동일한 보안 정책으로 SQL mode API smoke가 200 JSON을 반환한다.
3. 제품 UI/API를 통해 SQL 교차 흐름을 fresh process와 새 marker로 3회 연속 PASS한다.
4. 각 실행에서 PC·모바일·PDA·API 값과 `SAL_SOH`·`SAL_SOL`을 대조하고 marker 0 cleanup을 확인한다.
5. 비SQL 회귀와 cleanup, 포트 해제를 다시 확인한다.

보안 완화, SQL 인증 fallback, 다른 DB fallback 또는 직접 SQL DML은 사용하지 않았다.
