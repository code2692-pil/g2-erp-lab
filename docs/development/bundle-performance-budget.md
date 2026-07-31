# 화면 번들 성능 예산 운영 기준

## 일상 확인 명령

```powershell
pnpm run build
pnpm run check:bundle-budget
pnpm run test:bundle-budget
```

`build:budget`은 build 뒤에 예산 검사를 연속 실행한다. 품질 관문 quick 흐름에서는 이미 생성된 `dist`를 재사용하여 중복 build 없이 예산 검사만 추가한다.

## 무엇을 검사하는가

- 엔트리 JavaScript의 raw bytes와 gzip bytes
- 엔트리에서 정적 import로 도달 가능한 초기 JavaScript의 raw/gzip 합계
- 초기 묶음에 비기본 화면(발주, 작업지시, 개발 데이터, AI, 모바일/PDA 수주) 코드가 섞였는지
- 가장 큰 동적 청크의 경고선 초과 여부
- manifest 또는 budget 설정의 누락·형식 오류

`raw`는 실제 파일 크기, `gzip`은 같은 산출물 파일을 Node로 gzip 압축한 크기다. 두 값을 함께 보아야 전송량과 파싱 대상 크기를 모두 비교할 수 있다.

## 화면 추가 또는 변경 원칙

1. 새 비기본 화면은 `src/screenModules.ts`에 importer 하나로 등록하고 React lazy와 preload가 그 importer를 공유하게 한다.
2. 기본 수주 진입 경로에 해당 화면을 정적 import하지 않는다.
3. 메뉴가 있는 데스크톱 화면이면 mouse, focus, pointer 의도만 연결한다. preload에서는 업무 API나 데이터 조회를 호출하지 않는다.
4. 예산 설정의 `nonDefaultScreenSources`와 marker를 함께 등록하고 Node 단위 테스트를 보완한다.
5. 실제 build 결과를 확인한 뒤 필요성이 입증된 경우에만 예산을 조정한다. 단순 통과를 위해 예산을 올리지 않는다.

## 실패 해석

- `entry` 또는 `initial total` 초과: 기본 진입 경로의 코드가 커졌다. 정적 import, 공통 의존성, 대형 라이브러리 유입을 먼저 확인한다.
- `initial non-default screen modules` 실패: 지연 대상 화면이 기본 번들에 섞였다. `App.tsx`와 공통 barrel export의 정적 import를 확인한다.
- `dynamic chunk` INFO 경고: 배포를 막지는 않지만 해당 화면의 의존성을 검토한다.
- manifest/config 오류: 산출물 또는 설정 형식이 예상과 다르다. 먼저 `pnpm run build`를 다시 실행하고 설정을 확인한다.

## 최소 검증 흐름

화면 지연 로딩을 변경할 때는 `pnpm run typecheck`, `pnpm run build`, `pnpm run check:bundle-budget`, `pnpm run test:bundle-budget`와 관련 Mock/InMemory E2E를 실행한다. 정적 import 회귀가 우려되면 임시 변이를 적용해 build는 성공하지만 예산 검사가 실패하는지 확인하고, 즉시 원복한 뒤 다시 통과시킨다.
