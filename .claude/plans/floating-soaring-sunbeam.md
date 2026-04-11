# 양방향 링크 (Bidirectional Links) 구현 계획

## Context

Collection A가 Collection B를 참조하는 relation 필드가 있을 때, Collection B의 스프레드시트 뷰에서 자동으로 "A에서 나를 참조하는 레코드들" 목록을 read-only 가상 열로 표시. 인프라(ReverseRelField 메타, 캐시 인덱스, schema API)는 완료 — 핸들러 데이터 주입 + 프론트 렌더링만 구현.

---

## Backend

### 1. `loadReverseRelFields()` 추가
**파일:** `backend/internal/handler/dynamic.go` (loadM2MFields 뒤)

```go
func (h *DynHandler) loadReverseRelFields(ctx context.Context, records []map[string]any, col schema.Collection)
```

- `h.cache.ReverseRelations(col.ID)` → `[]ReverseRelField`
- 레코드 ID 수집 → 역참조별 배치 쿼리
- **1:N**: `SELECT id, {displayCol} FROM data."{sourceSlug}" WHERE "{sourceFieldSlug}" IN ($1...) AND deleted_at IS NULL`
- **M:N**: junction 테이블 조회 → source 레코드 배치 페치
- 결과를 `_rev_{sourceSlug}_{sourceFieldSlug}` 키로 레코드에 주입 (값: `[]map[string]any{{"id":..,"label":..}}`)
- displayCol 결정: source 컬렉션 필드 중 첫 번째 text 타입, 없으면 "id"
- 에러 시 비치명적 처리 (slog.Warn + 빈 배열)

### 2. `displayFieldSlug()` 헬퍼
**파일:** `backend/internal/handler/dynamic.go`
- 필드 목록에서 첫 text 타입 필드 slug 반환, 없으면 "id"

### 3. List() / Get()에 연결
**파일:** `backend/internal/handler/dynamic.go`
- `loadM2MFields` 호출 뒤에 추가
- `?reverse=true` 쿼리 파라미터로 opt-in

---

## Frontend

### 4. 타입 추가
**파일:** `frontend/src/lib/types.ts`
- `ReverseRelField` 인터페이스 추가
- `Collection`에 `reverse_relations?: ReverseRelField[]` 추가

### 5. useEntries에 reverse 파라미터 지원
**파일:** `frontend/src/hooks/useEntries.ts`
- `EntryListParams`에 `reverse?: string` 추가
- `buildQueryString`에서 `reverse` 파라미터 직렬화

### 6. AppViewPage에서 reverse=true 전달
**파일:** `frontend/src/pages/AppViewPage.tsx`
- useEntries 호출 시 `reverse: 'true'` 추가

### 7. SpreadsheetView에 역참조 열 렌더링
**파일:** `frontend/src/components/works/views/SpreadsheetView.tsx`

- **열 생성**: `collection.reverse_relations` 순회하며 `_rev_*` 열 추가
  - 헤더: `← {source_collection_label}`
  - 셀: 배열 → label 추출 → 쉼표 구분 표시
  - 정렬 비활성화, 너비 180
- **read-only**: `readOnlyColumns`에 역참조 키 추가
- **기본 숨김**: `initialColumnVisibility`에서 역참조 열 `false` 설정 (사용자가 열 선택기로 토글 가능)

### 8. 셀 클릭 시 원본 시트 이동
**파일:** `frontend/src/components/works/views/SpreadsheetView.tsx` + `AppViewPage.tsx`
- 역참조 셀 내 각 항목을 클릭 가능한 링크로 렌더링
- 클릭 시 원본 컬렉션으로 이동 (필터 적용: sourceFieldSlug = 현재 레코드 ID)
- `onReverseCellClick` 콜백을 SpreadsheetView props에 추가, AppViewPage에서 `navigate()` 연결

---

## 검증 방법

1. `make dev-api && make dev-ui`
2. 관계 필드가 있는 시트 쌍 확인 (예: 프로젝트 → 업무)
3. 타겟 시트(프로젝트)에서 열 선택기로 `← 업무` 열 표시
4. 역참조 셀에 참조 레코드 label이 표시되는지 확인
5. 셀 클릭 시 원본 시트(업무)로 필터 적용 이동되는지 확인
6. 역참조 열이 편집 불가인지 확인
7. M:N 관계도 동일하게 동작하는지 확인
