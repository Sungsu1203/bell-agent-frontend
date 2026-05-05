# 개발자 가이드 (Bell Agent · frontend)

이 문서는 `frontend` Next.js UI 작업 시 알아야 할 구조·관습·운영 노하우를 정리합니다.
백엔드(`writer_project`)의 `README-dev.md`와 짝이 되는 문서로, 톤·구조를 의도적으로 동일하게 유지합니다.

---

## 1) 폴더 구조 & 의존 규칙

```
D:\Bell_Agent\frontend
│
├─ app/                       # Next.js App Router (Next 16)
│  ├─ layout.tsx                  # 루트 레이아웃 (lang=ko, Pretendard CDN, metadata)
│  ├─ page.tsx                    # 메인 페이지 — 모든 페이지-수준 상태의 단일 진입점
│  ├─ globals.css                 # Tailwind v4 + 디자인 토큰(:root) + 인쇄(@media print)
│  ├─ favicon.ico
│  ├─ StatusBar.tsx               # ⚠ 현재 page.tsx에서 import 안 됨 (정리 후보 §12-1)
│  └─ app_structure.txt           # ⚠ CP949 깨진 tree 출력 (정리 후보 §12-1)
│
├─ components/                 # UI 컴포넌트 (모두 "use client")
│  ├─ Header.tsx                  # 상단 헤더 (프로젝트명·상태 배지·전체 보고서 Word 다운로드)
│  ├─ Sidebar.tsx                 # 좌측 (자료 / 목차 / 미션 카드)
│  ├─ WorkflowStepper.tsx         # 5단계 진행 표시 (prepare/mission/outline/write/review)
│  ├─ ReportCanvas.tsx            # 본문 영역 — 마크다운 렌더, 인용 칩, 액션(Word/PDF/복사)
│  ├─ SourcePanel.tsx             # 우측 출처 상세 (인용 칩 클릭 시 열림)
│  ├─ ReviewPanel.tsx             # review 단계 자동 점검 화면
│  └─ LogPanel.tsx                # 화면 하단 고정 로그 콘솔 (펼치기/자동 스크롤)
│
├─ lib/                        # 비-UI 로직 (브라우저 환경 가정, 외부 I/O 격리)
│  ├─ api.ts                      # 백엔드 FastAPI 호출 파사드 — fetch는 모두 여기서
│  ├─ data.ts                     # UI 도메인 타입 + 백엔드→UI 변환 + 검토(reviewReport) 로직
│  ├─ markdown.ts                 # 마크다운 → 블록/푸트노트 파서 (캔버스·출처 패널 공유)
│  └─ useLogs.ts                  # /api/logs 폴링 훅 (커서 기반)
│
├─ public/                     # 정적 자산 (현재 next.js 기본 svg만)
├─ next.config.ts              # 빈 설정 (Next 기본값 사용)
├─ tsconfig.json               # strict + paths "@/*" → "./*"
├─ eslint.config.mjs           # next/core-web-vitals + next/typescript
├─ postcss.config.mjs          # @tailwindcss/postcss 단일 플러그인
├─ package.json                # name=bell-agent-ui, scripts: dev/build/start/lint
├─ structure.txt               # ⚠ 58KB 디버그 덤프 (정리 후보 §12-1)
└─ .gitignore
```

의존 방향(순환 금지):

```
app/page.tsx        ← 페이지 상태 + 사이드 이펙트 (useEffect 폴링) 의 유일한 보유자
   │
   ├─→ components/* ← 받은 props와 콜백만 사용. fetch 직접 호출 금지.
   │       │
   │       └─→ lib/markdown.ts (ReportCanvas + SourcePanel 공유)
   │
   └─→ lib/api.ts   ← 모든 백엔드 fetch 의 단일 진입점
           ↑
           └─ lib/{data,useLogs}.ts 가 같은 api.ts 사용

```

규칙:
- **`components/*` 에서 `fetch` 직접 호출 금지** → `lib/api.ts` 함수만 사용
- **`components/*` 끼리 직접 import 금지** (현재 위반 0건). 컴포넌트는 props로만 통신
- **`lib/*` 는 React 훅 외 React import 금지** (현재 `useLogs.ts` 만 React, 나머지는 순수 함수)
- **`@/*` path alias 사용** (예: `@/components/Header`, `@/lib/api`) — 상대 경로 `../../` 금지

---

## 2) 환경변수

프론트엔드는 빌드 타임에 인라인되는 `NEXT_PUBLIC_*` 만 사용합니다.

| 변수 | 기본값 | 사용처 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` | `lib/api.ts:4`, `app/StatusBar.tsx:18`(미사용) |

규칙:
- 다른 모듈에서 `process.env` 직접 접근 금지 → 새 변수 추가 시 `lib/api.ts` 또는 단일 파일에서 모음
- `.env*` 는 git에 안 올라감 (`.gitignore` 규칙). 새 환경 변수 추가 시 본 표 갱신 의무
- `NEXT_PUBLIC_` prefix가 없으면 클라이언트 번들에서 `undefined` — 서버 컴포넌트에서만 읽어야 함 (현재는 전부 클라이언트 컴포넌트라 prefix 필수)

---

## 3) 데이터 흐름 그림

**[페이지 마운트] → [폴링] → [상태 분배] → [렌더]**

```
app/page.tsx
  │
  ├─[mount]→ refreshAll() 1회
  │
  └─[interval]→ refreshAll() 매 N초 (running/writing=2s, idle=8s)
                    │
                    └─ Promise.all([
                         fetchOutline(),  →  /api/outline   → items[]
                         fetchFiles(),    →  /api/files     → FileMeta[]
                         fetchState(),    →  /api/state     → StateResponse
                       ])
                          │
                          ▼
                    lib/data.ts 의 변환 함수
                       buildSections(outline, files, state)   → Section[]
                       buildWorkflow(state, files, ..., sections) → WorkflowState
                       buildProject(state, filesCount)        → Project
                          │
                          ▼
                    setSections / setWorkflow / setProject
                          │
                          ▼
                    Header / Sidebar / WorkflowStepper / ReportCanvas …
```

**[활성 섹션 본문 fetch]**

```
activeSectionId 변경 → useEffect → fetchFileContent(fileId)
                                       │
                                       ▼
                                   setActiveBody(text)
                                       │
                                       ▼
                                   ReportCanvas → parseDocument(body)
                                       │
                                       ├─ contentBlocks → 단락/리스트/표/헤딩 렌더
                                       └─ footnotes → FootnotesPanel + 인용 매칭 소스
```

**[검토 단계 일괄 fetch]**

```
sections 배열이 바뀔 때마다 → 모든 fileId 가진 섹션을 Promise.all 로 한 번에 fetch
                                       │
                                       ▼
                                   allBodies: Record<id, text>
                                       │
                                       ▼
                                   reviewReport(sections, bodyMap) → ReportReview
```

**[명령 실행 흐름]**

```
사용자 입력 (캔버스 하단 입력란 또는 sidebar [write] 버튼)
  │
  └─→ runCommand({ input, options })  →  POST /api/run
        │ 예: "write: <섹션제목>"  ← 백엔드 fast-path 발동 (§7)
        │     "최신 자료로 RAG 업데이트"
        │
        └─[성공]→ refreshAll() 즉시 → state phase 변화 감지
                                                │
                                                └─ phase=writing → 폴링 주기 2s 로 단축
```

**[로그 폴링 (독립 훅)]**

```
LogPanel mount → useLogs(true) → 2초마다 GET /api/logs?cursor=N
                                                │
                                                └─ next_cursor 갱신 + lines append
                                                    (MAX 1000 줄, 초과 시 앞에서 자름)
```

---

## 4) 공개 API(파사드)만 사용

- **`lib/api.ts`**: 외부에서는 이 파사드만 사용
  - `fetchHealth()` — `/api/health`
  - `fetchState()` — `/api/state` (StateResponse: phase, doc_mode, flags, objectives 등)
  - `fetchOutline()` — `/api/outline` (items, source: "topic"|"default"|"empty")
  - `saveOutline(items)` — PUT `/api/outline`
  - `runCommand({ input, options })` — POST `/api/run`
  - `cancelRun()` — POST `/api/cancel`
  - `fetchFiles(kind, limit)` — `/api/files?kind=artifact|report|reportlog`
  - `fetchFileContent(fileId)` — `/api/files/<id>` (text 또는 JSON 자동 파싱)
  - `fetchLogs(cursor, limit)` — `/api/logs` (커서 기반 증분)
  - `downloadExport({ kind, section_id, format })` — POST `/api/export` (docx 바이너리 + 한글 파일명 다운로드 트리거)

- **`lib/data.ts`**: 백엔드 응답을 UI 모델로 변환 + 자동 검토
  - `buildSections()`, `buildWorkflow()`, `buildProject()` — UI 모델 생성
  - `parseTitle()`, `extractSectionIdFromFile()` — 파일명 ↔ outline 매칭 (§7-2)
  - `reviewReport()` — 자동 점검 (§8)

- **`lib/markdown.ts`**: 본문 파싱 + 푸트노트 매칭 (§7-1)
  - `parseDocument()` — 본문/참고문헌 분리
  - `parseMarkdownBlocks()` — 단락/리스트/표/헤딩 블록화
  - `parseFootnotes()` — `[^N]: URL (라벨)` 파싱
  - `findMatchingFootnote()` — 인용 칩 텍스트 → footnote 정규화

직접 `fetch(...)` 호출은 `lib/api.ts` 외부에서 금지. 새 엔드포인트 추가 시 반드시 `api.ts` 에 함수로 추가하고 타입을 `export` 하세요.

---

## 5) 공통 타입/시그니처

도메인 타입 (`lib/data.ts`):

- `SectionStatus = "done" | "writing" | "pending"`
- `Section = { id, title, rawTitle, status, body?, fileId? }`
- `WorkflowStep = "prepare" | "mission" | "outline" | "write" | "review"`
- `WorkflowState = { currentStep, *Completed: bool, writeProgress: { done, total }, filesLearned, objectivesCount, sectionsTotal }`
- `Project = { title, period, filesLearned, lastUpdated, objectives[] }`
- `SectionReview`, `ReportReview` — 자동 점검 결과 (§8)

백엔드 응답 타입 (`lib/api.ts`):

- `StateResponse` — `phase: "idle" | "running" | "writing" | string`, `flags: { topic_title, sections_done, sections_total, ... }`
- `OutlineResponse = { items: string[], source: "topic" | "default" | "empty" }`
- `FilesResponse = { files: FileMeta[] }`, `FileMeta = { id, name, path, mtime, size }`
- `LogsResponse = { lines: { seq, line }[], next_cursor }`

마크다운 블록 (`lib/markdown.ts`):

```ts
type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "ordered-list"; items: string[] }
  | { type: "unordered-list"; items: string[] }
  | { type: "hr" }
  | { type: "table"; headers: string[]; rows: string[][] };
```

규칙:
- 새 블록 타입 추가 시 `parseMarkdownBlocks()` 와 `ReportCanvas.renderBlock()` 양쪽 동시 갱신 필수
- 새 백엔드 필드 추가 시 `lib/api.ts` 의 `*Response` interface 와 `lib/data.ts` 의 변환 함수 양쪽 갱신 의무

---

## 6) 디자인 토큰 (CSS 변수)

`app/globals.css` `:root` 의 토큰만 사용. 컴포넌트 인라인 색상 하드코딩 금지.

**Surfaces**
- `--bg-page` `#F7F6F2` (페이지 배경)
- `--bg-surface` `#FFFFFF` (카드/패널)
- `--bg-muted` `#F1EFE8` (강조 약한 배경, 코드 블록)

**Text**
- `--text-primary` `#1A1A18`
- `--text-secondary` `#5F5E5A`
- `--text-tertiary` `#9C9B96`

**Accents** (각 색마다 -bg 동반)
- `--accent-info` `#185FA5` / `--accent-info-bg` `#E6F1FB` — 진행/링크/Web 출처
- `--accent-success` `#3B6D11` / `--accent-success-bg` `#EAF3DE` — 완료/Local 출처
- `--accent-warning` `#854F0B` / `--accent-warning-bg` `#FAEEDA` — 오류/⚠

**Borders**
- `--border-subtle` `rgba(0,0,0,0.08)` — 카드 외곽
- `--border-default` `rgba(0,0,0,0.15)` — 입력/버튼
- `--border-strong` `rgba(0,0,0,0.25)` — 호버/활성

**Radius** — `--radius-sm` 6 / `--radius-md` 8 / `--radius-lg` 12

**폰트**: Pretendard Variable (CDN, `app/layout.tsx` 에서 link 로드). `--font-sans` / `--font-mono` 로 노출.

규칙:
- 인라인 `style` 의 색상은 반드시 `var(--*)` 사용. 16진수 직접 작성 금지.
- 토큰이 없는 색이 필요하면 토큰을 먼저 추가하고 사용. 임시값 금지.
- 인쇄(`@media print`) 스타일은 `globals.css` 에 모음 — 컴포넌트별 인쇄 분기 금지.

---

## 7) 백엔드 결합 규칙 (중요)

UI는 백엔드(`writer_project`)와 강하게 결합되어 있고, 일부 결합은 백엔드 측의 운영 노하우와 직접 연결됩니다.

### 7-1. 인용 시스템 (마크다운 → 칩 → 출처 패널)

백엔드가 생성한 마크다운에 다음 토큰이 들어있다고 가정:

- 본문 인용 토큰: `[파일명.확장자]` 또는 `[[자유 라벨]]` 또는 `⚠️"강조"` 또는 `**굵게**`
- 참고문헌 섹션: 본문 끝 `---` 다음 `### 참고 문헌` (또는 `각주`/`References`/`Footnotes`/`Sources`) 헤딩 이후
- 푸트노트 한 줄: `[^N]: URL (라벨)` — URL 이 `file://` 면 Local, `http(s)://` 면 Web 으로 분류

매칭 흐름 (`lib/markdown.ts`):
1. 본문에서 인용 토큰을 `CitationChip` 으로 렌더 (확장자별 아이콘: pptx ▦ / xlsx ▤ / docx·pdf ▢ / web ●)
2. 푸트노트 영역에서 `parseFootnotes()` 로 `FootnoteDef[]` 추출
3. 칩 클릭 → `findMatchingFootnote(source, footnotes)` — **정확 매칭 → 부분 매칭** 2단계
4. `SourcePanel` 이 file:// 은 "경로 복사" 버튼, http(s) 는 "새 탭에서 열기" 버튼 노출

규칙:
- 백엔드가 푸트노트 형식을 바꾸면 본 매칭이 깨짐 — 변경 시 `parseFootnotes()` 의 정규식 함께 수정
- 토큰 우선순위는 `renderInline()` 의 정규식 한 줄에 모임. 새 토큰 추가 시 이 한 줄에서 처리

### 7-2. 파일명 → 섹션 ID 매칭 (2단 휴리스틱)

`extractSectionIdFromFile()` (lib/data.ts):
1. **1차**: 파일명 앞 숫자 (`1-...`, `2_...`) — 옛날 형식
2. **2차**: outline 제목을 한국어 슬러그 정규화 (`slugifyTitle`) → 파일명과 정확 일치

규칙:
- 백엔드 `section_writer` 의 슬러그 함수 변경 시 `slugifyTitle()` 도 함께 수정 의무
- 백엔드 측 박제: `writer_project/README-dev.md` §12-13-9 (괄호 제거 cosmetic 이슈) — 슬러그 규약 변경의 트리거가 될 수 있음

### 7-3. fast-path 명령 형식

섹션 집필 명령은 반드시 **`write: <섹션제목>` 형식**으로 백엔드에 보냅니다 (`page.tsx:187`).

- 이유: 백엔드 supervisor 는 `write:` prefix 를 fast-path 로 인식하여 vector_search → section_writer 직행. ko-natural 형식 (예: "X 섹션 작성해주세요") 도 백엔드 §12-13-5 close 후로 동작하지만, **명시 prefix가 가장 안정적**.
- 본 결합은 백엔드 박제 `writer_project/README-dev.md` §12-13-1 / §12-13-5 와 직결.
- 사용자가 캔버스 하단 입력란에 자연어로 입력하면 그대로 전송됨 — 백엔드 supervisor 의 토픽-적합성 가드 (§12-13-1) 가 처리.

### 7-4. 폴링 주기

`page.tsx:32-33`:
- `POLL_INTERVAL_RUNNING = 2000` — phase 가 `running` / `writing` 일 때
- `POLL_INTERVAL_IDLE = 8000` — 그 외

규칙: 주기 변경 시 백엔드 부하 함께 고려. 너무 짧으면 `/api/state` 가 과부하.

### 7-5. 에러 표면화

`http<T>()` 헬퍼 (`api.ts:75`) 는 실패 시 `HTTP <status> <statusText> — <body>` 형태로 throw. UI 레벨에서는 `setError(...)` 로 캔버스 상단 노란 배너로 표시 + 재시도 버튼.

규칙: 에러는 조용히 무시 금지 (`useLogs` 만 예외 — 폴링은 다음 라운드로 자연 회복).

---

## 8) 검토 단계 (자동 점검)

`reviewReport(sections, bodyMap)` (`lib/data.ts:296`) 가 코드만으로 가능한 점검을 수행:

| 점검 항목 | 통과 기준 |
| --- | --- |
| 완성도 (`completenessOk`) | 모든 outline 섹션이 `hasBody=true` |
| 인용 (`citationsOk`) | 작성된 모든 섹션이 인용 ≥ 1개 (`[(?!\^)[^\]\n]+\]` 매칭) |
| 구조 (`structureOk`) | 작성된 모든 섹션이 Recommendations ≥ 1 항목 + 참고 문헌 섹션 존재 |

섹션별 경고:
- 본문 < 500자
- 인용 0개
- "Actionable Recommendations" / "권장 사항" / "실행 권장" 섹션 안의 번호 항목 0개
- "참고 문헌" / "각주" / "References" 섹션 부재

규칙:
- 점검 정규식은 `reviewSection()` 한 곳에 모임. 새 점검 추가 시 `SectionReview` interface 와 `ReviewPanel` 표시 양쪽 갱신
- 본 점검은 **보조용** — 본문 품질 검증이 아님. AI 심층 검토는 별도 (현재 placeholder, `ReviewPanel` 하단 비활성 버튼)

---

## 9) 코드 품질 가드

- ESLint: `next/core-web-vitals` + `next/typescript` (`eslint.config.mjs`)
- TypeScript: `strict: true`, `noEmit: true` (`tsconfig.json`)
- 빌드 검증: `npm run build` (Next 자체 타입 체크 + 정적 페이지 생성)
- 권장: 린트와 타입 체크를 pre-commit / CI 에 묶기 (현재는 수동)

**현재 테스트**: 없음. 백엔드 박제 `writer_project/README-dev.md` §10 와 다른 점이며, **§12-2 작업 큐**.

UI 검증은 수동 — 작업 후 `npm run dev` → 브라우저에서 골든 패스 + 엣지 케이스 확인 의무 (백엔드 `/api/state`, `/api/run` 의 phase 전환 + 인용 칩 클릭 + 출처 패널 + 검토 단계).

---

## 10) PR 운영 순서 (권장)

1. **`lib/api.ts` 갱신 먼저** — 새 엔드포인트/타입은 여기에 먼저 추가, 그 다음에 사용처 수정
2. **`lib/data.ts` 변환 함수 동기화** — 백엔드 응답 형 변경 시
3. **컴포넌트는 props 만 손대기** — fetch 직접 호출 금지 (§1 의존 규칙)
4. **디자인 토큰 우선** — 새 색이 필요하면 `globals.css :root` 에 토큰 추가 후 사용 (§6)
5. **인쇄 스타일 검증** — 본문 변경 시 `Ctrl+P` 미리보기로 PDF 출력 확인 (캔버스만 보이는지)
6. **폴링 부하 검토** — 주기 단축 시 백엔드 영향 함께 고려 (§7-4)
7. **백엔드 결합 변경 시 양쪽 README-dev.md 동시 갱신** — §7 의 박제는 백엔드 §12-13 과 짝

---

## 11) 자주 하는 작업 레시피

### 새 백엔드 엔드포인트 사용

1. `lib/api.ts` 에 `Response` interface + 함수 추가
2. 필요하면 `lib/data.ts` 에 변환 함수 추가
3. `app/page.tsx` 의 `refreshAll()` 또는 별도 `useEffect` 에서 호출
4. 컴포넌트는 props 로 받기

### 새 워크플로우 단계 추가

1. `lib/data.ts` 의 `WorkflowStep` union + `WorkflowState` 필드 추가
2. `buildWorkflow()` 의 `currentStep` 결정 로직 갱신
3. `WorkflowStepper.tsx` 의 `STEPS` 배열에 항목 추가 (label, getSubtext, isComplete)
4. `app/page.tsx` 의 `effectiveStep` / `stepOverride` 분기 갱신 (필요 시)

### 새 마크다운 토큰 추가 (예: 새 강조 형식)

1. `lib/markdown.ts` 의 `parseMarkdownBlocks` (블록 단위) 또는 `ReportCanvas.renderInline` (인라인) 의 정규식 갱신
2. `Block` union 에 새 type 추가 시 `renderBlock()` 도 동시 갱신

### 새 출처 종류 추가 (예: `gs://` 클라우드 스토리지)

1. `lib/markdown.ts` `parseFootnotes()` 의 분기 추가 (현재 file:// 와 http(s) 만)
2. `FootnoteDef` 의 `isWebUrl` boolean 만으로 부족하면 enum 으로 확장 (`SourcePanel` 도 같이)

### 디자인 토큰 추가

1. `app/globals.css :root` 에 `--*` 추가
2. 인쇄 스타일에서 다르게 보이려면 `@media print` 분기에도 추가
3. 토큰표(§6)에 한 줄 추가

---

## 12) 알려진 후속 후보

코드 워크스루 중 발견된 개선 후보. 우선순위 순으로 작성하고, 작업하면서 누적·소진합니다.

각 항목 메타 형식: **상태 / 의존 / 우선순위 / 차단 사유**
- 상태: `pending` / `active` / `blocked` / `done`

### 12-1. 사용 안 되는 / 깨진 잔존 파일 정리 — 상태: `pending` / 의존: 없음 / 우선순위: 낮음

- `app/StatusBar.tsx` — `app/page.tsx` 에서 import 0건. 옛 단순 헤더의 잔존으로 추정. Header.tsx 와 역할 중복 → 확인 후 삭제.
- `app/app_structure.txt` — CP949 인코딩 깨진 `tree` 명령 출력. 디버그용 흔적.
- `frontend/structure.txt` — 58KB 짜리 디렉토리 덤프. `.gitignore` 에 추가 또는 삭제 검토.
- `frontend_my_files/` (루트 `D:\Bell_Agent\` 직하) — `frontend/` 의 일부 파일 사본. **frontend/ 정본 확정** 후 삭제 가능 여부 사용자 확인 필요.

### 12-2. 테스트 부재 — 상태: `pending` / 의존: 없음 / 우선순위: 중

- 현재 자동 테스트 0건. 백엔드 §10 (Pytest 6개 테스트 모음) 과 비대칭.
- 도입 후보:
  - **단위**: `lib/markdown.ts` (마크다운 파서, footnote 파싱, findMatchingFootnote 매칭) — 순수 함수라 Vitest 로 가장 진입 쉬움
  - **단위**: `lib/data.ts` (slugifyTitle, extractSectionIdFromFile, buildSections, reviewReport) — 회귀 위험 영역
  - **컴포넌트**: React Testing Library 로 ReportCanvas 의 인용 칩 매칭 + ReviewPanel 의 합격 표시
- 진입 트리거: 마크다운 파서 또는 매칭 휴리스틱에 첫 회귀 발생 시.

### 12-3. 인라인 스타일 → Tailwind 또는 CSS 모듈 — 상태: `pending` / 의존: 없음 / 우선순위: 낮음

- 현재 모든 컴포넌트가 인라인 `style={...}` 사용. Tailwind v4 가 깔려 있는데 활용도 낮음.
- 비용: 디자인 토큰을 그대로 쓰는 한 큰 문제는 아니지만, 호버/포커스/미디어 쿼리 처리가 인라인으로는 까다로움 (현재 `onMouseEnter` 로 처리한 곳 있음 — `ReportCanvas:CitationChip`).
- 진입 트리거: 다크 모드, 반응형, 호버 스타일 추가 작업 시.

### 12-4. 인쇄(`@media print`) 스타일 견고성 — 상태: `pending` / 의존: 없음 / 우선순위: 낮음

- `globals.css:143` `body > div > div > div:not(:has(.report-canvas))` — `:has()` 셀렉터 + 자식 nth 의존. DOM 구조 변경 시 깨질 위험.
- 주석에서도 "WorkflowStepper은 inline style이라 잡기 어려움" 명시. 컴포넌트에 클래스 부여(또는 `data-print-hidden`) 후 셀렉터 단순화 검토.

### 12-5. 페이지 상태가 모두 `app/page.tsx` 에 모임 — 상태: `pending` / 의존: 없음 / 우선순위: 중

- 현재 `Page()` 한 함수에 useState 약 10개 + useEffect 4개. 상태 의존 그래프가 머릿속에서 추적되는 수준이지만 추가 기능 시 한계.
- 후보: zustand 또는 Context + reducer 로 분리. 단 React 19 + Next 16 의 Server Component 활용 검토 함께.
- 진입 트리거: 새 단계(예: AI 심층 검토 활성화) 추가 시.

### 12-6. AI 심층 검토 placeholder — 상태: `pending` / 의존: 백엔드 측 엔드포인트 / 우선순위: 보류

- `ReviewPanel.tsx:307` 의 비활성 버튼. 백엔드에 검토 전용 엔드포인트가 추가되면 활성화.

### 12-7. 모바일/태블릿 반응형 부재 — 상태: `pending` / 의존: 없음 / 우선순위: 낮음

- `page.tsx:264` `mainGridCols = "240px minmax(0, 1fr) 360px"` 등 폭 고정. 모바일에서 깨짐.
- 현재 사용자는 데스크톱 단일 — 모바일 요구 발생 시 진입.

### 12-8. 슬러그 매칭 사고 — 가운뎃점(`·`) 제거 비대칭 — 상태: `closed (2026-05-05)` / 의존: 없음 / 우선순위: 높음

- **발견 (2026-05-05)**: 백엔드가 `D:\GPT_AGENT\writer_project\sections\venfobel-vitamin\경쟁-브랜드아로나민임팩타민-전략-비교-및-메시지-빈-공간-도출.md` 파일을 정상 생성했으나, 프론트엔드는 해당 outline 항목을 "아직 집필되지 않은 섹션입니다" (status=pending) 로 표시.
- **증상**: outline 7개 중 가운뎃점이 들어간 1개("경쟁 브랜드(아로나민·임팩타민) 전략 비교 및 메시지 빈 공간 도출") 만 매칭 실패. 다른 6개는 정상.
- **진단**:
  - 백엔드 슬러그 (`utils/text_utils.py:41` `_ALLOWED_UNI = re.compile(r"[^0-9a-z가-힣\-]+")`) — **화이트리스트 방식**: 숫자/영문 소문자/한글/하이픈만 살림 → 가운뎃점 `·` (U+00B7) 제거.
  - 프론트엔드 슬러그 (`lib/data.ts:slugifyTitle`) — **블랙리스트 방식**: 알려진 구두점(`/\&`, `()[]{}.,!?:;'"`) 만 명시적 제거. 가운뎃점이 regex 클래스에 빠져있어 보존됨.
  - 결과: 동일 outline 제목에 두 함수가 다른 슬러그 생성 → `extractSectionIdFromFile()` 의 2차(슬러그) 매칭 실패 → `fileBySection` 에 등록 안 됨 → 섹션 status=pending.
- **해결** (`lib/data.ts:50` 패치):
  - `.normalize("NFKC")` 추가 — 백엔드 `unicodedata.normalize("NFKC", s)` 와 일치
  - `.replace(/[^0-9a-z가-힣\-]+/g, "")` — `_ALLOWED_UNI` 와 동일한 화이트리스트 정규식으로 교체
  - 기존 블랙리스트 두 줄 (`/[/\\&]/`, `/[()[\]{}.,!?:;'"]/`) 제거 — 화이트리스트가 이미 cover
  - 공백→하이픈을 화이트리스트 적용 *전*에 둠 (하이픈은 살리고 공백은 변환되도록)
- **검증**:
  - 시뮬레이션: outline 7개 모두 백엔드 파일명과 일치하는 슬러그 생성 확인. 가운뎃점 케이스 회복, 기존 정상 6개 회귀 없음.
  - 사용자측 검증: 브라우저 새로고침 시 3번 섹션이 status=done 으로 전환.
- **박제 후기**:
  - 본 사고는 §7-2 (슬러그 매칭) 와 §13 (한글 파일명 슬러그 부분 일치 위험) 에서 미리 명시한 위험이 그대로 발현. 백엔드 `writer_project/README-dev.md` §12-13-9 (슬러그 정규화 cosmetic) 와도 직결.
  - 화이트리스트 방식의 장점: 향후 새 특수문자(일본어 마침표 `。`, 한국어 쉼표 `、`, dash 변종 `–`/`—`/`−`, 가타카나 중점 `・` 등)가 입력에 들어와도 자동 처리. 블랙리스트는 빠짐 발생할 때마다 사고 반복.
  - 향후 슬러그 규약 변경 시 양쪽 동시 갱신 의무 — `slugifyTitle()` 함수 주석에도 명시 (백엔드 `utils/text_utils.py:_ALLOWED_UNI` 와 동시 갱신).

### 12-9. 한 토픽 기준 하드코딩 잔재 — `SECTION_SUBTITLES` 옛 토픽 부제 — 상태: `closed (2026-05-05)` / 의존: 없음 / 우선순위: 높음

- **발견 (2026-05-05)**: 캔버스 상단의 섹션 부제가 실제 제목과 무관한 텍스트로 표시. 예: 섹션 2 제목은 "고함량 활성비타민 시장 환경 및 규제 동향 분석" 인데 부제는 "주요 브랜드의 성분/메시지/타깃 비교 및 시장 동향".
- **증상**: 모든 섹션의 부제가 어긋남. 토픽이 venfobel-vitamin 인데 부제 7개가 모두 옛 토픽(키성장 건기식 / 아이커 등)의 outline에 맞춰진 텍스트.
- **진단**:
  - `lib/data.ts:202-210` 에 `SECTION_SUBTITLES: Record<number, string>` 상수가 옛 토픽 기준으로 **하드코딩**되어 있었음.
  - `app/page.tsx:362` 에서 `subtitle={SECTION_SUBTITLES[activeSectionId]}` 로 활성 섹션 ID 만 키로 매핑 — 토픽 컨텍스트 무시.
  - 결과: 토픽이 바뀌어도 부제는 옛 텍스트 그대로 표시 → 모든 토픽에서 부제가 어긋남 (현 토픽도 마찬가지).
- **해결** (코드 변경):
  - `lib/data.ts` 의 `SECTION_SUBTITLES` 상수 삭제.
  - `app/page.tsx` 에서 import 제거 + `<ReportCanvas />` 의 `subtitle` prop 전달 안 함.
  - `ReportCanvas` 의 `subtitle?: string` prop 시그니처는 그대로 보존 — 미래에 토픽-aware 부제를 백엔드에서 받게 되면 같은 진입점으로 다시 연결 가능.
- **검증**:
  - 부제 행이 사라지고 섹션 제목만 표시되는지 사용자측 확인.
  - 다른 섹션(executive-summary, 경쟁 브랜드 등)에서도 부제 부재 확인.
- **박제 후기**:
  - **§12-8과 동일한 패턴**의 사고 — 한 토픽 기준 하드코딩이 다른 토픽에서 깨지는 구조적 결함.
  - 후속 의무: 백엔드 `topics/<slug>` 디렉터리에 토픽별 outline + 부제가 들어있다면, 백엔드 `/api/outline` 응답에 부제 필드 추가 → 프론트엔드 `OutlineResponse` 확장으로 토픽-aware 복원 가능 (옵션 B 경로). 우선순위 낮음.
  - **앞으로의 가드**: 새로 코드 추가 시 토픽 슬러그/제목 텍스트를 frontend 코드에 박제하지 말 것. 토픽 의존 데이터는 모두 백엔드 `/api/state` 또는 `/api/outline` 을 통해 받아야 함.

---

## 13) 알려진 이슈/주의사항

**`fetchFileContent` 의 응답 타입 분기**: 백엔드가 같은 엔드포인트에서 plain text 와 JSON 두 형식을 모두 반환할 수 있어 `lib/api.ts:136` 에서 try/JSON.parse 로 분기. 새 응답 형식 추가 시 이 함수 갱신 의무.

**Content-Disposition 한글 파일명**: `downloadExport()` 는 `filename*=UTF-8''<...>` (RFC 5987) 우선, 없으면 `filename="..."` fallback. 백엔드가 한쪽만 보내도 동작하지만 한글이 깨지면 UTF-8 헤더 누락 의심.

**`useLogs` 의 cursor 단조 증가 가정**: 백엔드 `/api/logs` 가 서버 재시작 등으로 cursor 를 리셋하면 새 로그를 못 받음. 현재 회복 로직 없음 — 페이지 새로고침 필요. (12 에 추가 후보)

**Pretendard CDN 의존**: `app/layout.tsx` 에서 `cdn.jsdelivr.net` link 로드. 오프라인/사내망 환경에서는 폰트 fallback (`-apple-system`, `BlinkMacSystemFont`, `sans-serif`) 으로 대체됨. 사내 배포 시 폰트 self-hosting 검토.

**Next 16 + React 19 RC급 의존성**: `next@16.1.6`, `react@19.2.3` 모두 비교적 최근 메이저. 호환성 문제 발생 시 본 README 와 `package.json` 의 버전 박제가 진단 출발점.

**`activeBody` 와 `allBodies` 의 일관성**: 활성 섹션 본문은 `activeBody` 가 최신, 그 외는 `allBodies` 캐시. `bodyMap` 에서 활성 섹션은 `activeBody` 우선 (`page.tsx:233`). 사용자가 빠르게 섹션을 전환하면 일시적으로 캐시 미스 → ReviewPanel 에서 "본문 비어있음" 경고가 한 라운드 표시될 수 있음. 다음 폴링에서 해결.

**한글 파일명 슬러그 매칭의 부분 일치**: `slugifyTitle()` 은 구두점만 제거 + 공백 → 하이픈. 백엔드 슬러그 함수가 더 강한 정규화(예: 괄호 제거)를 하면 매칭 실패 → 섹션이 done 상태로 안 잡히고 fileId 가 비어 있을 수 있음. 백엔드 §12-13-9 와 직결 — 양쪽 동기화 필요.

---
