# RC2 pre-merge hardening 기록

## 목적과 범위

이 기록은 RC2 병합 전 안전성 작업의 구현·검증 대응표와 잔여 위험을 한곳에 정리한다. 제품 API, DTO, DB 스키마, SQL Server 설정, 외부 글꼴·CDN은 이 범위에서 변경하지 않는다.

## 기능·테스트 대응표

| 영역 | 주요 구현 | 검증 경로 | DB/worker 필요 | 잔여 위험 | 병합 차단 |
| --- | --- | --- | --- | --- | --- |
| 발주 SQL cleanup | 테스트별 `CD_FIRM=1000`와 생성한 `PO-R/PO-S GUID`만 cleanup | SQL 통합 테스트와 header/detail residue 0 확인 | local SQL worker | 실제 SQL 환경에서 최종 확인 필요 | 예 |
| 수주 SQL cleanup | GUID 단위 cleanup, body/cleanup 동시 실패 보존 | SQL 통합 테스트와 residue 확인 | local SQL worker | 없음 | 아니오 |
| 작업지시 SQL cleanup | exact marker와 child→parent delete | SQL 통합 테스트와 residue 확인 | local SQL worker | 없음 | 아니오 |
| SQL 연결 정책 | 암호화 연결만 허용 | `SqlServerConnectionFactoryTests` | 아니오 | 없음 | 아니오 |
| RC2 preflight | 정적·빌드·unit·연결 정책 후 기존 worker 요청 | `pnpm run qa:rc2:preflight` | 마지막 단계만 worker | worker 미설치/실행 중이면 명확히 실패 | 예 |
| Grid·입력 | 원자적 붙여넣기, editable/read-only 구분, 보기 설정 | Grid unit/E2E | 아니오 | 초고속 입력의 브라우저별 차이 | 아니오 |
| 미저장 변경 | 전역 dirty registry, 메뉴·화면 이동 확인, Back/Forward 복원·재생, dirty/saving `beforeunload` 보호 | 단위·Mock·InMemory E2E | 아니오 | native `beforeunload` 문구는 브라우저가 제어 | 아니오 |
| API 수명주기 | abort, 최신 응답 우선, mutation lock | mobile/PDA hardening E2E | InMemory 선택 | PC 화면의 지연 응답 회귀는 추가 관찰 대상 | 아니오 |
| AI 파일 분석 | 브라우저 내 분석, redaction, review package 보호 | unit/E2E | 아니오 | 파일명 정책과 심층 중첩 파일은 후속 범위 | 아니오 |
| 모바일/PDA | PC·모바일·PDA 공통 API 계약, 44px 조작영역 | Mock/InMemory/SQL E2E | SQL은 선택 | 동시 편집 충돌 정책은 별도 설계 필요 | Conditional |

## UI·UX benchmark와 반영

| 출처 | 관찰한 패턴 | G2 ERP 적용 | 적용하지 않은 이유 / rollback 영향 |
| --- | --- | --- | --- |
| SAP Fiori | 업무 흐름에 맞춘 표·폼 분리와 사용자별 Grid 개인화 | 기존 Grid 보기 설정, desktop Grid·mobile card 분리를 유지 | 전체 메뉴/업무 단계 재설계는 업무 합의가 필요하여 제외 |
| Microsoft Dynamics 365 | 일관성, 효율, 명확한 피드백 | 공통 상태·focus·입력·버튼 규칙을 공통 CSS로 유지 | 역할별 dashboard는 PoC 범위 밖 |
| Microsoft Fluent | 짧은 행동형 버튼, primary action의 명확한 우선순위, keyboard focus | 기존 primary/secondary/danger 구분과 3px focus ring 보강 | 새 component library 도입은 제외 |
| Material Design | 입력창 stroke 대비, label과 helper text의 구분 | textarea·readonly·invalid 상태의 대비와 여백을 보강 | Material 테마 전체 교체는 제외 |
| WCAG 2.2 | focus appearance, target size, reduced motion, high contrast | focus scroll margin, `prefers-contrast`, `prefers-reduced-motion`, 모바일 44px 조작영역 유지 | browser history 처리에는 전역 상태 설계가 필요하여 제외 |
| Odoo | 검색·필터·그룹과 화면별 정보 밀도 | 기존 검색 panel과 Grid 보기 설정을 유지 | 저장 필터·그룹 기능은 업무 요구 확인 후 별도 범위 |
| Oracle Redwood | 공통 토큰으로 일관된 enterprise UI 확장 | 색상·여백·control 토큰을 재사용 | Redwood 자산·컴포넌트 복제는 제외 |

참고 링크: SAP Fiori, Microsoft Dynamics 365, Microsoft Fluent, Material Design, WCAG 2.2, Odoo, Oracle Redwood의 공개 디자인·접근성 문서만 참조했다. 타사 화면·CSS·아이콘·문구·자산은 복제하지 않았다.

## 자동 적용한 UI 변경

- 외부 다운로드 없이 Windows/Korean 시스템 글꼴 fallback을 우선해 한글·영문·숫자 가독성을 안정화했다.
- Grid 빈 상태와 모바일 빈 상태의 줄 간격을 통일했다.
- textarea를 공통 focus/대비 규칙에 포함했다.
- focus된 control이 모바일 sticky action 아래에 가려지지 않도록 scroll margin을 적용했다.
- 고대비 환경에서 카드·Grid 경계와 선택 행 표식을 강화했다.
- 감소 모션 환경에서 scroll/transition/animation을 최소화했다.

이 변경은 공통 CSS 한 파일에만 있으며, 업무 데이터·저장 동작·API 호출·화면 구조를 바꾸지 않는다. UI commit 하나를 `git revert`하면 전체를 되돌릴 수 있다.

## 2026-07-31 RC2 전달 체크리스트

- [x] `feat/rc2-unsaved-navigation-guard-v1` / `19dff36c80490b98cddf7c4b44dd1f63c3d70e68`에서 작업 트리 clean 및 5173/5080 비점유 확인
- [x] production `/development-data` 직접 경로를 수주등록(`/`)으로 정규화하고 메뉴·API 미노출, history entry 교체, Back 비재진입을 E2E로 확인
- [x] TypeScript, production build, bundle budget, .NET build(경고 0·오류 0), 비SQL .NET 49/49 통과
- [x] Mock core 50/50, InMemory core 18/18, Mock UX 71/71, production direct-route 1/1, InMemory mobile/PDA 6/6 통과
- [x] SQL worker request `38165ebd-fd94-4484-8e1b-7aabada008e8` PASS: encrypted TCP/TLS, API smoke, SQL 통합, mobile/PDA cross, marker 11개 scope 전후 0건
- [x] runner 종료 및 5173/5080 해제 확인
- [x] 최종 판정: **PUSH READY**

## RC2 preflight 체크리스트

- [ ] 작업 트리 clean 확인(개발 중 검증만 `-AllowDirty` 허용)
- [ ] Git whitespace 및 package.json 확인
- [ ] SQL integration test에 prefix cleanup·평문·평문 우회가 없는지 확인
- [ ] TypeScript typecheck와 production build
- [ ] .NET solution build와 SQL connection-policy test
- [ ] Grid·AI 단위 테스트
- [ ] 기존 local SQL worker로 TCP/TLS·API smoke·SQL integration·marker residue 검증
- [ ] 결과가 `RC2 PREFLIGHT: PASS`, worker result `PASS`, marker residue 0인지 확인
- [ ] 5173/5080이 해제됐는지 확인

## 잔여 위험과 별도 설계 항목

- 앱 내 Back/Forward와 화면 이동은 전역 dirty registry·history 재생으로 보호한다. 다만 브라우저 native `beforeunload`의 사용자 지정 문구와 실제 표시 여부는 브라우저 표준이 제어하며, 이를 제품 코드로 강제하지 않는다.
- 모바일/PC 동시 수정 충돌 정책, 역할 기반 dashboard, 저장된 검색 조건, 실제 운영 DB 성능·권한·감사는 PoC 범위 밖이다.
- SQL worker는 local development DB와 설치된 일반 사용자 worker에 한정된다. worker 결과가 실패하면 자동 재시도·자동 DELETE를 하지 않는다.
