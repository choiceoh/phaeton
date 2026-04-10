# CLAUDE.md — Phaeton v2

## 프로젝트

노코드 업무앱 플랫폼. 사용자가 코드 없이 앱(폼+데이터+뷰)을 만들고 ERP 기능을 직접 구성.
각 앱 = 진짜 PostgreSQL 테이블 (동적 DDL). Go 백엔드 + Vite React SPA.
사용자 300명, DGX Spark 구동.

## 필독 문서

- `docs/08-PHAETON-V2-DESIGN.md` — 전체 설계, 아키텍처, 데이터 모델
- `docs/10-COMPETITIVE-ANALYSIS.md` — 경쟁 분석 및 구현 로드맵 (다우오피스 Works + Airtable/NocoDB/AppSheet/Monday/ClickUp)

## 스택

- **백엔드**: Go 1.24, chi, pgx v5, golang-jwt, goose, bcrypt
- **프론트**: Vite, React 19, shadcn/ui (Radix), Tailwind v4, React Router v7
- **DB**: PostgreSQL 16
- **배포**: Go 싱글 바이너리 (embed.FS로 SPA 내장)

## 디렉토리

```
backend/
  cmd/server/main.go         진입점 + SPA 서빙
  cmd/seed/main.go            시드 스크립트
  internal/
    engine/                   Schema Engine (DDL) + Data Engine (CRUD)
    handler/                  HTTP 핸들러 (auth, apps, fields, entries, views)
    middleware/               JWT, CORS, 로깅, 레이트리미터, origin, secpath
    model/                    Go 구조체
    db/                       pgx 풀 + goose 마이그레이션
    infra/                    로깅, API 에러, 메트릭스, httpretry, 워커풀, shortid, cfgwatch
  pkg/                        atomicfile, httputil, jsonutil
frontend/
  src/
    pages/                    AppListPage, AppBuilderPage, AppViewPage, LoginPage
    components/works/         AppCard, AppBuilder, FieldPalette, FieldPreview, FieldProperties, EntryForm, EntrySheet
    components/works/views/   ListView, KanbanView, ViewTabs
    components/ui/            shadcn 컴포넌트
    lib/                      api.ts, types.ts, constants.ts
```

## 디자인 철학

- 심플한 흑백 UI — 아이콘은 Lucide (스트로크 스타일), 유니코드 이모지/컬러 아이콘 사용 금지
- shadcn/ui 컴포넌트 톤 유지, 과도한 색상·그림자·장식 지양

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
