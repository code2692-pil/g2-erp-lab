# RC2 SQL 환경 복구 체크리스트

## 사용자 직접 확인

- SQL Server 기본 인스턴스 서비스가 실행 중인지 확인한다.
- 현재 컴퓨터명, 인스턴스명, Windows 로그인 계정, VPN/회사 네트워크 상태를 기록한다.
- 이전에 SQL 검증이 통과했던 실행 바로가기/명령과 현재 실행 경로가 같은지 확인한다.
- 최근 Windows 비밀번호 변경, 네트워크 전환 또는 재부팅 이후 동일 증상인지 기록한다.

## 관리자·인프라 담당 확인

아래는 확인 항목이며, 이 저장소의 자동화가 실행하거나 변경하지 않는다.

- SQL 서비스 계정과 `MSSQLSvc` SPN의 소유자·중복 여부
- 서버명, FQDN, 별칭, CNAME, SPN의 일치 여부
- 도메인 연결, Kerberos ticket, 시간 동기화, LDAP 접근성
- SQL 인증서 Subject/SAN, private key 및 SQL 서비스 계정 권한
- Schannel 및 SQL Server 인증/로그인 이벤트
- SQL Server Configuration Manager의 TCP/Named Pipes 상태와 서비스 재시작 필요성

변경 전에는 현 설정을 백업하고 해당 조직의 승인 절차를 거쳐야 한다. SPN 등록/삭제, 서비스 계정 변경, 인증서 교체, DNS·방화벽·레지스트리 변경은 이 작업 범위 밖이다.

## 복구 후 최소 재실행

1. 기존 보안 정책으로 SQL mode API readiness와 안전한 GET을 확인한다.
2. `pnpm run test:e2e:api:sqlserver`를 새 marker와 fresh process로 실행한다.
3. 제품 UI/API로만 PC→모바일→PDA 수량 교차 흐름을 수행한다.
4. 각 실행에서 API와 `SAL_SOH`·`SAL_SOL`의 marker 조회를 대조하고 제품 UI/API로 cleanup한다.
5. marker 0을 확인한 3회 연속 PASS일 때만 RC2 READY를 재평가한다.

직접 SQL INSERT/UPDATE/DELETE, SQL 인증 fallback, 암호화 비활성화, 인증서 신뢰 강제는 성공 기준이 아니다.
