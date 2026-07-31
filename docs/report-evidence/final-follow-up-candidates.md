# 개발 동결 후 후속 후보

아래 원래 후보는 순서를 유지한다. Gate 12-11에서 업무 규칙과 외부 환경이 필요 없는 **초기 화면 진입용 생산 번들 분할**을 별도 11번 후보로 선정·구현·검증했다. 1~10번은 삭제하거나 자동 실행하지 않으며, 필요한 의사결정이 준비될 때만 다시 평가한다.

1. **회사 규칙 기반 UAT 패키지** — 수주·발주·작업지시의 실제 코드 체계와 승인 기준을 문서화하고 로컬 안전 DB에서 검증한다. `DEFERRED_BUSINESS_DECISION`
2. **인증·권한·감사 로그** — 사용자·역할·변경 이력 요구사항을 먼저 확정한다. `DEFERRED_POLICY`
3. **동시 수정 충돌 정책** — version, optimistic concurrency, 사용자 안내 기준을 설계한다. `DEFERRED_BUSINESS_DECISION`
4. **대량 데이터 성능과 Grid 최적화** — 실제 규모와 목표 응답 시간을 정한 뒤 paging/virtualization을 검토한다. `DEFERRED_ENVIRONMENT`
5. **메일 연동 검토** — 읽기 전용 수신, 보안 범위, 개인정보, 사람 확인 절차를 명시한다. `DEFERRED_EXTERNAL_SERVICE`
6. **AI 외부 연동 검토** — 데이터 반출, 보존, 비용, 모델, human approval을 먼저 합의한다. `DEFERRED_EXTERNAL_SERVICE`
7. **문서 분석 확장** — PDF·Office·OCR·STT는 파일 보안과 정확도 평가를 포함해 별도 PoC로 분리한다. `DEFERRED_DEPENDENCY`
8. **모바일/PDA 현장 검증** — 장비, 스캐너, 네트워크, 오프라인 정책을 정한 뒤 별도 검증한다. `DEFERRED_ENVIRONMENT`
9. **BOM·공정·재고 등 신규 업무 모듈** — 현재 ERP 핵심 흐름과 독립된 후속 과제로 분리한다. `DEFERRED_SCOPE`
10. **CI/원격 백업** — 테스트 시간·권한·branch policy를 정한 뒤 GitHub Actions 또는 PR 흐름을 별도 검토한다. `DEFERRED_POLICY`
11. **초기 화면 진입용 생산 번들 분할** — 비기본 화면을 필요 시 불러오고, 로딩·실패·재시도 상태를 제공한다. `SELECTED` → `IMPLEMENTED` → `VERIFIED` (Gate 12-11)

이미 완료되어 재선정하지 않은 후보: 의도 기반 사전 로딩·번들 예산(Gate 12-12), Grid 열 표시·순서 보기 설정 저장(Gate 12-13), Playwright 묶음 실행 종료 정리(Gate 12-14).

15. **상세 Grid 열 너비 조절 및 보기 설정 저장** — 수주·발주·작업지시 상세 Grid에서 열별 너비를 48~480px로 조정하고, 화면별 브라우저 설정에만 저장한다. `SELECTED` → `IMPLEMENTED` → `VERIFIED` (Gate 12-15)

어느 후보도 자동으로 다음 개발을 시작한다는 뜻이 아니다. 릴리스 후보 고정 후 사용자가 선택한 한 항목만 새 관문으로 연다.
