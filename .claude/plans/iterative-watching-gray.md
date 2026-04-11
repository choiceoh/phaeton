# 엑셀 수준 드래그/선택 경험 구현 플랜

## Context
현재 스프레드시트에서 셀 드래그 선택, 자동 스크롤, 채우기 핸들 가로 지원, 행/열 헤더 드래그 선택, 더블클릭 자동 채우기 등 엑셀의 기본적인 드래그 조작이 빠져 있다. 사용자가 "블럭 드래그 같은 경험이 엑셀과 거리가 먼데"라고 느끼는 핵심 원인이다.

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/hooks/useGridNavigation.ts` | 드래그 선택 로직 추가 (mousedown→mousemove→mouseup) |
| `frontend/src/hooks/useFillHandle.ts` | 가로 채우기 + 더블클릭 자동 채우기 |
| `frontend/src/hooks/useAutoScroll.ts` | **신규** — 드래그 중 가장자리 자동 스크롤 유틸 |
| `frontend/src/components/common/DataTable.tsx` | 드래그 선택 이벤트 연결, 헤더 드래그 선택 |
| `frontend/src/styles/index.css` | 드래그 선택 중 시각 피드백 CSS |

---

## 1. 드래그로 범위 선택 (`useGridNavigation` 확장)

현재 셀 클릭 시 `handleCellClick`만 있고, 드래그(mousedown→mousemove)로 범위를 잡는 로직이 없다.

### 구현
- `handleCellMouseDown(row, col, e)` 추가 — shift 아닌 일반 클릭 시 드래그 시작점 기록
- `dragStateRef`에 `{ isDragging, anchorRow, anchorCol }` 저장
- document에 mousemove/mouseup 리스너 등록
- mousemove: `elementFromPoint`로 현재 셀 찾기 → `setSelection({ startRow: anchor.row, startCol: anchor.col, endRow: targetRow, endCol: targetCol })`
- mouseup: 리스너 제거, 드래그 완료
- `didDragSelectRef` 플래그로 드래그 후 onClick 억제 (기존 cellDrag 패턴 동일)
- **5px 이상 이동해야 드래그 시작** (클릭과 구별)

### DataTable 연결
- 현재 onClick → handleCellClick 대신, onMouseDown에서 드래그 선택 시작
- cellDrag (move/copy)와 구분: cellDrag는 **선택된 셀의 테두리**에서만 시작, 드래그 선택은 **셀 내부** 클릭에서 시작
- 우선순위: cellDrag.isNearBorder → cellDrag / 그 외 → 드래그 선택

### 이벤트 우선순위 (onMouseDown)
```
1. fillHandle 위 → fillHandle.handleMouseDown (기존)
2. 셀 테두리 → cellDrag.handleCellMouseDown (기존)
3. 셀 내부 → grid.handleCellMouseDown (신규 드래그 선택)
```

---

## 2. 자동 스크롤 (`useAutoScroll` 신규 훅)

드래그 중 뷰포트 가장자리에 커서가 닿으면 자동 스크롤.

### 구현
```typescript
export function useAutoScroll(containerRef: RefObject<HTMLElement>) {
  const frameRef = useRef<number>(0)
  
  const start = (clientX: number, clientY: number) => {
    // 컨테이너 rect 대비 커서 위치 → 가장자리 40px 이내면 스크롤
    // requestAnimationFrame 루프로 부드럽게 스크롤
    // 거리에 비례한 스크롤 속도 (가장자리에 가까울수록 빠름)
  }
  
  const stop = () => cancelAnimationFrame(frameRef.current)
  
  return { update: start, stop }
}
```

### 적용 대상
- 드래그 선택 (useGridNavigation)
- 채우기 핸들 (useFillHandle)
- 셀 이동/복사 (useCellDragMove)

모든 훅의 mousemove 핸들러에서 `autoScroll.update(ev.clientX, ev.clientY)` 호출, mouseup에서 `autoScroll.stop()`.

---

## 3. 열/행 헤더 드래그 선택 (DataTable 확장)

### 열 헤더 클릭
- 열 헤더 클릭 → 해당 열 전체 선택 (`selection = { startRow: 0, startCol: col, endRow: lastRow, endCol: col }`)
- Shift+클릭 → 앵커 열부터 현재 열까지 확장
- 드래그 → 여러 열 선택

### 행 번호 클릭
- 행 번호(#열) 클릭 → 해당 행 전체 선택 (`selection = { startRow: row, startCol: 0, endRow: row, endCol: lastCol }`)
- Shift+클릭 → 확장
- 드래그 → 여러 행 선택

### DataTable 변경
- 열 헤더 `<th>`에 onMouseDown 추가
- 행 번호 `<td className="_rowNum">`에 onMouseDown 추가
- `useGridNavigation`에 `selectFullColumn(col)`, `selectFullRow(row)` 메서드 추가

---

## 4. 채우기 핸들 가로 지원 (`useFillHandle` 확장)

현재 세로(행 방향)만 지원. 가로(열 방향) 채우기 추가.

### 변경 사항
- mousemove에서 `targetCol` 도 확인
- 방향 판단: 먼저 이동한 축(행 vs 열) 기준으로 방향 고정 (엑셀 동작)
  - 세로 이동이 먼저 → 기존 세로 채우기
  - 가로 이동이 먼저 → 가로 채우기
- `generateFillValues` 함수를 가로 방향에도 적용: 각 행에 대해 소스 행의 해당 셀 값을 패턴 분석 후 채움
- 가로 채우기 시 readOnly 컬럼 건너뛰기

---

## 5. 더블클릭 자동 채우기 (`useFillHandle` 확장)

채우기 핸들을 더블클릭하면 왼쪽 인접 열의 데이터 범위만큼 자동으로 아래로 채움 (엑셀 동작).

### 구현
- `handleFillHandleDoubleClick` 추가
- 로직:
  1. 현재 소스 범위의 왼쪽 열 확인
  2. 왼쪽 열에서 소스 마지막 행 아래로 비어있지 않은 마지막 행 찾기
  3. 그 행까지 세로 채우기 실행
- DataTable에서 채우기 핸들에 `onDoubleClick` 추가

---

## 구현 순서

1. `useAutoScroll` 훅 작성 (다른 모든 드래그 기능에서 사용)
2. `useGridNavigation` — 드래그 선택 추가 + DataTable 연결
3. 행/열 헤더 드래그 선택
4. `useFillHandle` — 가로 채우기 + 더블클릭 자동 채우기
5. CSS 시각 피드백 보강
6. 자동 스크롤을 기존 `useFillHandle`, `useCellDragMove`에도 통합

## 검증

- `make dev-ui`로 개발 서버 실행
- 브라우저에서 스프레드시트 열기
- 테스트 항목:
  - 셀 클릭 후 드래그 → 블록 선택 + 파란 배경
  - 드래그 중 가장자리 → 자동 스크롤
  - 열 헤더 클릭/드래그 → 전체 열 선택
  - 행 번호 클릭/드래그 → 전체 행 선택
  - 채우기 핸들 가로 드래그 → 가로 채우기
  - 채우기 핸들 더블클릭 → 자동 채우기
  - 기존 기능(셀 이동/복사, Shift+클릭, 키보드 선택) 정상 동작 확인
