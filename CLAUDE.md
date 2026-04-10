# CLAUDE.md — Phaeton v2

## 프로젝트

노코드 업무앱 플랫폼. 사용자가 코드 없이 앱(폼+데이터+뷰)을 만들고 ERP 기능을 직접 구성.
각 앱 = 진짜 PostgreSQL 테이블 (동적 DDL). Go 백엔드 + Vite React SPA.
사용자 300명, DGX Spark 구동.

## 필독 문서

- `docs/08-PHAETON-V2-DESIGN.md` — 전체 설계, 아키텍처, 데이터 모델
- `docs/09-DATA-ENGINE-GUIDE.md` — Data Engine CRUD/쿼리 구현 가이드
- `docs/10-COMPETITIVE-ANALYSIS.md` — 경쟁 분석 및 구현 로드맵 (다우오피스 Works + Airtable/NocoDB/AppSheet/Monday/ClickUp)

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
    handler/                   HTTP 핸들러 (auth, apps, fields, entries, views, ai, automation, charts, webhook 등)
    infra/                     로깅, API 에러, 메트릭스, httpretry, 워커풀, shortid, cfgwatch, lifecycle
    middleware/                JWT, CORS, 로깅, 레이트리미터, origin, secpath, RBAC, collection_access, apilimit
    migration/                 DDL 마이그레이션 엔진
    notify/                    알림 시스템
    pgutil/                    PostgreSQL 유틸
    samlsp/                    SAML SSO
    schema/                    Schema Engine — 앱 스토어, 뷰 스토어, 프로세스, 캐시, 유효성 검증
    seed/                      시드 데이터
    sync/                      동기화 유틸
    testutil/                  테스트 헬퍼
  pkg/                         atomicfile, httputil, jsonutil
frontend/
  src/
    pages/                     AppListPage, AppBuilderPage, AppViewPage, AppSettingsPage,
                               AutomationsPage, DashboardPage, GlobalAutomationsPage,
                               GlobalDashboardPage, InterfaceDesignerPage, LoginPage,
                               MigrationHistoryPage, OrgChartPage, ProcessPage, ProfilePage,
                               SettingsPage, UsersPage, NotFoundPage
    components/works/          AppCard, AppBuilder, FieldPalette, FieldPreview, FieldProperties,
                               EntryForm, EntrySheet, FilterBuilder, FilterChips, FormPreview,
                               FormulaEditor, SortPanel, TemplateGallery, PreviewDialog,
                               SchedulePicker, AIBuildDialog, AIAutomationDialog
    components/works/views/    ListView, KanbanView, CalendarView, GalleryView, GanttView,
                               ChartPanel, ViewTabs
    components/common/         AIChatPanel, ConfirmDialog, DataTable, EmptyState, ErrorBoundary,
                               ErrorState, Form, GridCell, LoadingState, NotificationBell,
                               OfflineBanner, PageHeader, RelationCombobox, RoleGate, UserCombobox
    components/ui/             shadcn 컴포넌트
    hooks/                     useAuth, useEntries, useViews, useAI, useAIChat, useAutomations,
                               useCollections, useComments, useHistory, useMembers, useNotifications,
                               useProcess, useSavedViews, useUnsavedChanges 등
    lib/                       types.ts, constants.ts, formatCell.ts, queryKeys.ts, queryClient.ts,
                               clipboard.ts, utils.ts, templates.ts
    lib/api/                   client.ts, errors.ts, index.ts
```

## 디자인 철학

> **"누구나 30초 만에 쓸 수 있지만, 파워유저는 한계를 느끼지 않는다."**

### 표면: 쉽고 빠르고 유려하게
- **3초 안에 이해** — 처음 보는 사용자도 다음 행동을 즉시 알 수 있어야 한다. 설명서가 필요하면 UI가 틀린 것
- **제로 설정 시작** — 앱 생성 → 필드 추가 → 데이터 입력까지 클릭 3번 이내. 온보딩 허들 최소화
- **즉각 반응** — 모든 인터랙션은 체감 0ms. 낙관적 업데이트, 스켈레톤, 트랜지션으로 대기감 제거
- **자연스러운 흐름** — 드래그앤드롭, 인라인 편집, 키보드 단축키 등 사용자가 생각하는 순서대로 동작

### 비주얼
- 심플한 흑백 UI — 아이콘은 Lucide (스트로크 스타일), 유니코드 이모지/컬러 아이콘 사용 금지
- shadcn/ui 컴포넌트 톤 유지, 과도한 색상·그림자·장식 지양

### 이면: 파워유저도 한계 없이
- **점진적 복잡도 노출** — 기본은 단순하게, 고급 기능은 필요할 때만 드러냄. 초보자를 압도하지 않되, 꺼내 쓸 수 있는 깊이는 충분히
- **프로급 기능 완비** — 고급 필터·정렬·그룹핑, 다중 뷰(리스트·캘린더·칸반·갤러리), 조건부 서식, 수식 필드, 관계형 연결 등 전문 도구 수준의 기능을 빠짐없이 제공
- **자동화와 확장** — 반복 업무는 자동화 규칙으로, 외부 연동은 웹훅/API로. 사용자가 성장할수록 플랫폼도 함께 확장
- **대량 데이터 대응** — 수만 건 데이터도 느려지지 않는 성능. 페이지네이션, 가상 스크롤, 서버사이드 연산으로 규모에 관계없이 쾌적

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
make dev-api     # Go 서버 (:8080)
make dev-ui      # Vite dev (:5173, /api → :8080 프록시)
make build       # 프론트 빌드 → Go 서버 static/에 출력
```

## 서버 배포 (Docker)

DB와 앱 서버 모두 Docker Compose로 운영. DB 볼륨은 `practical-neumann_pgdata` (외부 볼륨)에 데이터가 있으므로 **절대 삭제하지 말 것**.

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
- DB 컨테이너를 새로 만들 때 기존 볼륨(`practical-neumann_pgdata`)을 연결해야 인증이 통과됨
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
