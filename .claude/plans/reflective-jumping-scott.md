# 엑셀 인터랙션 강화 — 우클릭 메뉴 + 필 핸들 + 셀 드래그 이동/복사

## Context

SpreadsheetView의 셀 인터랙션이 아직 엑셀 수준에 미치지 못함. 우클릭 메뉴는 4개 항목뿐이고, 필 핸들(자동 채우기)과 셀 드래그 이동/복사가 없음. 이 3가지를 순차 구현하여 엑셀 사용자에게 익숙한 UX를 제공.

---

## Phase 1: 우클릭 컨텍스트 메뉴 강화

### GridContextMenu.tsx — 확장 리라이트
현재 4개 항목(복사, 붙여넣기, 셀 지우기, 행 삭제)을 엑셀 수준으로 확장:

```
복사              Ctrl+C
붙여넣기           Ctrl+V
──────────────────
셀 지우기          Del
──────────────────
위에 행 삽입
아래에 행 삽입
──────────────────
오름차순 정렬
내림차순 정렬
──────────────────
이 값으로 필터     (셀 값 표시)
──────────────────
행 삭제            (빨간색)
```

**새 props 추가:**
- `onInsertRowAbove`, `onInsertRowBelow`
- `onSortAscending`, `onSortDescending`  
- `onFilterByValue`, `cellValue`, `columnLabel`

### DataTable.tsx — 새 콜백 연결
- `Props<T>`에 `onInsertRow`, `onFilterByValue` 추가
- 셀 우클릭 시 `GridContextMenu`에 새 props 전달
  - 정렬: `onSortChange?.([{ id: colIds[cellMenu.colIdx], desc: false/true }])`
  - 필터: `onFilterByValue?.(colIds[cellMenu.colIdx], data[cellMenu.rowIdx][colIds[cellMenu.colIdx]])`
  - 행 삽입: `onInsertRow?.()`

### 헤더 우클릭 메뉴 강화 (DataTable.tsx 내 인라인 JSX)
기존 고정/숨기기 위에 정렬 옵션 추가:
```
오름차순 정렬
내림차순 정렬
──────────────────
왼쪽 고정 / 오른쪽 고정 / 고정 해제
컬럼 숨기기
```

### SpreadsheetView.tsx — 새 props 전달
- `onInsertRow`, `onFilterByValue` props 추가 후 DataTable에 전달

### AppViewPage.tsx — 콜백 구현
- **행 삽입**: `createEntry.mutateAsync({})` 호출 (빈 행 생성)
- **필터**: FilterGroup에 조건 추가
  ```ts
  setFilterGroup(prev => ({
    ...prev,
    conditions: [...prev.conditions, {
      id: crypto.randomUUID(),
      field: fieldSlug,
      operator: value === null ? 'is_null' : 'eq',
      value: String(value ?? ''),
    }],
  }))
  ```

### 수정 파일
- `frontend/src/components/common/GridContextMenu.tsx`
- `frontend/src/components/common/DataTable.tsx`
- `frontend/src/components/works/views/SpreadsheetView.tsx`
- `frontend/src/pages/AppViewPage.tsx`

---

## Phase 2: 필 핸들 (드래그 자동 채우기)

### index.css 수정
`.grid-cell-active::before`(현재 `pointer-events: none`)를 실제 DOM 요소로 대체. `::before` 제거, `::after`(셀 테두리)는 유지.

### 새 훅: `frontend/src/hooks/useFillHandle.ts`

```ts
interface UseFillHandleOptions {
  activeCell: CellPosition | null
  selection: SelectionRange | null
  data: Record<string, unknown>[]
  columnIds: string[]
  fields: Field[]
  readOnlyColumns: Set<string>
  containerRef: React.RefObject<HTMLDivElement>
  onFill: (updates: { id: string; fields: Record<string, unknown> }[]) => void
}
```

**핵심 로직:**
1. 활성 셀/선택 영역의 우하단에 6x6 파란 사각형 렌더링
2. `mousedown` → `document.mousemove/mouseup` 리스너 등록
3. 드래그 방향 감지 (수직만 허용 — 엑셀 기본 동작)
4. 마우스 위치에서 대상 셀 계산 (`data-row`/`data-col` 어트리뷰트 활용)
5. `mouseup` 시 채우기 값 계산 후 `onFill` 호출

**채우기 규칙:**
- **텍스트/셀렉트/관계**: 소스 값 반복
- **숫자**: 소스 1개→반복, 소스 2개 이상→등차수열 패턴 감지 (step = v[1]-v[0])
- **날짜**: 일 단위 증가
- **boolean**: 반복
- **계산 필드/레이아웃**: 스킵

### DataTable.tsx 수정
- 셀에 `data-row={rowIdx}` `data-col={colIdx}` 어트리뷰트 추가
- `useFillHandle` 훅 호출
- 필 핸들 DOM 요소 렌더링 (활성 셀/선택 영역 우하단에 absolute 위치)
- 필 프리뷰 범위 시각화 (점선 파란 테두리)

### SpreadsheetView.tsx 수정
- `onFill` 콜백 구현: `batchUpdateEntry` + `recomputeRow`

### 수정 파일
- `frontend/src/hooks/useFillHandle.ts` (신규)
- `frontend/src/index.css`
- `frontend/src/components/common/DataTable.tsx`
- `frontend/src/components/works/views/SpreadsheetView.tsx`

---

## Phase 3: 셀 드래그 이동/복사

### 새 훅: `frontend/src/hooks/useCellDragMove.ts`

**핵심 로직:**
1. 활성 셀/선택 영역 테두리에 마우스가 3px 이내 → 커서를 `move`로 변경
   (단, 우하단 필 핸들 영역 제외)
2. 해당 위치에서 `mousedown` → 드래그 시작
3. `Ctrl/Cmd` 눌렸으면 복사 모드, 아니면 이동 모드
4. 드래그 중: 대상 위치에 점선 테두리 표시 (이동=회색, 복사=파랑)
5. `mouseup`:
   - **이동**: 소스 셀 null 처리 + 대상 셀 값 쓰기
   - **복사**: 대상 셀만 값 쓰기
   - 겹치는 영역 처리: 소스 값 먼저 읽어둔 뒤 쓰기

### DataTable.tsx 수정
- 셀에 `onMouseMove` 추가 (테두리 감지 → 커서 변경)
- 드래그 고스트 렌더링
- 드래그 완료 후 클릭 이벤트 억제 (`didDrag` ref)

### SpreadsheetView.tsx 수정
- `onCellMove`/`onCellCopy` 콜백 → `batchUpdateEntry`

### 수정 파일
- `frontend/src/hooks/useCellDragMove.ts` (신규)
- `frontend/src/components/common/DataTable.tsx`
- `frontend/src/components/works/views/SpreadsheetView.tsx`

---

## 검증

1. `make dev-ui`로 Vite 개발 서버 실행
2. 브라우저에서 앱 열기 → 시트 데이터 확인
3. 각 기능 수동 테스트:
   - 셀/헤더 우클릭 → 메뉴 항목 확인 → 각 액션 실행
   - 필 핸들 드래그 → 값 채워지는지 확인
   - 셀 테두리 드래그 → 이동/복사 확인
4. `npx tsc --noEmit`로 타입 체크
5. `npx eslint src/ --ext .ts,.tsx`로 린트 확인
