# 엑셀 단축키 구현 플랜

## Context
스프레드시트 뷰에 엑셀 수준의 키보드 단축키를 추가하여 파워유저 경험을 강화한다. 현재 기본 네비게이션(화살표, Tab, Enter)과 복사/붙여넣기만 지원하는 상태에서, Ctrl+Arrow 점프, Fill Down/Right, Cut, PageUp/Down 등 엑셀 핵심 단축키를 추가한다.

## 추가할 단축키 목록

| 단축키 | 동작 | 구현 위치 |
|--------|------|-----------|
| Ctrl+Arrow | 데이터 경계로 점프 | useGridNavigation |
| Ctrl+Shift+Arrow | 데이터 경계까지 선택 확장 | useGridNavigation (위와 동일 로직) |
| Ctrl+Home | 첫 셀(0,0)로 이동 | useGridNavigation |
| Ctrl+End | 마지막 셀로 이동 | useGridNavigation |
| PageUp/PageDown | 페이지 단위 이동 | useGridNavigation |
| Ctrl+X | 잘라내기 (복사+삭제) | DataTable → SpreadsheetView |
| Ctrl+D | 아래로 채우기 | DataTable → SpreadsheetView |
| Ctrl+R | 오른쪽으로 채우기 | DataTable → SpreadsheetView |
| Ctrl+; | 오늘 날짜 입력 | DataTable (onPaste 재활용) |

## 구현 계획

### Phase 1: 네비게이션 단축키 (useGridNavigation.ts)

**파일:** `frontend/src/hooks/useGridNavigation.ts`

#### 1-1. 옵션 인터페이스 확장
```ts
interface UseGridNavigationOptions {
  // 기존 ...
  getData?: (row: number, col: number) => unknown  // Ctrl+Arrow 점프용
  pageSize?: number  // PageUp/Down용
}
```

#### 1-2. Ctrl+Arrow 점프 헬퍼 함수 추가
`findJumpTarget(row, col, dRow, dCol, getData, rowCount, colCount)` — 엑셀 로직:
- 현재 셀이 비어있으면 → 해당 방향의 첫 번째 비어있지 않은 셀
- 현재 셀이 차있으면 → 연속된 데이터의 끝 (또는 빈 셀 직전)
- 경계에 도달하면 → 그리드 끝

#### 1-3. handleKeyDown 수정
기존 switch 문 **앞에** Ctrl 조합 체크 블록 추가:
```
if (isCtrl && arrow) → findJumpTarget → moveTo(target, shift)
```
Shift가 이미 moveTo의 extend 파라미터로 전달되므로 Ctrl+Shift+Arrow도 자동 처리.

#### 1-4. Home/End 케이스 수정
```ts
case 'Home':
  if (isCtrl) moveTo(0, 0, shift)         // Ctrl+Home → A1
  else moveTo(row, 0, shift)              // Home → 행 시작
case 'End':
  if (isCtrl) moveTo(rowCount-1, colCount-1, shift)  // Ctrl+End → 마지막
  else moveTo(row, colCount-1, shift)     // End → 행 끝
```

#### 1-5. PageUp/PageDown 추가
```ts
case 'PageUp':   moveTo(row - pageSize, col, shift)
case 'PageDown': moveTo(row + pageSize, col, shift)
```
moveTo 내부의 clampRow가 경계 처리.

### Phase 2: DataTable 변경 (DataTable.tsx)

**파일:** `frontend/src/components/common/DataTable.tsx`

#### 2-1. Props 추가
```ts
onCut?: (range: SelectionRange) => void
onFillDown?: (startRow: number, startCol: number, endRow: number, endCol: number) => void
onFillRight?: (startRow: number, startCol: number, endRow: number, endCol: number) => void
```

#### 2-2. useGridNavigation 호출 수정
```ts
const grid = useGridNavigation({
  // 기존 옵션...
  getData: editable ? (row, col) => {
    const colId = colIds[col]
    return (data[row] as Record<string, unknown>)?.[colId]
  } : undefined,
  pageSize: Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 800) / ROW_HEIGHT) - 1),
})
```

#### 2-3. handleClipboard 확장
기존 Ctrl+C, Ctrl+V 핸들러 뒤에 추가:

- **Ctrl+X**: `copyToClipboard()` 후 `onCut?.(range)` 호출
- **Ctrl+D**: 선택 범위의 첫 행 값을 아래로 채우기 → `onFillDown?.(norm)` 
- **Ctrl+R**: 선택 범위의 첫 열 값을 오른쪽으로 채우기 → `onFillRight?.(norm)`
- **Ctrl+;**: `onPaste?.(row, col, [[new Date().toISOString().split('T')[0]]])`

### Phase 3: SpreadsheetView 핸들러 (SpreadsheetView.tsx)

**파일:** `frontend/src/components/works/views/SpreadsheetView.tsx`

#### 3-1. handleCut 구현
선택 범위의 모든 편집 가능한 셀을 null로 설정 → `batchUpdateEntry(updates)` 호출

#### 3-2. handleFillDown 구현
선택 범위의 첫 행(startRow) 값을 아래 행들에 복사. 읽기전용/계산 필드 제외.

#### 3-3. handleFillRight 구현
선택 범위의 첫 열(startCol) 값을 오른쪽 열들에 복사. 읽기전용/계산 필드 제외.

#### 3-4. DataTable에 새 props 전달
```tsx
onCut={canManage ? handleCut : undefined}
onFillDown={canManage ? handleFillDown : undefined}
onFillRight={canManage ? handleFillRight : undefined}
```

### Phase 4: HotkeyHelpDialog 업데이트

**파일:** `frontend/src/components/common/HotkeyHelpDialog.tsx`

기존 '테이블' 그룹을 '테이블 탐색'과 '테이블 편집' 2개로 분리:

- **테이블 탐색**: 셀 이동, 범위 선택, 데이터 경계 이동, Home/End, PageUp/Down
- **테이블 편집**: Enter/F2, Escape, Delete, 복사/붙여넣기, 잘라내기, 채우기, 날짜 입력

## 엣지 케이스
- **Ctrl+R/D 브라우저 충돌**: 그리드 컨테이너가 포커스된 상태에서만 `e.preventDefault()` 동작 → 문제 없음
- **읽기전용 열**: readOnlyColumns + isComputedType 체크로 Fill/Cut 시 스킵
- **빈 데이터 Ctrl+Arrow**: getData가 없으면 기존 1칸 이동으로 폴백
- **선택 없이 Ctrl+D**: 활성 셀 바로 위의 값을 복사 (엑셀 동작)

## 검증 방법
1. `make dev-ui` 실행 후 스프레드시트 뷰 열기
2. 데이터가 있는 시트에서 각 단축키 테스트:
   - Ctrl+Arrow로 데이터 경계 점프 확인
   - Ctrl+Home/End로 시작/끝 이동 확인
   - PageUp/Down으로 페이지 단위 이동 확인
   - 범위 선택 후 Ctrl+D/R로 채우기 확인
   - Ctrl+X로 잘라내기 확인
   - Ctrl+;로 날짜 입력 확인
3. HotkeyHelpDialog(? 키)에서 새 단축키 표시 확인
