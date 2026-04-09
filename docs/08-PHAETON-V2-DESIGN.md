# Phaeton v2 — 노코드 업무앱 플랫폼

## Context

기존 Payload CMS 기반 Phaeton을 폐기하고,
노코드 업무앱 빌더를 핵심으로 하는 플랫폼을 처음부터 만든다.

핵심 원칙: **"앱을 만드는 것이 곧 ERP를 만드는 것"**
- 프로젝트 관리, 인허가, 자재, 현장 일보 전부 "앱"으로 정의
- 사용자(PM/디렉터)가 코드 없이 직접 앱을 생성·수정
- 각 앱 = 진짜 PostgreSQL 테이블 (JSON blob 아님)

---

## 기술 스택

### 백엔드 (Go)

| 레이어 | 기술 | 역할 |
|--------|------|------|
| 언어 | **Go 1.24** | API 서버 + 엔진 전체 |
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
┌─────────────────────────────────────────────┐
│  Go Server (:8080)                          │
│                                             │
│  ├─ /api/auth/*       → JWT 인증            │
│  ├─ /api/apps/*       → 앱 CRUD             │
│  ├─ /api/apps/:id/fields   → 필드 관리      │
│  ├─ /api/apps/:id/entries  → 항목 CRUD      │
│  ├─ /api/apps/:id/views   → 뷰 설정        │
│  ├─ /api/upload       → 파일 업로드          │
│  ├─ /api/ai/*         → vLLM 프록시          │
│  └─ /*                → SPA 정적 파일 서빙   │
│                                             │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  PostgreSQL 16 (:5432)                      │
└─────────────────────────────────────────────┘
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
    cmd/server/main.go              진입점
    internal/
      engine/
        schema.go                   Schema Manager — DDL 실행
        data.go                     Data Manager — CRUD + 쿼리 빌���
        validation.go               필드 검증
      handler/
        auth.go                     로그인/회원가입/토큰갱신
        apps.go                     앱 CRUD
        fields.go                   필드 CRUD + ALTER TABLE
        entries.go                  항목 CRUD + 쿼리
        views.go                    뷰 설정 CRUD
        upload.go                   파일 업로드
      middleware/
        auth.go                     JWT 검증 미들웨어
        cors.go                     CORS
        logger.go                   요청 로깅
      model/
        app.go                      App, Field, View, User 구조체
        query.go                    필터/정렬/페이지네이션 타입
      db/
        db.go                       pgx 풀 초기화
        migrations/
          001_system_tables.sql     users, works_apps, works_fields, works_views
    go.mod
    go.sum

  frontend/
    index.html                      Vite 진입점
    vite.config.ts                  Vite 설정 (proxy: /api → :8080)
    src/
      main.tsx                      React 마운트 + RouterProvider
      router.tsx                    React Router 라우트 정의
      layouts/
        RootLayout.tsx              글로벌 레이아웃 + 네비게이션
      pages/
        Login.tsx                   로그인
        AppListPage.tsx             앱 목록 (홈)
        AppBuilderPage.tsx          앱 생성/편집 빌더
        AppViewPage.tsx             앱 데이터 뷰
        AppSettingsPage.tsx         앱 설정
        DashboardPage.tsx           대시보드 (Phase 2)
      components/
        works/
          AppCard.tsx               앱 카드
          AppList.tsx               앱 그리드 + 필터
          AppBuilder.tsx            3-패널 스키마 빌더
          FieldPalette.tsx          필드 타입 팔레트
          FieldPreview.tsx          폼 미리보기 (드래그 정렬)
          FieldProperties.tsx       필드 속성 패널
          EntryForm.tsx             동적 폼 렌더러
          EntrySheet.tsx            항목 상세 슬라이드 패널
          views/
            ListView.tsx            @tanstack/react-table
            KanbanView.tsx          @dnd-kit 칸반
            CalendarView.tsx        월간 캘린더 (Phase 2)
            GalleryView.tsx         카드 그리드 (Phase 2)
            ViewTabs.tsx            뷰 전환 탭
        ui/                         shadcn 컴포넌트
      lib/
        api.ts                      Go API fetch 래퍼
        auth.ts                     로그인 상태 관리 (쿠키 기반)
        constants.ts                카테고리/필드타입/색상 라벨
        types.ts                    API 응답 타입
    package.json
    tsconfig.json

  docker-compose.yml                PostgreSQL + Go (프론트는 Go에서 서빙)
  Makefile                          빌드/실행 명령
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

### 앱 빌더 (AppBuilder)

```
┌─────────────────────────────────────────────────────┐
│ [앱 이름]  [카테고리 ▼]  [아이콘 ▼]         [저장] │
├──────────┬──────────────────────┬───────────────────┤
│ 필드 추가 │   폼 미리보기        │  필드 속성        │
│          │                      │                   │
│ Aa 텍스트 │  ┌──────────────┐   │ 라벨: [인허가번호] │
│ # 숫자    │  │ 인허가번호 *  │   │ 이름: permitNo   │
│ 📅 날짜   │  │ [          ] │   │ 타입: 텍스트      │
│ ☐ 체크    │  ├──────────────┤   │ ☑ 필수           │
│ ▼ 선택    │  │ 기한         │   │                   │
│ ¶ 메모    │  │ [2026-04-09] │   │                   │
│ 📎 파일   │  ├──────────────┤   │                   │
│ 🔗 앱참조 │  │ 상태 ▼       │   │                   │
│ 👤 사용자 │  │ [높음|보통|낮]│   │                   │
└──────────┴──────────────────────┴───────────────────┘
```

- FieldPalette: 필드 타입 클릭 → FieldPreview에 추가
- FieldPreview: @dnd-kit SortableContext로 드래그 정렬
- FieldProperties: 선택된 필드의 라벨/필수/옵션 편집
- 저장: POST /apps (앱+필드 한 번에) → Go가 CREATE TABLE 실행

### 동적 폼 (EntryForm)

works_fields → shadcn 컴포넌트 매핑:

| field_type | shadcn 컴포넌트 |
|-----------|----------------|
| text | `<Input>` |
| number | `<Input type="number">` |
| date | `<DatePicker>` (popover + calendar) |
| select | `<Select>` |
| checkbox | `<Checkbox>` |
| textarea | `<Textarea>` |
| file | `<Input type="file">` + POST /upload |
| app-ref | `<Combobox>` (GET /apps/:refId/entries로 검색) |
| user-ref | `<Combobox>` (GET /users로 검색) |

### 뷰 엔진

**List View** — @tanstack/react-table
- 컬럼 = works_fields, 행 = entries
- 서버 사이드 정렬/필터/페이지네이션 (Go API의 QueryParams)
- 컬럼 리사이즈, 행 클릭 → shadcn Sheet로 상세

**Kanban View** — @dnd-kit
- select 필드 기준 컬럼 그룹핑
- 카드 드래그 → PATCH /entries/:id (optimistic update)

**Calendar View** (Phase 2) — date 필드 기준 월간 그리드
**Gallery View** (Phase 2) — 카드 레이아웃

---

## 기존 ERP → 프리셋 앱

기존 Phaeton의 ERP 기능을 시드 데이터로 제공:

| 기존 | 프리셋 앱 | 필드 |
|------|----------|------|
| 프로젝트 | "프로젝트 관리" | 이름(text), 유형(select:solar/wind/ess/hybrid), 용량kW(number), 지역(text), 상태(select), PM(user-ref), COD목표(date) |
| 마일스톤 | "마일스톤" | 프로젝트(app-ref), 이름(text), 순서(number), 상태(select:pending/active/done/blocked/skipped), 담당(user-ref), 기한(date) |
| 인력 배치 | "인력 배치" | 인력(user-ref), 프로젝트(app-ref), 역할(text), 시작일(date), 종료일(date), 배정률(number) |
| 문서 | "프로젝트 문서" | 프로젝트(app-ref), 유형(select), 제목(text), 파일(file), 발급일(date), 만료일(date) |

프리셋 앱 = 일반 앱과 동일. 사용자가 필드 추가/삭제/뷰 변경 자유.

---

## 구현 순서

### Phase 1: MVP

| 단계 | 백엔드 (Go) | 프론트엔드 (Vite + React) |
|------|-------------|--------------------------|
| **1** | 프로젝트 초기화, pgx 연결, goose 마이그레이션, SPA 서빙 | Vite + React + shadcn/ui 초기화, React Router, Tailwind |
| **2** | 인증: handler/auth.go, middleware/auth.go | 로그인 페이지, 쿠키 기반 인증, api.ts 래퍼 |
| **3** | Schema Engine: schema.go (CreateApp, AddField, RemoveField) | — |
| **4** | handler/apps.go, handler/fields.go | 앱 목록 페이지 (AppList, AppCard) |
| **5** | — | 앱 빌더 (AppBuilder, FieldPalette, FieldPreview, FieldProperties) |
| **6** | Data Engine: data.go (CRUD + QueryEntries) | — |
| **7** | handler/entries.go | List View (ListView) + 입력 폼 (EntryForm, EntrySheet) |
| **8** | handler/views.go | Kanban View (KanbanView) + ViewTabs |
| **9** | 시드 스크립트 (프리셋 앱 + 샘플 데이터) | — |

### Phase 2: 확장
- Calendar View, Gallery View
- 자동화 엔진 (works_automations, goroutine 기반 트리거)
- 커스텀 대시보드 (앱 데이터 집계 + Recharts)
- 파일 업로드 (S3)
- Excel 내보내기/가져오기

### Phase 3: 고급
- AI: 자연어로 앱 생성 ("��허가 추적 앱 만들어줘")
- AI: 데이터 분석 / 리포트 자동 생성
- 앱 간 관계 시각화
- 알림 (이메일/웹 푸시)
- 앱 템플릿 마켓

---

## 검증

1. `cd backend && go build ./...` — 컴파일 성공
2. `cd frontend && npm run build` — Vite 빌드 성공
3. `docker compose up` → 시드 실행 후:
   - 로그인 → 앱 목록에 프리셋 4개 표시
   - 앱 클릭 → 리스트 뷰 + 칸반 뷰 전환
   - "새 앱 만들기" → 빌더에서 필드 추가 → 저장 → DB 테이블 생성 확인
   - 항목 입력 → 목록에 표시
   - `psql -c "\dt wd_*"` → 동적 테이블 확인
4. 역할 테스트: viewer → 앱 생성 불가, 허용된 앱만 열람

---

## 재활용 / 폐기

| 재활용 | 내용 |
|--------|------|
| 색상 체계 | 의미 기반 (green=완료, blue=진행, amber=경고, red=위험) → constants.ts |
| 상태 라벨 | 한국어 고정 (완료/진행중/대기/차단/건너뜀) → constants.ts |
| 도메인 지식 | 태양광 인허가 절차, 공사 단계 → 프리셋 앱 시드 |
| AI 연동 패턴 | vLLM runPrompt → Go HTTP 클라이언트로 재구현 |

| 폐기 | 전부 |
|------|------|
| Payload CMS | payload.config.ts, collections/*, hooks/* |
| Next.js | Vite + React SPA로 교체 |
| Tremor | shadcn/ui로 교체 |
| react-grid-layout | @dnd-kit로 교체 |
| Drizzle ORM | pgx로 교체 (Go) |
| Auth.js | Go JWT로 교체 |
