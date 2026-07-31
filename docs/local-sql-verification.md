# 로컬 SQL 검증 브리지

Codex 실행 환경은 Windows 사용자 세션의 SQL Server TLS 인증 경로를 그대로 사용할 수 없다. 따라서 SQL repository, 연결 문자열, runner, SQL 통합 테스트, DB 스키마·스크립트, 수주·발주·작업지시 SQL 경로를 변경한 뒤에는 사용자 Windows 세션의 worker에 검증을 요청한다.

일반 UI 또는 순수 TypeScript 변경에는 전체 SQL 검증이 필요하지 않다.

## 최초 한 번 설정

일반 Windows PowerShell에서 저장소 루트로 이동한 뒤 실행한다.

```powershell
pnpm run qa:sql:worker:install
```

설치 전에 경로와 Startup 실행 명령만 확인하려면 다음 읽기 전용 명령을 사용한다.

```powershell
pnpm run qa:sql:worker:install:validate
```

이 명령은 현재 사용자 Startup 폴더에 이 저장소 전용 worker만 등록하고 즉시 시작한다. 관리자 권한, Windows 서비스, SQL Server 설정 변경은 사용하지 않는다.

동작 확인은 다음과 같다.

```powershell
pnpm run qa:sql:request
Get-Content .local-runtime/sql-verify/result.json
```

이후 로그인할 때 worker가 자동 시작된다. 사용자는 SQL 관련 변경마다 수동 검증 명령을 반복할 필요가 없다. Codex는 아래 요청 명령으로 worker에만 작업을 전달한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/request-local-sql-verify.ps1 -Reason "sales repository change" -Wait
```

worker 상태와 로드된 script hash는 읽기 전용으로 확인할 수 있다.

```powershell
pnpm run qa:sql:worker:status
```

worker는 유휴 상태에서 script hash 변경을 감지하면 새 worker를 먼저 시작하고, 준비 확인 뒤 기존 worker를 종료한다. 검증 중에는 교체하지 않는다.

## 검증 내용과 결과

worker는 요청 당시 branch와 HEAD가 현재 저장소와 같을 때만 다음을 수행한다.

1. `tcp:localhost,1433` Windows 인증, 암호화 및 인증서 신뢰 조건의 SQL TCP/TLS probe
2. 수주·발주·작업지시 marker의 실행 전 잔여 확인
3. SQL runner와 읽기 전용 API smoke
4. 발주·수주·작업지시 SQL 통합 테스트 및 연결 정책 테스트
5. 실행 후 같은 marker의 잔여 확인

결과는 다음 파일에 원자적으로 기록된다.

```text
.local-runtime/sql-verify/request.json
.local-runtime/sql-verify/result.json
.local-runtime/sql-verify/logs/<request-id>.log
.local-runtime/sql-verify/worker.pid
```

예시 결과:

```json
{
  "requestId": "b5c2f9e0-0000-0000-0000-000000000000",
  "status": "PASS",
  "exitCode": 0,
  "branch": "chore/example",
  "head": "commit-hash",
  "markerResidue": {
    "preTest": [],
    "postTest": []
  },
  "logPath": ".local-runtime/sql-verify/logs/b5c2f9e0-0000-0000-0000-000000000000.log"
}
```

`STALE_REQUEST`는 요청 생성 뒤 branch 또는 HEAD가 바뀌었다는 뜻이며, 이 경우 SQL 검증을 실행하지 않는다.

## 안전 원칙

- 모든 probe와 테스트는 암호화 연결만 사용한다.
- worker와 검증 스크립트 자체는 SQL data manipulation 또는 schema 변경을 수행하지 않는다. 실행되는 SQL 통합 테스트의 생성·정리 동작은 기존 테스트 코드의 범위다.
- 검증 전 marker가 남아 있으면 테스트를 시작하지 않고 실패한다.
- 검증 후 marker가 남아 있어도 자동 삭제하지 않는다. 남은 행은 원인을 확인해야 하며, 실제 업무 데이터와 구분되지 않는 범위 삭제는 안전하지 않다.
- 테스트가 생성한 행의 정리는 각 SQL 통합 테스트의 `finally` cleanup이 담당한다.
- 5173/5080이 미리 사용 중이면 검증은 시작하지 않으며, worker는 runner가 시작한 프로세스 트리만 종료한다.

## 수동 실행과 worker 관리

수동 전체 검증은 다음 명령으로 가능하다.

```powershell
pnpm run qa:sql:local
```

worker 중지·재시작·제거 명령은 다음과 같다.

```powershell
pnpm run qa:sql:worker:stop
pnpm run qa:sql:worker:start
pnpm run qa:sql:worker:uninstall
```

검증이 실행 중이면 worker 중지·제거는 검증 프로세스를 강제 종료하지 않고 결과가 기록될 때까지 기다리도록 안내한다.

제거는 Startup 등록과 해당 worker만 중지한다. 로그와 결과는 기본적으로 보존하며, 필요할 때만 아래 명령으로 이 저장소의 런타임 파일을 함께 제거한다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/uninstall-local-sql-verify-worker.ps1 -RemoveRuntime
```
