# 네비게이션/UX 재구성 (GAP 4)

## Context
현재 Topworks는 상단 네비게이션 바 + 카드 그리드 기반 앱 목록을 사용. 스프레드시트 중심 플랫폼으로 전환하면서 VS Code 스타일 좌측 사이드바 + 시트 탭 + 행 상세 슬라이드오버로 전환 필요. 백엔드 Folder API는 완료되었으나 Workbook↔Folder 연결(folder_id) 미구현.

---

## Phase 0: 불필요 페이지 삭제

**삭제 대상:**
- `frontend/src/pages/MyTasksPage.tsx`
- `frontend/src/pages/InterfaceDesignerPage.tsx`
- `frontend/src/pages/OrgChartPage.tsx`

**수정:**
- `frontend/src/main.tsx` — 라우트 + import 제거 (`/my-tasks`, `/apps/:appId/interface`, `/admin/org`)
- `frontend/src/layouts/RootLayout.tsx` — "내 업무" NavLink, Network 아이콘 버튼 제거

---

## Phase 1: 백엔드 — Workbook에 folder_id 추가

**수정 파일:**
- `backend/internal/db/bootstrap.go` — `ALTER TABLE _meta.workbooks ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES _meta.folders(id) ON DELETE SET NULL`
- `backend/internal/schema/models.go` — `Workbook` 구조체에 `FolderID string` 추가
- `backend/internal/schema/store.go` — `scanWorkbook`, ListWorkbooks, getWorkbook, CreateWorkbook, UpdateWorkbook SQL에 `folder_id` 추가. `CreateWorkbookReq`/`UpdateWorkbookReq`에 `FolderID` 필드 추가
- `backend/internal/schema/workbook_store.go` — lock 관련 RETURNING 절에 `folder_id` 추가
- `backend/internal/schema/cache.go` — `WorkbooksInFolder(folderID)` 메서드 추가

---

## Phase 2: 좌측 사이드바 (상단 네비 교체)

### 2a: 타입 + 훅
- `frontend/src/lib/types.ts` — `Folder` 인터페이스 추가, `Workbook`에 `folder_id` 추가
- `frontend/src/lib/queryKeys.ts` — `folders` 키 그룹 추가
- `frontend/src/hooks/useFolders.ts` (**신규**) — `useFolders()`, `useCreateFolder()`, `useUpdateFolder()`, `useDeleteFolder()`
- `frontend/src/hooks/useCollections.ts` — workbook mutation에 `folder_id` 지원 추가

### 2b: 사이드바 컴포넌트
- `frontend/src/components/sidebar/AppSidebar.tsx` (**신규**) — 메인 사이드바 래퍼 (로고, 유저, 트리, 네비, 접기/펼치기)
- `frontend/src/components/sidebar/FolderTree.tsx` (**신규**) — 폴더→워크북→시트 3단 트리. `useFolders()` + `useWorkbooks()` + `useCollections()` 조합. 우클릭 컨텍스트 메뉴 (이름변경, 삭제, 이동). localStorage로 펼침 상태 유지
- `frontend/src/components/sidebar/SidebarNav.tsx` (**신규**) — 하단 도구/관리 링크 (자동화, AI, 설정, 사용자관리, 이력 — role-gated)

### 2c: RootLayout 전면 교체
- `frontend/src/layouts/RootLayout.tsx` — 상단 nav 제거, `flex h-screen` 레이아웃: `[AppSidebar | main.flex-1.overflow-auto > Outlet]`
- `NotificationBell` 사이드바 헤더로 이동
- 스크롤 로직: `window.scrollTo` → main 패널 ref로 변경

### 2d: 기존 페이지 조정
- `frontend/src/pages/AppViewPage.tsx` — `PageHeader` 제거 (사이드바가 네비 역할), 전체 높이 채우기
- `frontend/src/pages/AppListPage.tsx` — 대시보드/홈으로 유지하거나 사이드바로 대체 검토

---

## Phase 3: EntryPage → 슬라이드오버

**핵심:** React Router 중첩 라우트로 AppViewPage 위에 오버레이 렌더링.

**수정 파일:**
- `frontend/src/main.tsx` — entry 라우트를 `apps/:appId`의 children으로 중첩
  ```
  { path: 'apps/:appId', element: <AppViewPage />, children: [
    { path: 'entries/new', element: <EntryPage /> },
    { path: 'entries/:entryId', element: <EntryPage /> },
  ]}
  ```
- `frontend/src/pages/AppViewPage.tsx` — JSX 하단에 `<Outlet />` 추가
- `frontend/src/pages/EntryPage.tsx` — 전체 페이지 div → `<Sheet open={true} onOpenChange={close → navigate back}>` 래핑. `SheetContent side="right" className="sm:max-w-2xl overflow-y-auto"`

URL은 그대로 유지 (`/apps/:appId/entries/:entryId`), 렌더링만 오버레이로 변경.

---

## Phase 4: 하단 시트 탭

**신규 파일:**
- `frontend/src/components/works/SheetTabs.tsx` — 워크북 내 시블링 시트 탭 바

**구현:**
- 이미 캐싱된 `useCollections()` 데이터에서 같은 `workbook_id` 시트 필터 (추가 API 호출 불필요)
- 엑셀 워크시트 탭 스타일 (하단 고정, 폴더 탭 모양, 활성 탭 하이라이트)
- 클릭 시 `/apps/:collectionId` 네비게이트
- 기존 SavedView 탭과 혼동 방지: SavedView 용어를 "시트" → "뷰"로 변경 (AppViewPage 631-707 라인)

**수정:**
- `frontend/src/pages/AppViewPage.tsx` — 하단에 `SheetTabs` 추가, SavedView UI 텍스트 "시트" → "뷰"로 변경

---

## Phase 5: 인라인 열 관리

**신규 파일:**
- `frontend/src/components/works/ColumnHeaderMenu.tsx` — 열 헤더 우클릭 컨텍스트 메뉴 (이름변경, 타입변경, 삭제, 좌/우 삽입, 숨기기)
- `frontend/src/components/works/AddColumnButton.tsx` — 열 헤더 끝 "+" 버튼

**수정:**
- `frontend/src/components/common/DataTable.tsx` — 헤더에 `onContextMenu` 핸들러, 마지막 열에 "+" 버튼. 새 props: `onAddColumn`, `onRenameColumn`, `onDeleteColumn`, `collectionId` (모두 optional)
- `frontend/src/components/works/views/SpreadsheetView.tsx` — `useAddField`, `useDeleteField` 훅 사용, 콜백을 DataTable에 전달

**백엔드:** `PATCH /api/schema/fields/{fieldId}` 이미 존재 (schema.go:284). `useUpdateField` 훅 추가 (`useCollections.ts`)

---

## 파일 요약

| 구분 | 파일 |
|------|------|
| **신규 (7)** | sidebar/AppSidebar, sidebar/FolderTree, sidebar/SidebarNav, hooks/useFolders, works/SheetTabs, works/ColumnHeaderMenu, works/AddColumnButton |
| **삭제 (3)** | pages/MyTasksPage, pages/InterfaceDesignerPage, pages/OrgChartPage |
| **백엔드 수정 (5)** | db/bootstrap.go, schema/models.go, schema/store.go, schema/workbook_store.go, schema/cache.go |
| **프론트 수정 (9)** | RootLayout, main.tsx, AppViewPage, EntryPage, types.ts, queryKeys.ts, useCollections.ts, DataTable.tsx, SpreadsheetView.tsx |

---

## 검증

1. `make dev-api` + `make dev-ui` 후 로그인
2. 사이드바 트리: 폴더/워크북/시트 3단 표시, 접기/펼치기, 시트 클릭 시 SpreadsheetView 열림
3. 시트 탭: 하단에 같은 워크북 시트들 표시, 탭 클릭으로 시트 전환
4. 행 클릭 → 우측 슬라이드오버로 상세 표시, X 닫으면 스프레드시트 유지
5. 열 헤더 "+" → 새 열 추가, 우클릭 → 이름변경/삭제 동작
6. 삭제된 페이지 URL 접근 시 404
7. `make build` 성공
