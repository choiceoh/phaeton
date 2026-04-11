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
| #283 | Folder 모델, Workbook 확장, 역참조 메타(ReverseRelField), 크로스시트 수식 구문(`SheetSlug!col`), SSE 크로스시트 무효화, 캐시 의존성 그래프 |
| #282 | 관계 리브랜딩, 자동화/대시보드/설정/프로세스 시트 통합 |
| #281 | 뷰 타입 제거 — SpreadsheetView 단일 + SavedView 시트 탭, Kanban/Calendar/Gallery/Gantt/Form 삭제 |
| #280 | Workbook 모델 (`_meta.workbooks`, `group_label`), Collection에 `workbook_id` FK, 워크북 API |
| #277-279 | SpreadsheetView 추가, 뷰 탭 툴바 통합, 여백 축소 |

**이미 구현된 인프라:**
- Folder 모델 (`_meta.folders`, 1단계 중첩) + CRUD API ✅
- Workbook 모델 + API + 프론트 훅 ✅
- SpreadsheetView (인라인 편집, 클립보드, 새 행) ✅
- 크로스시트 수식 함수 (LOOKUP, SUMREL, AVGREL, MINREL, MAXREL, COUNTREL) ✅
- 크로스시트 수식 구문 파서 (`SheetSlug!column` 토큰화 + SheetResolver 콜백) ✅
- 역참조 메타데이터 (`ReverseRelField` 구조체 + 캐시 `reverseRels` 인덱스) ✅
- SSE 크로스시트 무효화 (`cross_sheet_invalidation` 이벤트, `hasCrossRef` 감지) ✅
- 캐시 의존성 그래프 (`SheetsInWorkbook`, `SiblingSheets`, `ReverseRelations`, `WorkbookForCollection`) ✅
- 관계 시스템 (1:1, 1:N, M:N + junction table) ✅
- Lookup/Rollup computed fields ✅
- SSE 실시간 동기화 ✅
- 용어 변경 (collection → 시트) ✅
- DataTable (@tanstack/react-table + virtual scroll) ✅
- 인라인 셀 편집 + 키보드 네비게이션 ✅
- 자동화/대시보드/설정/프로세스 → 시트 통합 ✅

---

## 4. 남은 작업 — 핵심 GAP 4가지

### GAP 1: 로컬 처리 전환

**목표**: 셀 편집, 필터/정렬, 같은 시트 수식을 클라이언트에서 즉시 처리

**작업 항목:**

1. **데이터 로드 전략 변경**
   - `useEntries` 훅 수정: 5,000행 이하 시 전체 데이터 한 번에 fetch (`limit=ALL`)
   - React Query 캐시에 전체 데이터 보관
   - 파일: `frontend/src/hooks/useEntries.ts`

2. **셀 편집 로컬화**
   - `useInlineEditing` 수정: 편집 즉시 로컬 상태 반영
   - 변경 큐(change queue) 구현: 변경 사항 적재 → 디바운스(1~2초) → 배치 API 호출
   - 서버 저장 실패 시 롤백 + 토스트
   - 파일: `frontend/src/hooks/useInlineEditing.ts`, 새 훅 `useChangeQueue.ts`

3. **클라이언트 필터/정렬**
   - `@tanstack/react-table`의 `getFilteredRowModel()`, `getSortedRowModel()` 활성화
   - 서버 쿼리 파라미터(`?_filter=`, `?sort=`) 대신 테이블 상태로 필터/정렬
   - 5,000행 초과 시 서버 폴백 (현재 방식 유지)
   - 파일: `frontend/src/pages/AppViewPage.tsx`, `frontend/src/components/common/DataTable.tsx`

4. **JS 수식 엔진**
   - Go `formula/parser.go` 로직을 TypeScript로 포팅
   - 같은 시트 필드 참조만 처리, 크로스시트 함수는 서버 위임
   - 셀 값 변경 → 의존 수식 즉시 재계산
   - 파일: 새 파일 `frontend/src/lib/formulaEngine.ts`

5. **앱 잠금 시스템**
   - 백엔드: 앱 열기 시 잠금 획득 API, 하트비트, 자동 해제
   - 프론트: 잠금 상태 표시, 읽기 전용 모드
   - `_version` 기반 충돌 처리 제거
   - 파일: `backend/internal/handler/dynamic.go`, 새 파일 `backend/internal/handler/lock.go`, `frontend/src/hooks/useLock.ts`

### GAP 2: 양방향 링크 (Bidirectional Links)

**백엔드 인프라 완료** (#283): `ReverseRelField` 구조체 + 캐시 `reverseRels` 인덱스 + `cache.ReverseRelations(collectionID)` 메서드.
**남은 작업**: 핸들러에서 역참조 데이터를 실제로 조회·주입하는 부분 + 프론트 렌더링.

**작업 항목:**

1. **백엔드: 역참조 데이터 조회 API** ← 핵심 남은 작업
   - `DynHandler.List()`에서 `cache.ReverseRelations(collectionID)`로 역참조 메타 획득
   - 각 역참조에 대해 "이 레코드를 참조하는 원본 시트 레코드들" 배치 쿼리
   - 응답에 역참조 필드 데이터 주입 (별도 키, 예: `_reverse_relations`)
   - 파일: `backend/internal/handler/dynamic.go`, `backend/internal/handler/computed.go`

2. **프론트: 역참조 열 렌더링**
   - 역참조 필드를 그리드에 read-only 열로 표시
   - 클릭 시 원본 시트/행으로 이동
   - 파일: `frontend/src/components/common/GridCell.tsx`, `frontend/src/components/common/DataTable.tsx`

### GAP 3: 크로스시트 자동 동기화

**백엔드 인프라 완료** (#283): 
- `Event.WorkbookID` 필드 추가 ✅
- `cache.SheetsInWorkbook()`, `cache.SiblingSheets()` 메서드 ✅
- `cross_sheet_invalidation` SSE 이벤트 타입 + `hasCrossRef()` 감지 로직 (main.go) ✅
- 레코드 변경 → 같은 워크북 형제 시트 중 참조하는 시트에 SSE 브로드캐스트 ✅

**남은 작업**: 프론트에서 `cross_sheet_invalidation` 이벤트를 수신하여 캐시 무효화.

**작업 항목:**

1. **프론트: 크로스시트 캐시 무효화** ← 핵심 남은 작업
   - `useSSE`에서 `cross_sheet_invalidation` 이벤트 수신 → 해당 컬렉션 entries 캐시 무효화
   - 현재 보고 있는 시트가 무효화 대상이면 데이터 리프레시
   - 파일: `frontend/src/hooks/useSSE.ts`

### GAP 4: 네비게이션 / UX 재구성

**현재**: 상단 네비바 + AppListPage(카드 갤러리).
**목표**: 좌측 사이드바(폴더→워크북→시트 트리) + 하단 시트 탭.

**작업 항목:**

1. **좌측 사이드바 (시트 트리)**
   - 폴더(`_meta.folders`) → 워크북(앱) → 시트 3단 트리
   - 백엔드 Folder API 완료: `GET/POST/PATCH/DELETE /api/schema/folders` ✅
   - 프론트 사이드바 컴포넌트 구현 필요
   - 접기/펼치기, 드래그 재정렬
   - 파일: `frontend/src/layouts/RootLayout.tsx`, 새 컴포넌트 `SheetSidebar.tsx`

2. **하단 시트 탭**
   - 같은 워크북 내 시트들을 하단 탭으로 표시
   - SavedView 탭과 별도 레이어 (SavedView = 같은 시트의 필터 프리셋, 하단 탭 = 다른 시트 전환)
   - 파일: `frontend/src/pages/AppViewPage.tsx`

3. **EntryPage → 슬라이드오버 패널**
   - 행 상세를 별도 페이지 대신 우측 슬라이드오버
   - EntryForm, EntryComments, EntryHistory 컴포넌트 유지, 패널 안에 렌더링
   - 파일: `frontend/src/pages/EntryPage.tsx`, `frontend/src/pages/AppViewPage.tsx`

4. **라우터 경로 정리**
   - 불필요 페이지 삭제: MyTasksPage, InterfaceDesignerPage, OrgChartPage
   - 파일: `frontend/src/main.tsx`

5. **인라인 열 관리**
   - 열 헤더 "+" 버튼 → 새 열 추가 (FieldPalette 드롭다운)
   - 열 헤더 우클릭 → 컨텍스트 메뉴 (이름 변경, 타입 변경, 삭제, 숨기기)
   - AppBuilderPage → "새 시트 만들기" 다이얼로그로 축소
   - 파일: `frontend/src/components/works/views/SpreadsheetView.tsx`, `frontend/src/components/common/DataTable.tsx`

---

## 5. Process/Workflow 유지 (위치만 변경)

- 기능 유지: 상태 머신, 전이 규칙, ProcessFlowDiagram
- 별도 페이지(`ProcessPage`) → 시트 설정 내 패널로 이동
- 자동화/대시보드도 마찬가지: 별도 페이지 → 시트 툴바에서 접근하는 패널/오버레이

---

## 6. 폐기 대상

### 이미 삭제됨 (#281)
- KanbanView, CalendarView, CalendarDayView, CalendarWeekView
- GalleryView, GanttView, FormView, ViewGuide
- GlobalCalendarPage

### 삭제 필요
| 대상 | 파일 | 이유 |
|------|------|------|
| MyTasksPage | `pages/MyTasksPage.tsx` | 프로젝트 관리 개념, 시트에서 필터로 대체 |
| InterfaceDesignerPage | `pages/InterfaceDesignerPage.tsx` | 노코드 인터페이스 빌더, 스프레드시트와 무관 |
| OrgChartPage | `pages/OrgChartPage.tsx` | 조직도, 핵심 기능 아님 |
| FormPreview | `components/works/FormPreview.tsx` | 폼 레이아웃 미리보기, 그리드에서 불필요 |
| Layout 필드 | label, line, spacer 타입 | 폼 전용, 그리드에서 의미 없음 → UI에서 숨김 |

---

## 7. 구현 우선순위

### Phase 1: 로컬 처리 전환 (GAP 1) — 체감 효과 가장 큼
1. 전체 데이터 로드 전략 변경
2. 셀 편집 로컬화 + 변경 큐
3. 클라이언트 필터/정렬
4. JS 수식 엔진 (같은 시트)
5. 앱 잠금 시스템

### Phase 2: 네비게이션 재구성 (GAP 4)
1. 좌측 사이드바 (시트 트리)
2. 하단 시트 탭
3. EntryPage → 슬라이드오버
4. 인라인 열 관리
5. 불필요 페이지 삭제

### Phase 3: 양방향 링크 (GAP 2)
1. 역참조 가상 필드
2. 역참조 데이터 확장
3. 역참조 열 렌더링

### Phase 4: 크로스시트 동기화 (GAP 3)
1. 의존성 그래프
2. SSE 이벤트 확장
3. 프론트 크로스시트 캐시 무효화

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
