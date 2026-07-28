# 최종 미해결 항목과 한계

## Release Blocking

현재 확인된 Release Blocking 항목은 없다. Mock 50/50, InMemory 18/18, Gate 9 3/3, headed 기본·확장 시나리오가 통과했다.

## Non-Blocking

- InMemory API의 cold start가 표준 runner의 고정 60초 대기와 충돌할 수 있다. 별도 기동과 HTTP readiness 확인으로 제품 테스트와 분리 가능하다.
- GitHub Actions, 원격 Git 백업, Codex 사전개발 workflow는 실제 원격 실행하지 않았다.
- SQL Server 실제 CRUD와 고객 운영 코드·데이터·권한은 검증하지 않았다.
- 고객 운영 환경, MES/PLC 연동, 배포 절차는 PoC 범위 밖이다.
- Vite가 Playwright 산출물 변경을 감지해 개발 서버를 재로딩하는 현상이 있어, 긴 전체 명령은 worker 1 spec 분할로 검증했다. timeout·retry는 늘리지 않았다.

## Backlog

- 추가 ERP 화면과 모바일/PDA
- 실제 DB/API/MES/PLC 연동
- BOM·공정·생산실적·재고·출하·검사 업무 모듈
- 자동 Pull Request, 자동 commit 사전개발, 운영 배포 자동화
- 회사 코드·운영 데이터 기준의 적용성 검토와 UAT

Non-Blocking과 Backlog는 현재 PoC의 실패가 아니다. 기능 개발 동결 후에는 Release Blocking 결함만 근거를 갖춘 별도 작업으로 다룬다.
