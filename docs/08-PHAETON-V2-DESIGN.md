# Phaeton v2 — 스프레드시트 중심 업무 플랫폼

## Context

스프레드시트 중심 업무 플랫폼. 동기화·시트간 연동이 가능한 스프레드시트 모임.

핵심 원칙: **"엑셀처럼 쉽고, 데이터베이스처럼 강력하다"**
- 앱 = 엑셀 파일(워크북), 그 안에 여러 시트
- 폴더 = 유사 앱들의 그룹
- 시트 간 크로스시트 수식 + 자동 동기화 + 양방향 링크
- 각 시트 = 진짜 PostgreSQL 테이블 (JSON blob 아님)
- 한 앱은 동시 편집 차단 (잠금), 셀 편집·필터·정렬·수식은 로컬 처리

---

## 기술 스택

### 백엔드 (Go)

| 레이어 | 기술 | 역할 |
|--------|------|------|
| 언어 | **Go 1.26** | API 서버 + 엔진 전체 |
| HTTP | **chi** | 라우터 + 미들웨어 |
| DB | **pgx v5** | PostgreSQL 드라이버, 커넥션풀, 동적 SQL |
| 마이그레이션 | **goose** | 시스템 테이블 DDL 버전 관리 |
| 인증 | **golang-jwt** + **bcrypt** | JWT 발급/검증, 비밀��호 해싱 |
| 파일 | **AWS SDK Go v2** 또는 로컬 | S3 호환 업로드 |
| AI | HTTP → vLLM | 자연어 → 앱 생성 |

```
github.com/go-chi/chi/v5
github.com/jackc/pgx/v5
github.com/golang-jwt/jwt/v5
github.com/pressly/goose/v3
golang.org/x/crypto/bcrypt
```

### 프론트엔드 (Vite + React SPA)

| 레이어 | 기술 | 역할 |
|--------|------|------|
| 빌드 | **Vite** | 빠른 빌드 + HMR |
| UI | **React 19** + **shadcn/ui** + **Tailwind v4** | 전체 컴포넌트 |
| 라우팅 | **React Router v7** | SPA 클라이언트 라우팅 |
| 테이블 | **@tanstack/react-table** | 데이터 테이블 |
| DnD | **@dnd-kit** | 폼 빌더, 칸반 |
| 차트 | **Recharts** | 리포트/대시보드 |

```
react, react-dom, react-router
@radix-ui/* (shadcn 내부)
@tanstack/react-table
@dnd-kit/core, @dnd-kit/sortable
recharts
tailwindcss, class-variance-authority, clsx, tailwind-merge
```

사내 도구이므로 SSR/SEO 불필요. Go가 빌드된 정적 파일을 직접 서빙.
Next.js 제거로 Node.js 프로덕션 서버 불필요 → 배포 단순화.

### 아키텍처

```
┌──────────────────────────────────────────────────┐
│  Go Server (:8080)                               │
│                                                  │
│  ├─ /api/auth/*            → JWT 인증 + SAML SSO │
│  ├─ /api/apps/*            → 앱 CRUD             │
│  ├─ /api/apps/:id/fields   → 필드 관리           │
│  ├─ /api/apps/:id/entries  → 항목 CRUD + 필터    │
│  ├─ /api/apps/:id/views    → 뷰 설정             │
│  ├─ /api/apps/:id/automations → 자동화 규칙      │
│  ├─ /api/apps/:id/comments → 댓글                │
│  ├─ /api/apps/:id/history  → 변경 이력           │
│  ├─ /api/apps/:id/charts   → 차트/리포트         │
│  ├─ /api/apps/:id/webhooks → 웹훅                │
│  ├─ /api/upload            → 파일 업로드         │
│  ├─ /api/ai/*              → AI (vLLM) 앱생성/챗 │
│  ├─ /api/notifications     → 알림                │
│  ├─ /api/events (SSE)      → 실시간 이벤트       │
│  └─ /*                     → SPA 정적 파일 서빙  │
│                                                  │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────┐
│  PostgreSQL 16 (:5432)                           │
└──────────────────────────────────────────────────┘
```

**단일 서버, 단일 포트, 단일 바이너리.**
- Go가 API + SPA 정적 파일 모두 서빙
- `embed.FS`로 Vite 빌드 결과를 바이너리에 내장 가능
- 개발: Vite dev server (:5173) + Go API (:8080), Vite proxy로 /api 연결
- 프로덕션: Go 바이너리 하나로 전부 서빙

인증: Go가 JWT 발급 → httpOnly 쿠키 → 브라우저가 매 요청 자동 전송.

---

## 프로젝�� 구조 (모노레포)

```
phaeton/
  backend/
    cmd/server/main.go              진입점 + SPA 서빙
    cmd/seed/main.go                시드 스크립트
    internal/
      ai/                           AI 클라이언트 (vLLM 연동)
      automation/                   자동화 규칙 엔진
      db/                           pgx 풀 + goose 마이그레이션
      events/                       SSE 이벤트 브로커
      formula/                      수식 필드 파서/평가
      handler/                      HTTP 핸들러
        auth.go                     로그인/회원가입/토큰갱신
        schema.go                   스키마 관리
        dynamic.go                  앱 + 필드 + 항목 CRUD
        dynamic_defaults.go         항목 기본값 처리
        dynamic_similar.go          유사 항목 검색
        views.go                    뷰 설정 CRUD
        saved_views.go              저장된 뷰 관리
        filter.go                   필터 빌더
        ai.go                       AI 앱 생성
        ai_chat.go                  AI 챗 어시스턴트
        ai_chat_guide.go            AI 챗 가이드
        ai_automation.go            AI 자동화
        ai_chart.go                 AI 차트 생성
        ai_csv.go                   AI CSV 처리
        ai_filter.go                AI 필터 생성
        ai_formula.go               AI 수식 생성
        ai_prefill.go               AI 사전입력
        ai_tools.go                 AI 도구 정의
        automation.go               자동화 규칙
        charts.go                   차트/리포트
        comments.go                 댓글
        computed.go                 계산 필드
        csv.go                      CSV 가져오기/내보내기
        department.go               부서 관리
        history.go                  변경 이력
        members.go                  멤버 관리
        notifications.go            알림
        pdf.go                      PDF 내보내기
        report.go                   리포트
        sse.go                      SSE 스트리밍
        subsidiary.go               자회사/계열사 관리
        template.go                 앱 템플릿
        upload.go                   파일 업로드
        webhook.go                  웹훅
        api_validate.go             API 유효성 검증
        middleware.go               핸들러 미들웨어
        json.go                     JSON 유틸
      infra/                        로깅(slog), API에러(apierr), 메트릭스, httpretry,
                                    워커풀, shortid, cfgwatch, lifecycle
      middleware/                   JWT, CORS, 로깅, 레이트리미터, origin, secpath,
                                    RBAC, collection_access, apilimit
      migration/                    DDL 마이그레이션 엔진
      notify/                       알림 시스템
      pgutil/                       PostgreSQL 유틸
      samlsp/                       SAML SSO
      schema/                       앱 스토어, 뷰 스토어, 프로세스, 캐시, 유효성 검증
      seed/                         시드 데이터
      sync/                         동기화 유틸
        amaranth/                   외부 데이터 소스 연동
      testutil/                     테스트 헬퍼
    pkg/                            atomicfile, httputil, jsonutil
    go.mod
    go.sum

  frontend/
    index.html                      Vite 진입점
    vite.config.ts                  Vite 설정 (proxy: /api → :8080)
    src/
      main.tsx                      React 마운트 + RouterProvider
      pages/
        LoginPage.tsx               로그인
        AppListPage.tsx             앱 목록 (홈)
        AppBuilderPage.tsx          앱 생성/편집 빌더
        AppViewPage.tsx             앱 데이터 뷰
        AppSettingsPage.tsx         앱 설정
        DashboardPage.tsx           앱 대시보드
        GlobalDashboardPage.tsx     전체 대시보드
        AutomationsPage.tsx         앱별 자동화
        GlobalAutomationsPage.tsx   전체 자동화
        ProcessPage.tsx             프로세스 관리
        InterfaceDesignerPage.tsx   인터페이스 디자이너
        OrgChartPage.tsx            조직도
        RelationshipPage.tsx        앱 간 관계 시각화
        MigrationHistoryPage.tsx    마이그레이션 이력
        UsersPage.tsx               사용자 관리
        SettingsPage.tsx            설정
        ProfilePage.tsx             프로필
        NotFoundPage.tsx            404
      components/
        works/
          AppCard.tsx               앱 카드
          AppBuilder.tsx            3-패널 스키마 빌더
          FieldPalette.tsx          필드 타입 팔레트 (드래그앤드롭)
          FieldPreview.tsx          폼 미리보기 (드래그 정렬 + 리사이즈)
          FieldProperties.tsx       필드 속성 패널
          EntryForm.tsx             동적 폼 렌더러
          EntrySheet.tsx            항목 상세 슬라이드 패널
          FilterBuilder.tsx         고급 필터 빌더
          FilterChips.tsx           필터 칩
          FormPreview.tsx           폼 프리뷰
          FormulaEditor.tsx         수식 편집기
          SortPanel.tsx             정렬 패널
          TemplateGallery.tsx       앱 템플릿 갤러리
          PreviewDialog.tsx         미리보기 다이얼로그
          SchedulePicker.tsx        스케줄 선택
          AIBuildDialog.tsx         AI 앱 생성 다이얼로그
          AIAutomationDialog.tsx    AI 자동화 다이얼로그
          BulkEditPanel.tsx         일괄 편집 패널
          CSVImportPreview.tsx      CSV 가져오기 미리보기
          IconPicker.tsx            아이콘 선택기
          ProcessFlowDiagram.tsx    프로세스 흐름도
          RelationshipGraph.tsx     앱 관계 그래프
          SetupChecklist.tsx        설정 체크리스트
          SpreadsheetInput.tsx      스프레드시트 입력
          views/
            ListView.tsx            @tanstack/react-table
            KanbanView.tsx          @dnd-kit 칸반
            CalendarView.tsx        월간 캘린더
            GalleryView.tsx         카드 그리드
            GanttView.tsx           간트 차트
            FormView.tsx            폼 뷰
            ChartPanel.tsx          차트/리포트 패널
            ViewTabs.tsx            뷰 전환 탭
            ViewGuide.tsx           뷰 사용 가이드
        common/
          AIChatPanel.tsx           AI 채팅 패널
          CoachMark.tsx             코치마크 (온보딩 가이드)
          CommandPalette.tsx        커맨드 팔레트
          ConfirmDialog.tsx         확인 다이얼로그
          DataTable.tsx             범용 데이터 테이블
          EmptyState.tsx            빈 상태 표시
          ErrorBoundary.tsx         에러 바운더리
          ErrorState.tsx            에러 상태 표시
          Form.tsx                  범용 폼
          GridCell.tsx              그리드 셀
          HotkeyHelpDialog.tsx      단축키 도움말 다이얼로그
          LoadingState.tsx          로딩 상태
          NotificationBell.tsx      알림 벨
          OfflineBanner.tsx         오프라인 배너
          PageHeader.tsx            페이지 헤더
          RelationCombobox.tsx      관계 필드 콤보박스
          RelationMultiCombobox.tsx 관계 필드 다중 콤보박스
          RoleGate.tsx              역할 기반 접근 제어
          UserCombobox.tsx          사용자 콤보박스
        ui/                         shadcn 컴포넌트
      hooks/
        useAuth.ts                  인증 상태
        useEntries.ts               항목 CRUD
        useViews.ts                 뷰 관리
        useAI.ts                    AI 연동
        useAIChat.ts                AI 챗
        useAIAutomation.ts          AI 자동화
        useAIHealth.ts              AI 헬스체크
        useAutomations.ts           자동화
        useAutomationRunToasts.ts   자동화 실행 토스트
        useCharts.ts                차트
        useCollections.ts           컬렉션
        useComments.ts              댓글
        useDepartments.ts           부서
        useGridNavigation.ts        그리드 키보드 네비게이션
        useHistory.ts               변경 이력
        useHotkeys.ts               단축키
        useMembers.ts               멤버
        useMigrations.ts            마이그레이션
        useNotifications.ts         알림
        useProcess.ts               프로세스
        useRelationshipGraph.ts     관계 그래프
        useRetryToast.ts            재시도 토스트
        useSavedViews.ts            저장된 뷰
        useSSE.ts                   SSE 실시간 이벤트
        useSubsidiaries.ts          자회사/계열사
        useUndoToast.ts             실행 취소 토스트
        useUnsavedChanges.ts        미저장 변경 감지
        useUsers.ts                 사용자
      lib/
        api/                        API 클라이언트 (client.ts, errors.ts)
        types.ts                    API 응답 타입
        constants.ts                카테고리/필드타입/색상 라벨
        fieldHints.ts               필드 타입별 힌트/도움말
        formatCell.ts               셀 포맷터
        queryKeys.ts                React Query 키 관리
        queryClient.ts              React Query 클라이언트
        clipboard.ts                클립보드 유틸
        templates.ts                앱 템플릿 정의
        utils.ts                    유틸리티
    package.json
    tsconfig.json

  docker-compose.yml                PostgreSQL + Go (프론트는 Go에서 서빙)
  Makefile                          빌드/실행 명령
  scripts/                          운영 스크립트 (backup-db.sh 등)
```

---

## 데이터 아키텍처

### 시스템 테이블 (goose 마이그레이션)

```sql
-- users
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,           -- bcrypt 해시
  role        TEXT NOT NULL DEFAULT 'viewer',  -- director|pm|engineer|viewer
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- works_apps
CREATE TABLE works_apps (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL,          -- permit|material|site|complaint|finance|other
  icon          TEXT DEFAULT 'clipboard',
  table_name    TEXT UNIQUE NOT NULL,   -- wd_permit_checklist (실제 DB 테이블명)
  access_config JSONB DEFAULT '{}',     -- 앱별 역할 권한
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- works_fields
CREATE TABLE works_fields (
  id          SERIAL PRIMARY KEY,
  app_id      INTEGER NOT NULL REFERENCES works_apps(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,            -- camelCase 식별자
  label       TEXT NOT NULL,            -- 한국어 라벨
  field_type  TEXT NOT NULL,            -- text|number|date|select|checkbox|textarea|file|app-ref|user-ref
  column_name TEXT NOT NULL,            -- snake_case DB 컬럼명
  is_required BOOLEAN DEFAULT false,
  options     JSONB,                    -- select 옵션, 참조 대상 앱 ID 등
  position    INTEGER NOT NULL,
  width       TEXT DEFAULT 'full',      -- full|half
  UNIQUE(app_id, name),
  UNIQUE(app_id, column_name)
);

-- works_views
CREATE TABLE works_views (
  id          SERIAL PRIMARY KEY,
  app_id      INTEGER NOT NULL REFERENCES works_apps(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  view_type   TEXT NOT NULL,            -- list|kanban|calendar|gallery|form
  config      JSONB DEFAULT '{}',       -- 정렬, 필터, 그룹핑 설정
  position    INTEGER DEFAULT 0,
  is_default  BOOLEAN DEFAULT false
);

-- works_automations (Phase 2)
CREATE TABLE works_automations (
  id             SERIAL PRIMARY KEY,
  app_id         INTEGER NOT NULL REFERENCES works_apps(id) ON DELETE CASCADE,
  name           TEXT,
  trigger_type   TEXT NOT NULL,          -- on_create|on_update|on_delete|schedule
  trigger_config JSONB,
  conditions     JSONB,
  actions        JSONB,                  -- email|webhook|create_record|update_field
  is_active      BOOLEAN DEFAULT true
);
```

### 동적 테이블 (Schema Engine이 런타임 생성)

사용자가 "인허가 체크리스트" 앱 생성 시:

```sql
CREATE TABLE wd_permit_checklist (
  id            SERIAL PRIMARY KEY,
  -- 사용자 정의 컬럼
  title         TEXT NOT NULL,
  due_date      DATE,
  priority      TEXT,
  description   TEXT,
  is_done       BOOLEAN DEFAULT false,
  -- 시스템 컬럼 (모든 동적 테이블 공통)
  _created_by   INTEGER REFERENCES users(id),
  _created_at   TIMESTAMPTZ DEFAULT now(),
  _updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON wd_permit_checklist(_created_by);
CREATE INDEX ON wd_permit_checklist(_created_at);
```

필드 타입 → PostgreSQL 매핑:

| field_type | PostgreSQL | 비고 |
|-----------|-----------|------|
| text | TEXT | |
| number | DOUBLE PRECISION | |
| date | DATE | |
| select | TEXT | 옵션은 works_fields.options에 |
| checkbox | BOOLEAN | |
| textarea | TEXT | |
| file | TEXT | 파일 URL |
| app-ref | INTEGER | FK → 다른 wd_* 테이블 |
| user-ref | INTEGER | FK → users |

---

## Go 핵심 엔진

### Schema Engine (`internal/engine/schema.go`)

```go
// CreateApp — 앱 생성 + 동적 테이블 CREATE
func (e *Engine) CreateApp(ctx context.Context, app CreateAppInput) (*App, error)
// 1. works_apps INSERT
// 2. works_fields INSERT (각 필드)
// 3. works_views INSERT (기본 list 뷰)
// 4. CREATE TABLE wd_{slug} (시스템 컬럼 + 사용자 컬럼)
// 5. 전부 하나의 트랜잭션

// AddField — 필드 추가 + ALTER TABLE
func (e *Engine) AddField(ctx context.Context, appID int, field FieldInput) error
// 1. works_fields INSERT
// 2. ALTER TABLE wd_{table} ADD COLUMN {col} {type}

// RemoveField — 필드 삭제 + ALTER TABLE DROP
func (e *Engine) RemoveField(ctx context.Context, appID int, fieldID int) error

// UpdateField — 필드 수정 (라벨, 옵션 등, 타입 변경은 제한적)
func (e *Engine) UpdateField(ctx context.Context, appID int, fieldID int, updates FieldUpdate) error

// DeleteApp — 앱 삭제 + DROP TABLE
func (e *Engine) DeleteApp(ctx context.Context, appID int) error
// CASCADE로 works_fields, works_views 자동 삭제
// DROP TABLE wd_{table}
```

테이블/컬럼명 안전: `pgx.Identifier` 사용 (자동 이스케이프).
모든 DDL은 트랜잭션 안에서 실행 — 실패 시 롤백.

### Data Engine (`internal/engine/data.go`)

```go
// CreateEntry — 항목 생성
func (e *Engine) CreateEntry(ctx context.Context, appID int, data map[string]any) (int, error)
// 1. 앱 스키마 로드 (캐시)
// 2. 입력값 검증 (required, 타입 체크)
// 3. INSERT INTO wd_{table} (...) VALUES (...)
// 4. $1, $2 파라미터 바인딩으로 인젝션 방지

// QueryEntries — 항목 조회 (필터/정렬/페이지네이션)
func (e *Engine) QueryEntries(ctx context.Context, appID int, q QueryParams) (*PagedResult, error)
// QueryParams: filters []Filter, sort SortSpec, page int, limit int
// Filter: { field, op (eq|neq|gt|lt|gte|lte|contains|in), value }
// SELECT 빌드 → 실행 → 결과 + 총 건수 반환

// UpdateEntry — 항목 수정
func (e *Engine) UpdateEntry(ctx context.Context, appID int, entryID int, data map[string]any) error

// DeleteEntry — 항목 삭제
func (e *Engine) DeleteEntry(ctx context.Context, appID int, entryID int) error

// AggregateEntries — 집계 (리포트 뷰용)
func (e *Engine) AggregateEntries(ctx context.Context, appID int, groupField string) ([]AggResult, error)
// GROUP BY {field}, COUNT(*), SUM/AVG (number 필드)
```

스키마 캐시: `sync.Map`으로 앱별 필드 목록 캐시. 필드 변경 시 무효화.
쿼리 빌더: 컬럼명은 works_fields 화이트리스트 검증 → `pgx.Identifier`로 이스케이프.

---

## API 라우트 (Go chi)

```go
r := chi.NewRouter()
r.Use(middleware.Logger, middleware.CORS, middleware.Recoverer)

// 인증
r.Post("/auth/login", handler.Login)
r.Post("/auth/register", handler.Register)     // director만
r.Post("/auth/refresh", handler.RefreshToken)
r.Get("/auth/me", handler.Me)                  // JWT → 사용자 정보

// 보호 라우트
r.Group(func(r chi.Router) {
  r.Use(middleware.RequireAuth)

  // 앱 관리
  r.Get("/apps", handler.ListApps)
  r.Post("/apps", handler.CreateApp)            // director, pm
  r.Get("/apps/{appID}", handler.GetApp)
  r.Patch("/apps/{appID}", handler.UpdateApp)    // director, pm (본인 앱)
  r.Delete("/apps/{appID}", handler.DeleteApp)   // director

  // 필드 관리
  r.Get("/apps/{appID}/fields", handler.ListFields)
  r.Post("/apps/{appID}/fields", handler.AddField)
  r.Patch("/apps/{appID}/fields/{fieldID}", handler.UpdateField)
  r.Delete("/apps/{appID}/fields/{fieldID}", handler.RemoveField)

  // 데이터 항목
  r.Get("/apps/{appID}/entries", handler.QueryEntries)
  r.Post("/apps/{appID}/entries", handler.CreateEntry)
  r.Get("/apps/{appID}/entries/{entryID}", handler.GetEntry)
  r.Patch("/apps/{appID}/entries/{entryID}", handler.UpdateEntry)
  r.Delete("/apps/{appID}/entries/{entryID}", handler.DeleteEntry)

  // 뷰 설정
  r.Get("/apps/{appID}/views", handler.ListViews)
  r.Post("/apps/{appID}/views", handler.CreateView)
  r.Patch("/apps/{appID}/views/{viewID}", handler.UpdateView)
  r.Delete("/apps/{appID}/views/{viewID}", handler.DeleteView)

  // 파일
  r.Post("/upload", handler.Upload)

  // 사용자 관리
  r.Get("/users", handler.ListUsers)             // director
  r.Post("/users", handler.CreateUser)            // director
})
```

---

## 인증 & 권한

| 역할 | 앱 생성 | 앱 편집 | 항목 생성 | 항목 열람 | 사용자 관리 |
|------|---------|---------|-----------|-----------|-------------|
| director | O | 전체 | O | 전체 | O |
| pm | O | 본인 앱 | O | 전체 | X |
| engineer | X | X | 허용된 앱 | 허용된 앱 | X |
| viewer | X | X | X | 허용된 앱 | X |

앱별 세부 권한 (`works_apps.access_config`):
```json
{
  "entry_create": ["director", "pm", "engineer"],
  "entry_view": ["director", "pm", "engineer", "viewer"],
  "entry_edit": ["director", "pm"]
}
```

Go 미들웨어에서: JWT 디코드 → user.role 확인 → 앱별 access_config 체크.

---

## 프론트엔드 핵심 컴포넌트

### SpreadsheetView (유일한 뷰 타입)

- `@tanstack/react-table` 기반 엑셀 스타일 그리드
- 가상 스크롤 (`@tanstack/react-virtual`), 컬럼 고정/리사이즈/재정렬
- 인라인 셀 편집 (더블클릭, F2, 직접 타이핑)
- TSV 복사/붙여넣기 (Excel/Google Sheets 호환)
- 하단 빈 행으로 즉시 레코드 추가
- SavedView = 시트 탭 (필터/정렬 프리셋)
- 요약 행 (SUM/AVG/MIN/MAX/COUNT)

### DataTable (공통 그리드 엔진)

- `components/common/DataTable.tsx`
- SpreadsheetView가 래핑하는 핵심 컴포넌트
- 키보드 네비게이션 (화살표, Tab, Enter, Home/End, Ctrl+A)
- 행 선택 (체크박스), 범위 선택 (Shift+클릭)
- 우클릭 컨텍스트 메뉴 (복사, 붙여넣기, 셀 지우기, 행 삭제)
- 컬럼별 집계 함수 드롭다운

### GridCell (타입별 셀 에디터)

- `components/common/GridCell.tsx`
- text → 단일행 입력, textarea → Ctrl+Enter 커밋
- number/integer → 숫자 입력, boolean → 체크박스 토글
- date/datetime/time → HTML5 피커
- select → 드롭다운 자동 커밋, multiselect → 체크박스 리스트
- relation → RelationCombobox, user → UserCombobox
- formula/lookup/rollup → 읽기 전용 (계산 필드)
- 저장 상태 피드백 (스피너 → 체크마크, 1.5초)

### EntryForm (행 상세 폼)

- `components/works/EntryForm.tsx`
- 동적 스키마 기반 폼 (useState, react-hook-form 아님)
- 자동저장 모드 (1.5초 디바운스)
- 프로세스 워크플로 전이 버튼
- 유사 레코드 감지

---

## 데이터 모델 계층

```
Workbook (앱 = 워크북)              → _meta.workbooks
  ├─ group_label (폴더 그룹핑)
  └─ Collection (시트)              → _meta.collections + data.wd_{slug}
       ├─ Field (열)                → _meta.fields
       ├─ Relation (시트 간 연결)    → _meta.relations
       ├─ SavedView (시트 탭)       → _meta.saved_views
       └─ Process (워크플로)         → _meta.processes
```

---

## 구현 현황

### 완료

- 인증 (JWT + httpOnly 쿠키, SAML SSO, 비밀번호 변경, 로그인 잠금)
- Schema Engine (Workbook/시트/필드 DDL, 원자적 트랜잭션, 마이그레이션 기록)
- Data Engine (CRUD + 필터/정렬/페이지네이션 + RLS + soft delete)
- SpreadsheetView (엑셀 스타일 인라인 편집, TSV 복사/붙여넣기, 키보드 네비게이션)
- 크로스시트 수식 (LOOKUP, SUMREL, AVGREL, MINREL, MAXREL, COUNTREL)
- 계산 필드 (formula, lookup, rollup)
- 관계 시스템 (1:1, 1:N, M:N + junction table + batch expansion)
- SSE 실시간 동기화 (자기 이벤트 필터링, 대상 쿼리 무효화)
- 자동화 엔진 (트리거/조건/액션, AI 자동화, 무한루프 방지)
- 프로세스 관리 (상태 머신 + 전이 규칙)
- 대시보드/차트 (앱별 + 전체, Recharts, AI 차트 생성)
- CSV 가져오기/내보내기, PDF 내보내기
- 댓글, 변경 이력, 알림
- 일괄 편집 (BulkEditPanel, 배치 API 최대 1000건)
- AI 전체: 앱 생성, 챗, 자동화, 차트, 필터, 수식, CSV, 사전입력
- 앱 템플릿, 커맨드 팔레트, 단축키
- 부서/자회사 관리, RBAC, 컬렉션 접근 제어

### 향후 (스프레드시트 전환)

> 상세: `docs/11-SPREADSHEET-PIVOT.md`

1. **로컬 처리 전환** — 셀 편집 로컬화, 클라이언트 필터/정렬, JS 수식 엔진, 앱 잠금
2. **양방향 링크** — 역참조 가상 필드 자동 생성
3. **크로스시트 동기화** — SSE 의존성 전파
4. **네비게이션 재구성** — 좌측 사이드바(시트 트리), 하단 시트 탭, EntryPage→슬라이드오버

---

## 검증

1. `cd backend && go build ./...` — 컴파일 성공
2. `cd frontend && npm run build` — Vite 빌드 성공
3. `make dev-api && make dev-ui` → 개발 서버 기동
   - 로그인 → 앱 목록 → 워크북 그룹핑 확인
   - 시트 클릭 → SpreadsheetView 표시
   - 인라인 셀 편집 → 저장 확인
   - 시트 간 관계 열 생성 → Lookup/Rollup 동작 확인
4. 역할 테스트: viewer → 앱 생성 불가, RLS 적용 확인
