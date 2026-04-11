# 스프레드시트 플랫폼 전환 — 마스터 플랜

> 이 문서는 다른 세션 에이전트가 **이 문서만 보고** 향후 작업을 수행할 수 있도록 작성됨.

---

## 1. 비전

Topworks를 **"동기화·시트간 연동이 좋은 스프레드시트 모임"** 으로 전환.

**컨셉 매핑:**
| 엑셀 개념 | Topworks 개념 | 내부 코드 (변경 없음) |
|----------|-------------|-------------------|
| 폴더 | 유사 앱들의 그룹 | `Folder` (`_meta.folders`, 1단계 중첩 지원) |
| 엑셀 파일(워크북) | 앱 | `Workbook` (`_meta.workbooks`, `group_label`) |
| 시트 | 시트 | `Collection` (`_meta.collections`, `workbook_id` FK) |
| 열 | 항목/컬럼 | `Field` (`_meta.fields`) |
| 행 | 데이터/레코드 | `EntryRow` (동적 테이블 row) |

**핵심 원칙:**
- 내부 코드 용어(Collection, Field, Entry 등)는 유지 — **UI 표시만 변경**
- 시트 간 크로스시트 수식 + 자동 동기화 + 양방향 링크
- 한 앱은 **동시 편집 차단** (잠금 모드) — 아키텍처 단순화 + 성능 향상
- **셀 편집 · 필터/정렬 · 같은 시트 수식은 로컬 처리** — 엑셀급 반응 속도

---

## 2. 로컬 처리 전략 (Local-First Processing)

### 2.1 로컬 처리 대상 (클라이언트에서 즉시 처리)

| 기능 | 현재 | 변경 후 | 구현 방식 |
|------|------|---------|----------|
| **셀 편집** | API 호출 → DB UPDATE → 응답 | **즉시 UI 반영** → 디바운스 백그라운드 저장 | React 로컬 상태에 즉시 반영, 변경 큐에 적재, 1~2초 디바운스 후 서버 배치 저장 |
| **필터** | 서버 `?_filter=...` 쿼리 | **클라이언트 메모리에서 즉시** | 페이지 로드 시 전체 데이터 fetch → `@tanstack/react-table`의 클라이언트 필터 사용 |
| **정렬** | 서버 `?sort=...` 쿼리 | **클라이언트 메모리에서 즉시** | 동일, 클라이언트 정렬 |
| **같은 시트 수식** | 서버 SQL SELECT | **JS로 즉시 계산** | 수식 파서 JS 포팅 (같은 시트 필드 참조만). 셀 값 변경 → 의존 수식 즉시 재계산 |

### 2.2 서버 처리 유지 대상

| 기능 | 이유 |
|------|------|
| **크로스시트 수식** (LOOKUP, SUMREL 등) | 다른 시트 데이터를 전부 클라이언트에 올리면 메모리 부담. 서버 SQL이 배치 쿼리로 효율적 |
| **크로스시트 Lookup/Rollup** | 관계 데이터 의존, 서버 배치 쿼리 유지 |
| **검색** (`?q=`) | 서버 `_tsv` GIN 인덱스 활용 |
| **페이지네이션** | 수만 행 이상 시 서버 LIMIT/OFFSET |
| **관계 확장** (expandRelations) | 타 시트 배치 조회 |
| **데이터 영속화** | 디바운스된 변경을 서버에 저장 |

### 2.3 대용량 폴백

- 데이터가 **5,000행 이하**: 전체 로드 → 로컬 필터/정렬
- 데이터가 **5,000행 초과**: 서버 필터/정렬 폴백 (현재 방식 유지)
- 임계값은 성능 측정 후 조정

### 2.4 동시 편집 차단 (앱 잠금)

- 한 사용자가 앱을 열면 다른 사용자는 **읽기 전용**
- 잠금 구현: 서버에 `lock_owner_id` + `locked_at` 관리 (하트비트 방식 또는 SSE 연결 기반)
- 잠금 해제: 명시적 해제 또는 연결 끊김 시 자동 해제
- 잠금 시 제거 가능한 것:
  - `_version` 기반 낙관적 잠금 (409 Conflict)
  - `useConflictAwareUpdate` 훅
  - SSE 자기 이벤트 필터링의 충돌 방지 부분
- SSE 자체는 유지 — 자동화 트리거 변경, 크로스시트 동기화 알림용

### 2.5 JS 수식 엔진

- Go `formula/parser.go`의 3단계 파이프라인(Lexer → Parser → SQL 생성)을 JS로 포팅
- **같은 시트 필드 참조만** 처리: `price * quantity`, `IF(status == "완료", amount, 0)` 등
- **크로스시트 함수**(`LOOKUP`, `SUMREL`, `AVGREL` 등)는 서버 폴백
- 지원 함수: `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `ROUND`, `CEIL`, `FLOOR`, `ABS`, `COALESCE`, `IF`
- 셀 값 변경 시 → 해당 셀을 참조하는 수식 셀 자동 재계산 (의존성 그래프 기반)

---

## 3. 이미 완료된 작업

| 커밋 | 내용 |
|------|------|
| #292 | 워크북 동시 편집 방어 — 잠금 시스템 (API, 미들웨어, SSE, 프론트 잠금 훅/읽기 전용 UI) |
| #291 | 스프레드시트 전환으로 무효화된 프론트엔드 테스트 전체 삭제 |
| #290 | 디자인 철학을 엑셀 중심으로 전환 — "엑셀이랑 똑같은데 더 고급지다" |
| #289 | 엑셀 느낌 시각적 그리드 개선 — 행번호, 수식입력줄, 상태바, 그리드선, 활성셀 |
| #288 | JS 수식 엔진 (같은 시트 로컬 연산) + 셀 편집 즉각 반영 |
| #287 | Excel(XLSX) 내보내기/가져오기 + 붙여넣기 호환성 강화 |
| #283 | Folder 모델, 역참조 메타(ReverseRelField), 크로스시트 수식 구문(`SheetSlug!col`), SSE 크로스시트 무효화, 캐시 의존성 그래프 |
| #282 | 관계 리브랜딩, 자동화/대시보드/설정/프로세스 시트 통합 |
| #281 | 뷰 타입 제거 — SpreadsheetView 단일 + SavedView 시트 탭 |
| #280 | Workbook 모델, Collection에 `workbook_id` FK, 워크북 API |
| #277-279 | SpreadsheetView 추가, 뷰 탭 툴바 통합, 여백 축소 |

**이미 구현된 인프라:**
- **워크북 잠금 시스템** — 동시 편집 차단, 잠금 API, WorkbookLock 미들웨어, SSE 이벤트, 만료 정리 ✅
- **JS 수식 엔진** — 같은 시트 수식 로컬 연산 (`frontend/src/lib/formulaEngine.ts`), 셀 편집 즉각 반영 ✅
- **엑셀 UI** — 행번호, 수식입력줄, 상태바, 그리드선, 활성셀 하이라이트 ✅
- **Excel(XLSX) 가져오기/내보내기** + 붙여넣기 호환성 ✅
- Folder 모델 (`_meta.folders`, 1단계 중첩) + CRUD API ✅
- Workbook 모델 + API + 프론트 훅 ✅
- SpreadsheetView (인라인 편집, 클립보드, 새 행) ✅
- 크로스시트 수식 함수 (LOOKUP, SUMREL 등) + 구문 파서 (`SheetSlug!column`) ✅
- 역참조 메타데이터 (`ReverseRelField`, 캐시 `reverseRels` 인덱스) ✅
- SSE 크로스시트 무효화 + 프론트 `cross_sheet_invalidation` 핸들링 ✅
- 캐시 의존성 그래프 (`SheetsInWorkbook`, `SiblingSheets`, `ReverseRelations`) ✅
- 관계 시스템 (1:1, 1:N, M:N + junction table) ✅
- Lookup/Rollup computed fields ✅
- SSE 실시간 동기화 (잠금 이벤트 포함) ✅
- 용어 변경 (collection → 시트) ✅
- DataTable (@tanstack/react-table + virtual scroll) ✅
- 인라인 셀 편집 + 키보드 네비게이션 ✅
- 자동화/대시보드/설정/프로세스 → 시트 통합 ✅

---

## 4. 남은 작업

### ~~GAP 1: 로컬 처리 전환~~ — 완료 ✅

- JS 수식 엔진 ✅ (#288)
- 셀 편집 즉각 반영 ✅ (#288)
- 앱 잠금 시스템 ✅ (#292)
- 클라이언트 필터/정렬 (5,000행 이하 자동 전환, tanstack 클라이언트 모드) ✅
- 선택적: 셀 편집 디바운스 배치 저장 (향후 최적화)

### ~~GAP 2: 양방향 링크~~ — 완료 ✅

- 백엔드: `loadReverseRelations()` — 배치 쿼리로 역참조 데이터 조회, `_reverse_{slug}_{field}` 키 주입 ✅
- 프론트: SpreadsheetView에서 `_reverse_*` 키 자동 감지 → read-only 열 (건수 배지) ✅

### ~~GAP 3: 크로스시트 자동 동기화~~ — 완료 ✅

- 백엔드 + 프론트 모두 완료 ✅ (#283, #292)

### GAP 4: 네비게이션 / UX 재구성 — 대부분 완료

1. **좌측 사이드바 (시트 트리)** — SheetSidebar 컴포넌트 RootLayout에 통합 ✅
2. **하단 시트 탭** — SavedView 기반 시트 탭 AppViewPage에 구현 ✅
3. **EntryPage → 슬라이드오버 패널** — ❌ 미완료. EntryPage가 아직 전체 페이지. AppViewPage에 인프라(selectedEntryId, panelEntryData)는 있으나 시각적 슬라이드오버 미연결
4. **인라인 열 관리** — ❌ 미완료. DataTable에 `onRenameColumn`/`onDeleteColumn`/`extraHeaderColumn` props 있으나 SpreadsheetView에서 미연결. FormatToolbar 컴포넌트도 미통합

### 추가 완료 작업 (#295-#299)

- 엑셀 단축키 (Ctrl+Arrow 점프, Fill Down/Right, Cut, PageUp/Down) ✅ (#295)
- number/integer 필드 통합 + FormatToolbar 컴포넌트 ✅ (#296)
- 클라이언트 필터/정렬 (5,000행 이하 자동 전환) + 디바운스 배치 저장 ✅ (#297)
- 양방향 링크 — 역참조 데이터 로딩 + 스프레드시트 가상 열 ✅ (#298)

### 정리 작업 — 완료 ✅

- 죽은 백엔드 라우트 제거 (calendar/gantt/kanban, GlobalCalendarEvents) ✅
- dynamic_views.go 핸들러 삭제 (-900줄) ✅
- 불필요 페이지 삭제 (MyTasks, InterfaceDesigner, OrgChart) ✅
- FormPreview 컴포넌트 삭제 ✅
- Layout 필드 (label/line/spacer) FieldPalette에서 숨김 ✅
- ViewType 스키마 comment 수정 (spreadsheet만) ✅
- 한국어 용어 갱신 (앱 빌더→시트 빌더 등) ✅
- _version 낙관적 잠금 유지 (안전망, comment 추가) ✅
- 스프레드시트 전환 무효 프론트 테스트 삭제 ✅ (#291)

---

## 5. Process/Workflow 유지 (위치만 변경)

- 기능 유지: 상태 머신, 전이 규칙, ProcessFlowDiagram
- 별도 페이지(`ProcessPage`) → 시트 설정 내 패널로 이동
- 자동화/대시보드도 마찬가지: 별도 페이지 → 시트 툴바에서 접근하는 패널/오버레이

---

## 6. 폐기 대상 — 모두 처리 완료 ✅

- KanbanView, CalendarView, GalleryView, GanttView, FormView, ViewGuide 삭제 ✅ (#281)
- GlobalCalendarPage 삭제 ✅ (#281)
- MyTasksPage, InterfaceDesignerPage, OrgChartPage 삭제 ✅ (#299)
- FormPreview 삭제 ✅ (#299)
- Layout 필드 (label/line/spacer) FieldPalette에서 숨김 ✅ (#299)
- 백엔드 calendar/gantt/kanban 라우트 + dynamic_views.go 핸들러 삭제 ✅ (#299)

---

## 7. 남은 MVP 작업 (2개)

### 1. EntryPage → 슬라이드오버 패널
- AppViewPage에 인프라(selectedEntryId, panelEntryData) 존재
- EntryForm/EntryComments/EntryHistory를 shadcn Sheet(side panel)로 렌더링
- 행 클릭 시 navigate 대신 패널 열기
- 파일: `frontend/src/pages/AppViewPage.tsx`

### 2. 인라인 열 관리 + FormatToolbar 통합
- DataTable에 `onRenameColumn`/`onDeleteColumn`/`extraHeaderColumn` props 존재
- SpreadsheetView에서 이 props를 연결하여 열 헤더 우클릭 메뉴 구현
- "+" 버튼으로 새 열 추가 (useAddField 훅 사용)
- FormatToolbar를 열 헤더 컨텍스트 메뉴에 통합
- 파일: `frontend/src/components/works/views/SpreadsheetView.tsx`

---

## 8. 핵심 파일 참조 (에이전트용)

### 프론트엔드
| 파일 | 역할 |
|------|------|
| `frontend/src/pages/AppViewPage.tsx` | 시트 뷰 오케스트레이터 (1200줄) |
| `frontend/src/components/works/views/SpreadsheetView.tsx` | 메인 스프레드시트 뷰 |
| `frontend/src/components/common/DataTable.tsx` | 핵심 그리드 엔진 |
| `frontend/src/components/common/GridCell.tsx` | 타입별 셀 에디터 |
| `frontend/src/hooks/useEntries.ts` | 데이터 CRUD + 낙관적 업데이트 |
| `frontend/src/hooks/useCollections.ts` | 스키마 관리 + 워크북 훅 |
| `frontend/src/hooks/useInlineEditing.ts` | 인라인 편집 상태 머신 |
| `frontend/src/hooks/useGridNavigation.ts` | 키보드 네비게이션 |
| `frontend/src/hooks/useSSE.ts` | SSE 실시간 동기화 |
| `frontend/src/hooks/useSavedViews.ts` | SavedView 시트 탭 |
| `frontend/src/lib/constants.ts` | UI 용어 상수 (TERM) |
| `frontend/src/lib/types.ts` | 타입 정의 (Collection, Field, Workbook 등) |
| `frontend/src/lib/clipboard.ts` | TSV 복사/붙여넣기 |
| `frontend/src/lib/queryKeys.ts` | React Query 키 계층 |
| `frontend/src/layouts/RootLayout.tsx` | 네비게이션 레이아웃 |
| `frontend/src/main.tsx` | 라우터 설정 |

### 백엔드
| 파일 | 역할 |
|------|------|
| `backend/internal/schema/models.go` | Workbook, Folder, Collection, Field, Relation, ReverseRelField 모델 |
| `backend/internal/schema/store.go` | 메타 CRUD |
| `backend/internal/schema/workbook_store.go` | 워크북 + 폴더 CRUD |
| `backend/internal/schema/cache.go` | 스키마 캐시 + 역참조 인덱스 + 워크북/폴더 캐시 + 의존성 그래프 |
| `backend/internal/migration/engine.go` | DDL 마이그레이션 (AddField, DropField 등) |
| `backend/internal/migration/ddl.go` | SQL DDL 생성 |
| `backend/internal/handler/dynamic.go` | 데이터 CRUD API |
| `backend/internal/handler/computed.go` | formula/lookup/rollup 계산 |
| `backend/internal/handler/schema.go` | 스키마 API |
| `backend/internal/handler/workbook.go` | 워크북 + 폴더 + 시트 이동 API |
| `backend/internal/formula/parser.go` | 수식 파서 (Lexer→Parser→SQL + SheetSlug!col 구문) |
| `backend/internal/events/bus.go` | 이벤트 버스 (WorkbookID 포함) |
| `backend/internal/events/broker.go` | SSE 브로커 (cross_sheet_invalidation) |

---

## 9. 검증 방법

```bash
make dev-ui    # Vite dev (:5173)
make dev-api   # Go 서버 (:8080)
```

1. 로컬 처리: 셀 편집 시 네트워크 탭에 즉시 API 호출 없음 → 디바운스 후 배치 호출 확인
2. 필터/정렬: 네트워크 탭에 서버 쿼리 없이 즉시 반응 확인
3. 수식: 셀 값 변경 → 같은 시트 수식 셀 즉시 재계산 확인
4. 잠금: 두 브라우저에서 같은 앱 열기 → 두 번째는 읽기 전용 확인
5. 양방향 링크: 시트 A→B 관계 생성 → 시트 B에 역참조 열 표시 확인
6. 크로스시트 동기화: 시트 A 데이터 변경 → 시트 B의 Lookup/Rollup 자동 갱신 확인
7. 네비게이션: 좌측 사이드바에서 폴더→워크북→시트 트리 클릭 전환 확인
