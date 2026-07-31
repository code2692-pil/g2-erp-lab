# RC2 SQL 환경 비파괴 진단

## 연결 구성과 실행 경로

- 제품 API와 직접 SQL xUnit은 모두 `G2ERP_DEV_LOCAL_TEST`와 Windows 통합 인증을 사용한다.
- 기본 개발 구성의 SQL 서버 표기는 `.`이다. runner는 환경변수의 연결 문자열을 자식 프로세스에 전달한다.
- 현재 정책의 암호화/인증서 신뢰 옵션은 기존 로컬 개발 구성 그대로이며, 이번 진단에서 `Encrypt` 또는 `TrustServerCertificate`를 변경하지 않았다.
- user secrets 식별자와 비밀 자격 증명 사용은 확인되지 않았다. 비밀번호나 사용자 ID는 문서에 기록하지 않는다.

## 실행 계정·서비스·네트워크

- API와 xUnit은 같은 현재 Windows 로컬 계정으로 실행됐다.
- 호스트는 WORKGROUP 구성이고 도메인 가입 상태가 아니다.
- `MSSQLSERVER`: Running, Automatic, 서비스 계정 `NT Service\\MSSQLSERVER`.
- 기본 TCP 설정은 정적 포트 1433으로 확인됐다. SQL Browser는 Stopped/Disabled이며 기본 인스턴스이므로 Browser 의존 구조가 아니다.
- SQL ERRORLOG 파일은 현재 계정에서 읽기 권한이 없어 내용을 확인하지 못했다.

## SPN·Kerberos·TLS 읽기 결과

- `setspn -Q MSSQLSvc/...` 읽기 전용 질의는 LDAP server-down(0x51)으로 실패했다. SPN은 등록·수정·삭제하지 않았다.
- `klist`에는 cached ticket이 없었다.
- 최근 Schannel event 36884는 SQLCMD 클라이언트가 `.` 서버명에 대해 기대한 인증서 이름과 원격 인증서 이름이 다르다고 기록한다.
- SQL Server 레지스트리의 인증서 지정 값은 비어 있었고, Force Encryption은 비활성으로 확인됐다. 인증서 설치·권한 변경·TLS 정책 변경은 하지 않았다.

## 안전한 process-scope 후보 시험

모든 시험은 `G2ERP_DEV_LOCAL_TEST`, Windows 인증 및 기존 보안 정책을 유지한 child process 환경변수에서만 수행했다. 저장소 설정, user secrets, Windows 서비스, DB 데이터는 바꾸지 않았다.

| 후보 | 결과 | 단계 | 비고 |
| --- | --- | --- | --- |
| `.` | 기존 API/xUnit에서 SSPI 실패 | 로그인 | 재반복하지 않음 |
| `localhost` | SSPI 실패 | 로그인 | target principal / SSPI context |
| 로컬 컴퓨터명 | SSPI 실패 | 로그인 | localhost와 동일 |
| `np:` Named Pipe | SSPI 실패 | 로그인 | 동일 |
| `tcp:127.0.0.1,1433` | DbSetup local allow-list에서 연결 전 차단 | 연결 전 | SQL 접속/DML 없음 |
| `lpc:` | 현 allow-list 밖 | 시험 제외 | 우회를 위한 코드 변경 없음 |

## 결론

서비스 가동 여부와 별개로 현재 로컬 Windows 인증 경로가 SSPI를 생성하지 못한다. SPN/DNS/도메인·Kerberos/인증서 이름 일치 중 하나 이상의 인프라 조건을 관리자 권한으로 확인해야 한다. 제품 API SQL smoke가 200을 반환하기 전에는 SQL E2E를 반복하지 않는다.
