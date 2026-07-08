# 수주등록 ERP 샘플

React + TypeScript + Vite로 만든 웹 ERP 수주등록 화면 샘플입니다. 실제 DB, 사내망, 회사 접속정보 없이 mock 데이터만 사용합니다.

## 기술 스택

- React
- TypeScript
- Vite
- CSS
- 일반 HTML table 기반 그리드

## 주요 기능

- 좌측 메뉴: 영업관리 > 수주관리 > 수주등록
- 조회조건: 회사코드, 수주일자 From/To, 거래처
- 상단 그리드: `SAL_SOH` 수주정보
- 하단 그리드: `SAL_SOL` 수주상세
- `조회`: mock 수주정보와 상세 데이터를 표시
- 수주정보 행 클릭: 선택한 `NO_SO`의 상세 라인 표시
- `신규`: `TEMP_SO_001` 형식의 임시 수주번호 생성
- `행추가`: 선택 수주의 상세 라인 추가
- `행삭제`: 선택 상세 라인 삭제 후 `NO_LINE` 재정렬
- `저장`: 임시 수주번호를 `SOYYYYMM0001` 형식으로 자동채번하고 console에 현재 데이터 출력
- `삭제`: 선택 수주정보와 관련 상세 라인 삭제

## 데이터 조건

- 실제 DB 연결 없음
- API 호출 없음
- `.env` 파일 없음
- 사내 접속정보, 계정, 키, URL 포함 없음
- mock 데이터 위치: `src/features/sales-order/mockData.ts`

## 파일 구조

```text
.
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ vite.config.ts
├─ tsconfig.json
├─ tsconfig.node.json
└─ src/
   ├─ App.tsx
   ├─ main.tsx
   ├─ styles.css
   ├─ vite-env.d.ts
   └─ features/
      └─ sales-order/
         ├─ SalesOrderRegistration.tsx
         ├─ mockData.ts
         └─ types.ts
```

## 로컬 실행

Node.js `20.19.0` 이상이 필요합니다.

```bash
pnpm install
pnpm run dev
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:5173
```

## 빌드 확인

```bash
pnpm run build
```

빌드 결과물은 `dist/`에 생성됩니다. `dist/`는 Git 커밋 대상이 아닙니다.

## 로컬 프리뷰

```bash
pnpm run preview
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:4173
```

## GitHub 업로드 전 확인

```bash
pnpm install
pnpm run build
git status
```

커밋 대상에 포함하면 되는 주요 파일은 다음과 같습니다.

- `src/`
- `index.html`
- `package.json`
- `pnpm-lock.yaml`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.node.json`
- `README.md`
- `.gitignore`
- `vercel.json`

다음 항목은 커밋하지 않습니다.

- `node_modules/`
- `dist/`
- `.env`, `.env.local`, `.env.*.local`
- `*.tsbuildinfo`

## Vercel 배포

1. GitHub에 이 프로젝트를 push합니다.
2. Vercel에서 `Add New... > Project`를 선택합니다.
3. GitHub 저장소를 import합니다.
4. Framework Preset은 `Vite`로 둡니다.
5. Build Command는 `pnpm run build`를 사용합니다.
6. Output Directory는 `dist`를 사용합니다.
7. Environment Variables는 추가하지 않습니다.
8. Deploy를 실행합니다.

`vercel.json`에 동일한 빌드 설정이 들어 있어 Vercel에서 자동 배포할 수 있습니다.

## 외부 검수 안내

배포 후 Vercel Preview 또는 Production URL을 외부 검수자에게 공유하면 됩니다. 이 화면은 mock 데이터만 사용하므로 별도 DB, VPN, 사내 API, 환경변수 없이 브라우저에서 바로 검수할 수 있습니다.

## 자동화 검수용 selector

외부 검수자가 Playwright, 브라우저 자동화, ChatGPT/Codex 브라우저 컨트롤을 사용할 수 있도록 주요 버튼과 행에 안정적인 속성을 부여했습니다.

```text
[data-testid="btn-search"]        조회
[data-testid="btn-new"]           신규
[data-testid="btn-add-line"]      행추가
[data-testid="btn-delete-line"]   행삭제
[data-testid="btn-save"]          저장
[data-testid="btn-delete-order"]  삭제

.header-table tbody tr[data-no-so="SO2026070001"]
.line-table tbody tr[data-no-so="SO2026070001"][data-no-line="1"]
```
