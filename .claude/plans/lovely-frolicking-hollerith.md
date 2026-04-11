# 엑셀 수준 우클릭 컨텍스트 메뉴 구현

## Context

현재 스프레드시트 우클릭 시 브라우저 기본 메뉴만 나오거나, editable 모드의 데이터 셀에서만 커스텀 메뉴가 표시됨. 엑셀은 **어디를 우클릭하든** 해당 위치에 맞는 컨텍스트 메뉴가 나온다. 이 차이가 "생긴거만 엑셀이고 사용자 경험은 전혀 다르다"는 핵심 문제.

## 현재 상태

| 위치 | 우클릭 동작 | 엑셀 기대 |
|------|-----------|---------|
| 데이터 셀 (editable) | ✅ GridContextMenu 표시 | ✅ |
| 데이터 셀 (readonly) | ❌ 브라우저 기본 메뉴 | 복사, 정렬, 필터 메뉴 |
| 열 헤더 | ✅ 헤더 메뉴 표시 | ✅ (단, 열 삽입/너비 자동맞춤 없음) |
| 행 번호 | ❌ 아무 반응 없음 | 행 선택 + 행 삽입/삭제/숨기기 메뉴 |

## 변경 계획

### 1단계: 셀 우클릭 — editable 제한 해제
**파일:** `DataTable.tsx` (line 1202-1208)

- `editable` 조건 제거 → 항상 `e.preventDefault()` + 커스텀 메뉴 표시
- readonly 모드에서는 복사/정렬/필터만 표시 (편집 관련 항목 숨김)
- GridContextMenu에 `readonly` prop 추가

**파일:** `GridContextMenu.tsx`
- `readonly?: boolean` prop 추가
- readonly일 때: 복사, 정렬, 필터만 표시 (붙여넣기, 셀 지우기, 행 삽입/삭제 숨김)

### 2단계: 행 번호 우클릭 메뉴 추가
**파일:** `DataTable.tsx` (line 362-379, _rowNum 컬럼 정의)

- 행 번호 클릭 시 해당 행 전체 선택 (grid.selectRow 호출)
- 행 번호 우클릭 시 행 컨텍스트 메뉴 표시

**새 컴포넌트:** `RowContextMenu.tsx` (GridContextMenu.tsx 패턴 따름)
- 위에 행 삽입
- 아래에 행 삽입  
- 행 삭제
- (readonly면 행 삽입/삭제 숨김, 복사만 표시)

**파일:** `DataTable.tsx`
- `rowMenu` state 추가 (headerMenu 패턴과 동일)
- _rowNum 셀에 `onContextMenu` 핸들러 추가
- _rowNum 셀에 `onClick` → 행 전체 선택

### 3단계: 열 헤더 메뉴 보강
**파일:** `DataTable.tsx` (line 1349-1468, 헤더 메뉴 인라인 코드)

기존 메뉴에 추가:
- **왼쪽에 열 삽입** — `onAddColumn` 콜백 활용 (위치 지정 기능 필요)
- **오른쪽에 열 삽입**
- **열 너비 자동맞춤** — 해당 열 데이터 중 가장 긴 값 기준으로 너비 조정
- **숨긴 열 표시** — 현재 숨긴 열이 있으면 토글 메뉴

### 4단계: 인라인 헤더 메뉴 → 별도 컴포넌트로 추출
**파일:** 새 `HeaderContextMenu.tsx`

현재 DataTable.tsx 내부에 120줄 인라인으로 있는 헤더 메뉴를 별도 컴포넌트로 추출. GridContextMenu와 동일한 MenuItem/Separator 패턴 사용.

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|---------|
| `frontend/src/components/common/DataTable.tsx` | 셀/행번호 우클릭 핸들러, 행번호 클릭→행선택, rowMenu state |
| `frontend/src/components/common/GridContextMenu.tsx` | readonly prop 추가 |
| `frontend/src/components/common/HeaderContextMenu.tsx` | **신규** — 헤더 우클릭 메뉴 추출 + 열 삽입/자동맞춤 추가 |
| `frontend/src/components/common/RowContextMenu.tsx` | **신규** — 행 번호 우클릭 메뉴 |
| `frontend/src/components/works/views/SpreadsheetView.tsx` | 열 삽입 위치 콜백 전달 |
| `frontend/src/pages/AppViewPage.tsx` | 열 삽입 위치 지원 (선택적) |

## 검증

1. `make dev-ui` 실행
2. 앱 열기 → 데이터 시트 진입
3. **셀 우클릭**: 편집/읽기 모드 모두 커스텀 메뉴 확인
4. **행 번호 클릭**: 행 전체 선택 확인
5. **행 번호 우클릭**: 행 메뉴 (삽입/삭제) 확인
6. **열 헤더 우클릭**: 기존 메뉴 + 열 삽입/자동맞춤 확인
7. **읽기 전용 모드**: 복사/정렬/필터만 표시되는지 확인
