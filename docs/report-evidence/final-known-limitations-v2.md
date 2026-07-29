# 최종 알려진 한계와 운영 전 검증 조건 v2

## Release Blocking

이번 릴리스 후보에서 확인된 Release Blocking은 0건이다.

## Non-Blocking 및 운영 전 조건

- 개발환경 PoC이며 회사 운영 코드·고객 운영환경에는 적용하지 않았다.
- SQL Server는 로컬 테스트 DB에서만 교차 검증했다. 운영 DB의 데이터, 권한, 백업, 성능은 검증 대상이 아니다.
- 실제 Gmail/메일 서버, 외부 LLM, 회사 지식 시스템, MES/PLC는 연결하지 않았다.
- PDF·Office 본문 추출, OCR, STT, 이미지 내용 인식은 제공하지 않는다.
- 모바일/PDA는 브라우저 화면이며 네이티브 앱, SDK, 바코드 스캐너, 오프라인 동기화가 아니다.
- 사용자 인증, 역할 권한, 감사 로그, 동시 수정 충돌 정책, 대량 데이터 성능·보안 부하 검증은 별도 설계가 필요하다.
- Vite production bundle은 약 511kB JS chunk 경고가 있다. 현재 동작 차단은 아니나 code splitting 검토 대상이다.
- InMemory API cold start와 Playwright 정리 시간은 환경에 따라 흔들릴 수 있다. 실패 assertion과 runner timeout은 분리해 판단해야 한다.

## 범위 밖

BOM, 공정경로, 생산실적, 재고, 출하, 검사, 실제 MES·PLC, 신규 업무 모듈은 이번 PoC 범위 밖이다.
