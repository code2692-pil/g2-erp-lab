# 관문 12-7 파일 인텔리전스 구현 요약

## 변경 목적

AI 솔루션 센터가 단순 파일 첨부 표시를 넘어, ERP/MES 참고 파일을 안전한 범위에서 분류·요약하고 민감정보 후보를 제거한 근거만 추천에 사용하도록 확장했습니다.

## 확정 범위

- 16개 상위 분류와 실행 파일 선차단
- TXT·Markdown·LOG 내용 분석
- CSV·JSON·XML 구조 분석
- 이미지·오디오·비디오 메타데이터 분석
- PDF·Office·압축·미확인 바이너리 설명형 처리
- 파일별 포함/제외·메모·경고·처리 상태
- 민감정보 후보 탐지와 결과·내보내기 전 구간 마스킹
- ERP/MES 실전 시나리오 10개와 확인 기반 적용
- 검토 패키지 1.1 출력 및 1.0 불러오기 호환

## 비영향 범위

Backend API, DTO, 데이터베이스, SQL, 회사·고객 시스템, 운영 배포에는 변경이 없습니다. 파일 원문과 바이너리는 서버로 전송하거나 저장하지 않습니다.

## 최종 검증 근거

- 파일 인텔리전스 Node 단위 테스트: 14/14
- AI 솔루션 센터 Mock E2E: 최종 목록 40/40
- 기존 ERP Mock E2E: 최종 목록 50/50
- InMemory API E2E: HTTP readiness 200 후 18/18
- 자동 유지보수 Node 테스트: 9/9
- quick 품질 Gate: 6/6
- headed 핵심 시나리오: CSV, LOG·가림, 이미지·메모, 검사 재작업, 검토 패키지 5/5
- 해상도: 1920×1080, 1440×900, 1366×768, 1280×720
- frontend build·backend solution build·`git diff --check`: 통과

4-worker 또는 장시간 브라우저 실행 중 일부 테스트는 제품 assertion 완료 후 Chromium GPU transient/context 종료 timeout이 발생했습니다. 동일 항목은 생성 artifact를 정리하고 worker 1의 fresh process로 다시 실행해 모두 통과했으며, 제품 timeout·retry·assertion은 변경하지 않았습니다.
