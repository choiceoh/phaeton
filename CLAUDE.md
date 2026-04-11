# CLAUDE.md — Topworks (내부 코드명: Phaeton)

## 프로젝트

**스프레드시트 중심 업무 플랫폼 Topworks**. 동기화·시트간 연동이 가능한 스프레드시트 모임.
외부 정식 이름은 **Topworks**, 내부 개발명/코드명은 **Phaeton**. 폴더명·모듈 경로·DB 자격증명·도커 볼륨·localStorage 키 등 내부 식별자는 `phaeton`을 그대로 사용. 엔드유저에게 보이는 UI 텍스트·이메일 제목·AI 프롬프트·User-Agent 등은 모두 **Topworks**로 표기.

### 핵심 컨셉
- **앱 = 엑셀 파일(워크북)**, 그 안에 여러 시트 — `Workbook` (`_meta.workbooks`)
- **폴더 = 유사 앱들의 그룹** — `Folder` (`_meta.folders`, 1단계 중첩 지원)
- **시트 = 개별 데이터 테이블** — `Collection` (`_meta.collections`, 동적 PostgreSQL 테이블 `data.wd_*`)
- 시트 간 **크로스시트 수식** (LOOKUP, SUMREL 등) + **자동 동기화** + **양방향 링크**
- 내부 코드 용어(Collection, Field, Entry)는 유지, **UI 표시만 변경** (앱→앱, 시트→시트, 항목→열, 데이터→행)
- Go 백엔드 + Vite React SPA. 사용자 300명, DGX Spark 구동.

### 데이터 처리 전략 (Local-First)
- **한 앱은 동시 편집 차단** (잠금 모드) — 한 사용자가 앱을 열면 다른 사용자는 읽기 전용
- **로컬 처리**: 셀 편집(즉시 UI 반영 → 디바운스 배치 저장), 필터/정렬(클라이언트 메모리), 같은 시트 수식(JS 엔진)
- **서버 처리 유지**: 크로스시트 수식(LOOKUP/SUMREL), 검색(`_tsv` GIN), 페이지네이션(대량 데이터), 관계 확장
- **대용량 폴백**: 1,000행 이하 → 전체 로드+로컬 처리(자유그리드), 1,000행 초과 → DB 전환 강제

## 필독 문서

- `docs/11-SPREADSHEET-PIVOT.md` — **스프레드시트 전환 마스터 플랜** (로컬 처리 전략, GAP 분석, 구현 우선순위)
- `docs/08-PHAETON-V2-DESIGN.md` — 전체 설계, 아키텍처, 데이터 모델
- `docs/09-DATA-ENGINE-GUIDE.md` — Data Engine CRUD/쿼리 구현 가이드
- `docs/10-COMPETITIVE-ANALYSIS.md` — 경쟁 분석 및 구현 로드맵

### 참고 문서

- `docs/05-SOLAR-DOMAIN.md` — 태양광 발전사업 인허가/공사 도메인 가이드
- `docs/06-DESIGN-SYSTEM.md` — 디자인 시스템 (색상, 타이포, 컴포넌트 규칙)
- `docs/07-LINT-RULES.md` — 린트 및 코드 스타일 규칙 (Prettier, ESLint)

## 스택

- **백엔드**: Go 1.26, chi, pgx v5, golang-jwt, goose, bcrypt
- **프론트**: Vite, React 19, shadcn/ui (Radix), Tailwind v4, React Router v7
- **DB**: PostgreSQL 16
- **배포**: Go 싱글 바이너리 (embed.FS로 SPA 내장)

## 디렉토리

```
backend/
  cmd/server/main.go           진입점 + SPA 서빙
  cmd/seed/main.go             시드 스크립트
  internal/
    ai/                        AI 클라이언트 (vLLM 연동)
    automation/                자동화 규칙 엔진
    db/                        pgx 풀 + goose 마이그레이션
    events/                    SSE 이벤트 브로커
    formula/                   수식 필드 파서/평가
    handler/                   HTTP 핸들러 (ai, ai_automation, ai_chart, ai_chat, ai_chat_guide,
                               ai_csv, ai_filter, ai_formula, ai_prefill, ai_solar_domain,
                               ai_tools, api_validate, auth, automation, charts, comments,
                               computed, csv, department, dynamic, dynamic_defaults,
                               dynamic_similar, dynamic_views, filter, format_display, history,
                               json, members, middleware, notifications, pdf, report, saved_views,
                               schema, sse, subsidiary, template, upload, views, webhook)
    infra/                     로깅, API 에러, 메트릭스, httpretry, 워커풀, shortid, cfgwatch, lifecycle
    middleware/                JWT, CORS, 로깅, 레이트리미터, origin, secpath, RBAC, collection_access, apilimit
    migration/                 DDL 마이그레이션 엔진
    notify/                    알림 시스템
    pgutil/                    PostgreSQL 유틸
    samlsp/                    SAML SSO
    schema/                    Schema Engine — 앱 스토어, 뷰 스토어, 프로세스, 캐시, 유효성 검증
    seed/                      시드 데이터
    sync/                      동기화 유틸 (amaranth 서브패키지 포함)
    testutil/                  테스트 헬퍼
  pkg/                         atomicfile, httputil, jsonutil
frontend/
  src/
    layouts/                   RootLayout
    contexts/                  AIAvailabilityContext, UndoContext
    pages/                     AIChatPage, AppBuilderPage, AppListPage, AppSettingsPage,
                               AppViewPage, AutomationsPage, DashboardPage, EntryPage,
                               GlobalAutomationsPage, GlobalDashboardPage,
                               LoginPage, MigrationHistoryPage,
                               NotFoundPage, ProcessPage,
                               ProfilePage, RelationshipPage, SettingsPage, UsersPage
    components/works/          AIAutomationDialog, AIBuildDialog, AppBuilder, AppCard,
                               BulkEditPanel, CSVImportPreview, EntryComments, EntryForm,
                               EntryHistory, FieldPalette, FieldPreview, FieldProperties,
                               FilterBuilder, FilterChips, FormulaEditor,
                               IconPicker, PreviewDialog, ProcessFlowDiagram,
                               RelationshipGraph, SchedulePicker,
                               SortPanel, SpreadsheetInput, TemplateGallery
    components/works/views/    SpreadsheetView (엑셀뷰, 유일한 뷰 타입), ChartPanel
    components/common/         AIChatPanel, CoachMark, CommandPalette, ConfirmDialog, DataTable,
                               EmptyState, ErrorBoundary, ErrorState, Form,
                               HotkeyHelpDialog, LoadingState, NotificationBell, OfflineBanner,
                               PageHeader, RelationCombobox, RelationMultiCombobox, RoleGate,
                               UserCombobox
    components/admin/          DepartmentPanel, OrgTree, SubsidiaryPanel, UserFormDialog
    components/ui/             shadcn 컴포넌트
    hooks/                     useAI, useAIAutomation, useAIChat, useAIHealth, useAuth,
                               useAutomationRunToasts, useAutomations, useCharts,
                               useCollections, useComments, useConflictAwareUpdate,
                               useDepartments, useEntries, useGridNavigation, useHistory,
                               useHotkeys, useIsMobile, useMembers, useMigrations,
                               useNotifications, useProcess, useRelationshipGraph,
                               useRetryToast, useSavedViews, useSSE, useSubsidiaries,
                               useUndoToast, useUnsavedChanges, useUsers, useViews
    lib/                       types.ts, constants.ts, fieldGuards.ts, fieldHints.ts,
                               formatCell.ts, queryClient.ts, queryKeys.ts, clipboard.ts,
                               utils.ts, templates.ts
    lib/api/                   client.ts, errors.ts, index.ts
```

## 디자인 철학

> **"엑셀이랑 똑같은데, 뭔가 더 고급지다."**

Topworks는 **엑셀 그 자체**다. 구조, 조작법, 단축키, 사고방식 전부 엑셀과 동일하게 간다. 엑셀 사용자가 아무 설명 없이 열어도 바로 쓸 수 있어야 한다. 다만 폰트, 여백, 완성도, 디테일에서 "이거 좀 고급인데?"라는 느낌을 준다. 엑셀의 투박함을 벗기고 프리미엄 질감을 입히는 것이 전부.

### 엑셀과 완전히 동일
- **셀 인터랙션** — 클릭→즉시 편집, Tab/Enter 이동, 화살표 탐색, 범위 선택, 복사/붙여넣기. 엑셀 사용자의 근육 기억 100% 존중
- **수식 바** — 셀 위 수식 입력줄, `=` 시작 시 수식 모드, 함수 자동완성. 엑셀과 동일한 위치·동작
- **시트 탭** — 하단 시트 탭, 우클릭 메뉴(이름 변경, 복제, 삭제, 이동), 탭 드래그 순서 변경
- **열/행 조작** — 열 너비 드래그, 행 높이 조절, 열 숨기기/표시, 열 고정(freeze pane)
- **필터/정렬** — 열 헤더 드롭다운에서 필터·정렬 (엑셀 자동 필터와 동일한 UX)
- **키보드 단축키** — Ctrl+C/V/Z/Y, Ctrl+S, Ctrl+F, Ctrl+Shift+L 등 엑셀 단축키 그대로
- **즉각 반응** — 셀 편집·필터·정렬·수식 전부 로컬 처리, 서버 왕복 없음. 타이핑 즉시 반영

### 엑셀보다 고급진 마감
- **타이포그래피** — Calibri 11pt 대신 모던 산세리프, 최적화된 행간·자간. 글자 하나하나가 깔끔
- **여백과 그리드** — 엑셀의 빽빽한 격자 대신 여유 있는 셀 패딩, 얇은 보더, 화이트 배경. 데이터가 숨 쉼
- **색상** — 흑백 기조 + 최소 액센트. 셀 상태는 서체·아이콘으로 구분, 과도한 색상 없음
- **아이콘** — Lucide (스트로크 스타일), 유니코드 이모지/컬러 아이콘 금지
- **마이크로 트랜지션** — 포커스 이동, 패널 개폐, 시트 전환에 미세한 애니메이션. 딱딱하지 않고 부드러움
- **컨텍스트 패널** — 행 상세를 팝업 대신 우측 슬라이드오버로. 시트를 벗어나지 않고 확인·편집

### 트랜지션·애니메이션·반응성 — 네이티브 엑셀을 넘는 질감
- **셀 포커스 이동** — 화살표/Tab 이동 시 활성셀 테두리가 CSS transition으로 슬라이드. 엑셀의 즉시 점프 대신 부드러운 이동감
- **드래그 셀렉션** — requestAnimationFrame 배칭으로 60fps 유지. 수백 셀 범위 선택에도 프레임 드롭 없음
- **패널 개폐** — 사이드바·슬라이드오버·필터 패널은 transform + opacity 조합. 150~200ms ease-out, 뚝 끊기지 않고 자연스럽게
- **시트 전환** — 탭 클릭 시 그리드 콘텐츠 페이드 교체. 깜빡임 없이 연속적인 작업 흐름
- **상태바 숫자** — 합계/평균/개수 변경 시 @number-flow 슬롯머신 효과. 값이 "흘러가듯" 바뀜
- **셀 편집 진입/이탈** — 더블클릭→인풋 전환, Enter→확정 시 미세한 배경 플래시로 변경 인지
- **스크롤** — 가상화 그리드에서도 관성 스크롤 유지. 대량 데이터 스크롤이 네이티브 앱처럼 매끄러움
- **로딩 상태** — 서버 응답 대기 시 스켈레톤이 아닌 기존 데이터 유지 + 미세한 opacity 변화. 깜빡임 최소화
- **원칙**: 모든 애니메이션은 200ms 이하, `will-change` 최소 사용, `prefers-reduced-motion` 존중. 화려함이 아니라 **매끄러움**이 목표. 사용자가 애니메이션을 의식하면 실패, 없으면 허전하면 성공

### 엑셀에 없는 것 (눈에 안 띄게)
- **크로스시트 수식** — `시트명!컬럼` 참조, LOOKUP/SUMREL. 엑셀 시트 간 참조와 유사한 문법
- **양방향 링크** — 관계 설정 시 상대 시트에 역참조 자동 표시
- **실시간 동기화** — 다른 사용자 변경이 SSE로 즉시 반영, 별도 UI 없이 자연스럽게
- **자동화** — 조건부 알림, 필드 자동 업데이트, 웹훅. 매크로의 노코드 버전
- **AI** — 수식 생성, 데이터 분석, 자동 분류. 엑셀에 없는 결정적 차별점

### PC 중심
- **PC가 기본, 모바일은 보조** — 넓은 화면 기본 설계, 모바일은 열람 용도
- **화면 전체 활용** — 불필요한 max-w 제약 없음. 시트가 화면을 꽉 채움
- **모바일 전용 패턴 지양** — 중앙 정렬 좁은 카드 레이아웃 사용 안 함 (로그인 예외)

## 코드 스타일

### Go
- `gofmt` 기본
- 에러는 `apierr` 패키지 사용 (`apierr.BadRequest`, `apierr.NotFound` 등)
- 로깅은 `slog` (ConsoleHandler 기반)
- 동적 테이블/컬럼명은 반드시 `pgx.Identifier`로 이스케이프

### TypeScript
- 세미콜론 없음, 작은따옴표, trailing comma, 2칸 들여쓰기
- shadcn/ui 컴포넌트 우선, 없으면 Tailwind
- import 순서: react → react-router → shadcn → lib → components

## 동적 테이블 규칙

- 테이블명: `wd_` 접두사 + slug (`wd_permit_checklist`)
- 시스템 컬럼: `_created_by`, `_created_at`, `_updated_at` (모든 동적 테이블)
- 필드 추가/삭제 = `ALTER TABLE ADD/DROP COLUMN`
- 앱 삭제 = `DROP TABLE`
- DDL은 반드시 트랜잭션 안에서 실행

## 네이밍

- Go 패키지: 소문자 단일 단어
- Go 파일: snake_case
- React 컴포넌트: PascalCase
- API 라우트: `/api/apps/{appID}/entries`
- DB 컬럼: snake_case

## 개발

```bash
make db          # PostgreSQL 시작
make dev         # UI 자동 빌드(watch) + Go 서버 단일 포트(:8080)로 API+SPA 서빙
make dev-api     # Go 서버만 (:8080)
make dev-ui      # Vite dev 서버 (:5173, HMR)
make build       # 프론트 빌드 → Go 서버 static/에 출력
```

## 서버 배포 (Docker)

DB와 앱 서버 모두 Docker Compose로 운영. DB 볼륨은 `phaeton_pgdata` (외부 볼륨)에 데이터가 있으므로 **절대 삭제하지 말 것**.

```bash
# 앱만 최신 코드로 재배포 (DB 유지, app만 리빌드)
make db                                      # DB 컨테이너만 기동 (이미 실행 중이면 생략)
docker compose up --build -d app             # app 이미지 재빌드 + 재시작

# 전체 스택 (DB + App) 기동
docker compose up --build -d

# 로그 확인
docker compose logs -f app
```

**주의사항:**
- `docker compose down -v` 금지 — 볼륨이 삭제되어 DB 데이터 유실
- DB 컨테이너를 새로 만들 때 기존 볼륨(`phaeton_pgdata`)을 연결해야 인증이 통과됨
- app 컨테이너만 교체할 때는 `docker compose up --build -d app` (DB 무중단)

## 커밋 메시지

```
feat: 앱 빌더 3-패널 UI
fix: 동적 테이블 컬럼 삭제 시 FK 체크
chore: shadcn/ui badge 컴포넌트 추가
```

## 하지 말 것

- 동적 테이블에 JSON blob 사용 (각 앱 = 진짜 테이블)
- `console.log` (Go: `slog`, React: 제거)
- SQL 문자열 직접 조합 (인젝션 방지: 파라미터 바인딩 + Identifier)
- 다크 모드 (미지원)

---

## 아키텍처 개요

### 요청 처리 흐름

```
Client (React SPA)
  │
  ▼
chi Router ─── Global MW: RequestID → RealIP → Logger → CORS → Recoverer
  │
  ├─ /api/auth/*          (public)  → AuthHandler (Login/Logout/Me)
  ├─ /api/hooks/*         (HMAC)    → WebhookHandler
  │
  └─ /api/* (protected)   → RequireAuth MW → APILimiter MW
       │
       ├─ /api/schema/*   → SchemaHandler → Store(meta CRUD) + MigrationEngine(DDL)
       ├─ /api/data/{slug} → CollectionAccess MW → DynHandler → PostgreSQL (data.*)
       ├─ /api/ai/*       → AIHandler → vLLM
       └─ /api/events     → SSEHandler → Broker → EventSource stream
```

### 스키마 변경 흐름 (트랜잭션 원자성)

```
SchemaHandler.AddField()
  │
  ▼
MigrationEngine.AddField(ctx, req)
  │  BEGIN TX
  │  ├─ 1. store.CreateFieldTx()     → INSERT INTO _meta.fields
  │  ├─ 2. ddl.GenerateAddColumn()   → ALTER TABLE data."slug" ADD COLUMN ...
  │  ├─ 3. tx.Exec(ddlUp)           → DDL 실행
  │  ├─ 4. recordMigration(tx, ...)  → INSERT INTO _meta.migrations (up + down DDL 기록)
  │  COMMIT TX
  │
  ▼
cache.ReloadCollection(collectionID)  → 메모리 캐시 갱신
```

### 이벤트 & 자동화 흐름

```
DynHandler.Create()
  │  INSERT → record 생성
  │
  ▼
eventBus.Publish(EventRecordCreate)
  │
  ├─► AutomationEngine.handleEvent()     (동기 수신, 비동기 실행)
  │     │  depth > 0 이면 skip (무한루프 방지)
  │     │  workerPool.Submit(func() {
  │     │    loadAutomations(collectionID, "record_created")
  │     │    for each automation:
  │     │      evaluateConditions(record) → pass?
  │     │      executeActions(notification/update_field/webhook)
  │     │      logRun(success/error/skipped)
  │     │  })
  │
  └─► SSEBroker.Broadcast(msg)
        │  JSON marshal → non-blocking send to all clients
        │  버퍼(64) 초과 시 해당 클라이언트 메시지 드롭 (로그 기록)
        ▼
      EventSource (브라우저)
        │  useSSE hook 수신
        │  actor_user_id === me.id → skip (이미 낙관적 업데이트 완료)
        │  다른 사용자 변경 → invalidateQueries + toast
```

### 레코드 조회 파이프라인 (DynHandler.List)

```
GET /api/data/{slug}?page=1&limit=20&sort=-created_at&q=검색어&_filter={...}&expand=true
  │
  ├─ 1. resolveCollection(slug)       → cache에서 Collection + Fields 조회
  ├─ 2. checkAccess(col, "entry_view") → AccessConfig.AllowsRole 검사
  ├─ 3. ParsePagination(r)            → page, limit, offset
  ├─ 4. ParseSortWithRelations(r)     → ORDER BY (관계 필드면 LEFT JOIN 추가)
  ├─ 5. ParseJSONFilter(r)            → WHERE 절 (AND/OR 중첩 가능)
  ├─ 6. BuildSearchClause(q, fields)  → ILIKE across text/textarea fields
  ├─ 7. buildRLSClause(user, col)     → viewer 역할이면 행 수준 필터 추가
  │       rls_mode: creator → created_by=$userID
  │       rls_mode: department → created_by IN (같은 부서 사용자들)
  │       rls_mode: subsidiary → created_by IN (같은 자회사 사용자들)
  │       rls_mode: filter → 커스텀 필터 조건
  ├─ 8. COUNT(*) 쿼리 (전체 건수)
  ├─ 9. SELECT + WHERE + ORDER + LIMIT OFFSET
  ├─ 10. collectRows → []map[string]any
  ├─ 11. expandRelations()            → 관계 필드의 대상 레코드 조회 (batch IN query)
  ├─ 12. expandUserFields()           → user 타입 필드의 사용자 정보 조회
  ├─ 13. resolveComputedFields()      → formula/lookup/rollup 계산
  │       formula: Parser.Parse(expr) → SQL expression → SELECT 실행
  │       lookup: 관계 레코드의 특정 필드 값 조회
  │       rollup: SUM/COUNT/AVG/MIN/MAX over 관계 레코드들
  ├─ 14. loadM2MFields()              → M:N junction 테이블에서 연결된 레코드 조회
  └─ 15. JSON 응답 (data + total + page + limit)
```

---

## 핵심 아키텍처 판단 (ADR)

### 각 앱 = 진짜 PostgreSQL 테이블 (JSON blob 아님)
- 앱별 독립 인덱스, FK 제약, CHECK 제약 가능
- 표준 SQL 집계(SUM/AVG/GROUP BY) 네이티브 지원
- 대량 데이터(만 건 이상) 조회 시 JSON 파싱 오버헤드 없음
- 트레이드오프: 스키마 변경마다 DDL 필요 → MigrationEngine으로 해결

### In-memory 캐시 + RWMutex (Redis 아님)
- 단일 프로세스 배포 (300명 규모) → 네트워크 왕복 불필요
- 스키마 메타데이터는 읽기 비율 99%+ → RWMutex 경합 최소
- 값 복사(not 포인터) 반환으로 호출자 수정이 캐시에 영향 안 줌
- 트레이드오프: 다중 인스턴스 배포 시 캐시 일관성 보장 안 됨

### 동기 이벤트 버스 + 워커풀 (메시지 큐 아님)
- 같은 프로세스 안에서 즉시 전달 → 지연 없음
- 워커풀로 비동기 실행하여 API 응답 블로킹 없음
- depth 카운터로 자동화 → 레코드 업데이트 → 자동화 무한루프 방지
- 트레이드오프: 서버 재시작 시 진행 중인 자동화 유실

### pgx.Identifier.Sanitize() 사용 이유
- 동적 테이블/컬럼명은 SQL 파라미터($1)로 바인딩 불가 (DDL/식별자)
- `fmt.Sprintf`로 조합하면 SQL 인젝션 위험
- pgx.Identifier는 더블쿼트 래핑 + 내부 더블쿼트 이스케이프 보장
- 모든 동적 식별자(테이블명, 컬럼명)에 반드시 사용

### Soft Delete (deleted_at) 패턴
- 사용자 실수 복구 가능 (30일 보관)
- 관계 참조 무결성 유지 (FK가 삭제된 행을 참조할 수 있음)
- 모든 조회 쿼리에 `WHERE deleted_at IS NULL` 자동 추가
- 주의: 직접 쿼리 작성 시 이 조건 누락하면 삭제된 데이터 노출

### Migration 기록 (up/down DDL 쌍)
- 모든 스키마 변경 이력 감사 추적
- down DDL로 롤백 가능 (RollbackMigration)
- Unsafe 연산(DROP COLUMN/TABLE)은 `?confirm=true` 필수
- _meta.migrations 테이블에 payload(변경 메타) + ddl_up/ddl_down 저장

---

## 자주 빠지는 함정 (Gotchas)

### 필드 타입 분류 — 3가지 카테고리
```
일반 필드     → DB 컬럼 있음, INSERT/UPDATE 가능
  text, number, integer, decimal, boolean, date, datetime, time,
  select, multiselect, relation, user, file, json, url, email,
  phone, autonumber, table, spreadsheet

레이아웃 필드  → DB 컬럼 없음 (IsLayout()=true, NoColumn()=true)
  label, line, spacer
  → DDL 생성 시 제외, INSERT/UPDATE 시 무시

계산 필드     → DB 컬럼 없음 (IsComputed()=true, NoColumn()=true)
  formula, lookup, rollup
  → 조회 시점에 동적 계산 (resolveComputedFields)
  → INSERT/UPDATE 데이터에 포함하면 안 됨
```

### 자동 주입 컬럼 (모든 동적 테이블)
| 컬럼 | 타입 | 용도 |
|------|------|------|
| `id` | UUID PK | 자동 생성, DEFAULT gen_random_uuid() |
| `created_at` | TIMESTAMPTZ | 자동, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | UPDATE 시 자동 갱신 |
| `created_by` | UUID FK | auth.users 참조, INSERT 시 현재 사용자 |
| `updated_by` | UUID FK | UPDATE 시 현재 사용자 |
| `deleted_at` | TIMESTAMPTZ | soft delete, NULL이면 활성 |
| `_status` | TEXT | 프로세스 워크플로 현재 상태 |

### M:N 관계 처리
- M:N 필드 생성 시 자동으로 junction 테이블 생성 (`_meta.relations.junction_table`)
- junction 테이블: `(owner_id UUID, target_id UUID, PRIMARY KEY(owner_id, target_id))`
- 직접 FK 추가 금지 — MigrationEngine.AddField()가 자동 처리
- 조회 시 loadM2MFields()로 별도 쿼리 실행 (메인 SELECT에 포함 안 됨)

### RLS (Row-Level Security) 적용 범위
- **director, pm, engineer**: RLS 미적용 → 전체 데이터 조회 가능
- **viewer만 RLS 적용**: `buildRLSClause()`가 WHERE 조건 추가
- rls_mode별 동작:
  - `none`: 제한 없음 (viewer도 전체 조회)
  - `creator`: `created_by = $currentUserID`
  - `department`: 같은 부서 사용자가 생성한 레코드만
  - `subsidiary`: 같은 자회사 사용자가 생성한 레코드만
  - `filter`: 커스텀 필터 조건 적용

### 캐시 갱신 주의사항
- `cache.ReloadCollection(id)`는 해당 컬렉션만 갱신
- 관계 필드 추가/삭제 시 **대상 컬렉션도** 갱신 필요할 수 있음
- 캐시 불일치 의심 시 `cache.Load()`로 전체 리로드 (서버 시작 시 자동 호출)
- 캐시는 값 복사 반환 → 반환된 객체를 수정해도 캐시에 영향 없음

### 자동화 무한루프 방지
- automation_depth 컨텍스트 값으로 추적
- 자동화 액션이 레코드를 업데이트 → 이벤트 발생 → depth > 0이면 skip
- 현재 최대 깊이 = 1 (자동화가 트리거한 이벤트는 추가 자동화 미실행)

---

## 프론트엔드 상태 관리 패턴

### React Query = 서버 상태의 단일 진실 공급원
- Redux/Zustand 없음 — 모든 서버 데이터는 React Query 캐시에 저장
- `staleTime: 30_000` (30초) — 내부 관리 도구 특성상 약간의 캐시 허용
- `gcTime: 5 * 60_000` (5분) — 최근 사용 쿼리 따뜻하게 유지
- `refetchOnWindowFocus: false` — 작업 흐름 중 탭 전환 시 불필요한 refetch 방지
- 4xx 에러는 재시도 안 함 (자동 복구 불가), 5xx만 2회 재시도

### 낙관적 업데이트 패턴 (useEntries 등)
```typescript
// 1. onMutate: 진행 중 refetch 취소 + 스냅샷 저장 + 캐시 즉시 수정
onMutate: async (vars) => {
  await qc.cancelQueries({...})           // 경합 방지
  const previousLists = qc.getQueriesData(...)  // 롤백용 스냅샷
  qc.setQueriesData({...}, (old) => ...)  // UI 즉시 반영
  return { previousLists }
}
// 2. onError: 실패 시 스냅샷으로 롤백
onError: (_err, _vars, ctx) => {
  for (const [key, data] of ctx.previousLists) qc.setQueryData(key, data)
}
// 3. onSettled: 성공/실패 무관하게 서버 정규 데이터로 refetch
onSettled: () => qc.invalidateQueries({...})
```

### SSE 자기 이벤트 필터링
```
서버에서 SSE 메시지 수신
  │
  ├─ actor_user_id === me.id → 무시 (이미 낙관적 업데이트 적용됨)
  │
  └─ actor_user_id !== me.id → invalidateQueries(entries.collection(slug))
                                + toast("다른 사용자가 변경했습니다")
```

### Query Key 계층 (TkDodo 패턴)
```
queryKeys
  ├─ auth.me()                           → staleTime: Infinity
  ├─ collections
  │    ├─ .all                           → 기본 키 (무효화 시 하위 전체 포함)
  │    ├─ .list()                        → 목록
  │    ├─ .detail(id)                    → 단일 조회
  │    └─ .bySlug(slug)                  → slug 기반 조회
  ├─ entries
  │    ├─ .all                           → 기본 키
  │    ├─ .collection(slug)              → 컬렉션별 기본 키
  │    ├─ .list(slug, params)            → 필터/정렬/페이지 포함 목록
  │    └─ .detail(slug, id)              → 단일 레코드
  ├─ views.list(collectionId)
  ├─ savedViews.list(collectionId)
  ├─ process.detail(collectionId)
  ├─ comments.list(slug, recordId)
  ├─ notifications.all
  └─ automations
       ├─ .list()
       ├─ .detail(id)
       └─ .runs(id)
```

---

## API 필터/정렬/페이지네이션 문법

### 페이지네이션
```
?page=1&limit=20          → OFFSET 0, LIMIT 20
?page=3&limit=50          → OFFSET 100, LIMIT 50
```

### 정렬
```
?sort=name                → ORDER BY name ASC
?sort=-created_at         → ORDER BY created_at DESC (- prefix = DESC)
?sort=-created_at,name    → 복합 정렬
?sort=client.name         → 관계 필드 정렬 (자동 LEFT JOIN)
```

### 텍스트 검색
```
?q=검색어                  → text/textarea 필드 전체에 ILIKE '%검색어%'
```

### JSON 필터
```
?_filter={"op":"and","conditions":[
  {"field":"status","op":"eq","value":"active"},
  {"field":"amount","op":"gte","value":"1000"},
  {"op":"or","conditions":[
    {"field":"region","op":"eq","value":"서울"},
    {"field":"region","op":"eq","value":"경기"}
  ]}
]}
```

지원 연산자: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `not_in`, `is_null`, `is_not_null`, `contains`

### 관계 필드 확장
```
?expand=true              → 관계 필드의 대상 레코드 전체 정보 포함
?format=display           → 날짜 등을 한국어 포맷으로 변환
```

---

## 스프레드시트 전환 현황

> 상세 플랜: `docs/11-SPREADSHEET-PIVOT.md`

### 완료된 전환
- **워크북 잠금 시스템** — 동시 편집 차단, 잠금 API, WorkbookLock 미들웨어, 만료 정리 ✅
- **JS 수식 엔진** — 같은 시트 수식 로컬 연산, 셀 편집 즉각 반영 ✅
- **크로스시트 동기화** — 백엔드 의존성 그래프 + SSE + 프론트 캐시 무효화 ✅
- **엑셀 UI** — 행번호, 수식입력줄, 상태바, 그리드선, 활성셀, 엑셀 단축키 ✅
- **Excel(XLSX) 가져오기/내보내기** + 붙여넣기 호환성 ✅
- **클라이언트 필터/정렬** — 1,000행 이하 자유그리드 + 디바운스 배치 저장 ✅
- **양방향 링크** — 역참조 데이터 로딩 + 스프레드시트 가상 열 ✅
- **좌측 사이드바** — SheetSidebar (폴더→워크북→시트 트리) RootLayout 통합 ✅
- **시트 탭** — SavedView 기반 시트 탭 ✅
- **number/integer 필드 통합** + FormatToolbar 컴포넌트 ✅
- **죽은 코드 정리** — 라우트·핸들러·페이지·컴포넌트 대규모 삭제 ✅
- Folder/Workbook 모델 + API ✅
- 크로스시트 수식 함수 + 구문 파서 (`SheetSlug!col`) ✅
- 자동화/대시보드/설정/프로세스 → 시트 통합 ✅
- 용어 변경 (앱 빌더 → 시트 빌더) ✅

### 남은 MVP 작업 (2개)
1. **EntryPage → 슬라이드오버** — 행 상세를 전체 페이지 대신 우측 패널로 (인프라 존재, 시각 연결 필요)
2. **인라인 열 관리** — SpreadsheetView에서 열 추가/이름변경/삭제 + FormatToolbar 헤더 통합 (DataTable props 존재, SpreadsheetView 연결 필요)

### 아키텍처 판단: Local-First Processing
- **동시 편집 차단**: 워크북 단위 잠금 → 충돌 처리 불필요, 아키텍처 단순화
- **로컬 처리 범위**: 셀 편집 + 같은 시트 수식 → JS 엔진으로 즉각 반영 (구현 완료)
- **서버 처리 유지**: 크로스시트 수식 + 검색 + 페이지네이션 + 관계 확장
- **크로스시트 수식**: 시트 전환 시 한 번만 서버 연산 → 이후 같은 시트 내 작업은 로컬
