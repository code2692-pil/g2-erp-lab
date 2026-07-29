# PC·모바일·PDA 수주등록 통합 검증 요약

## 목적

관문 12-9는 세 수주등록 화면이 별도 데이터나 별도 동기화 기능 없이 동일한 수주 API와 Repository를 사용한다는 점을 실제 흐름으로 확인했다. 대상은 로컬 PoC 환경이며, 고객·운영 데이터에는 접근하지 않았다.

## 공통 구조

```text
PC 수주등록 ─┐
모바일 수주등록 ├─ /api/sales-orders ─ SalesOrderRepository ─ SAL_SOH / SAL_SOL
PDA 수주등록 ─┘
```

- API 모드: 세 화면이 동일한 조회·생성·수정·삭제 API와 DTO를 사용한다.
- Mock 모드: 세 화면이 하나의 메모리 수주 데이터 서비스 인스턴스를 공유한다.
- SQL Server 모드: 기존 `SqlServerSalesOrderRepository`가 `POC.SAL_SOH`, `POC.SAL_SOL`을 사용한다.
- 새 API, DTO, 테이블, 스키마, SQL 스크립트, 모바일 전용 저장소는 추가하지 않았다.

## 실제 SQL Server 교차 흐름

대상 DB는 로컬 테스트 DB `G2ERP_DEV_LOCAL_TEST`였다. 테스트 전용 비고 표식으로 수주 한 건을 식별했고, 생성·수정·삭제는 모두 브라우저의 제품 UI/API 경로로 수행했다.

| 순서 | 화면 | 동작 | 확인 결과 |
| --- | --- | --- | --- |
| 1 | PC | 거래처·품목·수량 3·단가 1,000으로 신규 저장 | API POST 201, 문서번호 발급 |
| 2 | 모바일 | 같은 문서를 조회해 수량을 7로 수정 | API PUT 200 |
| 3 | PDA | 같은 문서를 다시 조회해 수량을 9로 수정 | API PUT 200 |
| 4 | PC | 재조회 | 수량 9, 합계 9,900 표시 |
| 5 | SQL SELECT | Header·Line 읽기 확인 | `SAL_SOH` 1건, `SAL_SOL` 1건; 수량 9, 단가 1,000, 합계 9,900 |
| 6 | PDA | 같은 문서 삭제 | API DELETE 204 |
| 7 | PC·모바일·PDA | 문서 재조회 | 세 화면 모두 조회 불가 |
| 8 | SQL SELECT | 잔존 데이터 확인 | 전용 표식의 `SAL_SOH` 0건, `SAL_SOL` 0건 |

직접 SQL은 위 확인을 위한 SELECT만 실행했다. INSERT·UPDATE·DELETE, 스키마 변경, 운영 DB 접근은 하지 않았다.

## 비동기·오류 안정화

`CompactSalesOrderPage`의 조회는 AbortController와 최신 조회 순번을 사용한다. 따라서 모바일·PDA 모두 다음을 만족한다.

- A 조회 뒤 B 조회를 실행하면 A 요청을 취소하고 B 응답만 화면에 반영한다.
- 조회 중 PC·모바일·PDA로 전환하면 이전 화면의 늦은 응답이 다음 화면 상태를 바꾸지 않는다.
- 저장·삭제는 기존 단일 실행 잠금으로 첫 요청만 수행한다.
- 모바일 400, PDA 500, 삭제 실패 후에도 입력·선택 문서·수정됨 상태를 유지하고 재시도할 수 있다.

## 자동 검증 결과

| 검증 | 결과 |
| --- | --- |
| 모바일·PDA Mock 전체 | 7/7 PASS |
| 모바일·PDA API 하드닝 집중 | 4/4 PASS |
| InMemory 실제 UI 교차 생성·수정·삭제 | 1/1 PASS |
| 실제 SQL Server 교차 생성·수정·삭제 | 2/2 PASS |
| Mock 전체 회귀 | 50/50 PASS |
| InMemory API 전체 회귀 | 18/18 PASS |
| PC 수주등록 기존 회귀 | 31/31 PASS (Mock 전체에 포함) |
| AI 솔루션 센터 메뉴 전환 smoke | 1/1 PASS |
| 반응형 headed 점검 | 1/1 PASS, 모바일 4개·PDA 3개 크기 |
| 유지보수 quick 게이트 | 6/6 PASS |

## 범위와 DB 영향

- 제품 기능 영향: 모바일·PDA 조회의 최신 응답 보장과 화면 전환 시 취소 보호를 강화했다.
- DB 영향: 테스트 중 제품 API로 한 건을 생성·수정·삭제했으며, 종료 SELECT에서 Header·Line 모두 0건을 확인했다.
- 데이터 구조 영향: 없음.
