# 06. 디자인 시스템

Phaeton ERP 대시보드 디자인 규칙. 모든 UI 작업 전 이 문서를 참조할 것.

---

## 핵심 철학: "가구가 아니라 종이"

이 대시보드는 화려한 가구가 아니라 잘 정리된 종이 보고서다.
배경과 요소 사이에 경계를 만들지 않는다. 색으로 구분하지 않고 텍스트와 여백으로 구분한다.

**3원칙:**

1. **튀지 않는다** — 요소가 배경에서 떠오르면 안 된다. 박스, 테두리, 배경색 차이를 최소화.
2. **덜어낸다** — 테두리 넣을까 말까 고민하면 빼라. 배경색 넣을까 말까 고민하면 빼라.
3. **웜톤 단일 톤** — 전체 화면이 하나의 아이보리 종이처럼 보여야 한다. 차가운 색(blue, sky, cool gray) 금지.

---

## 1. 색상 체계

### 기본 팔레트: 아이보리 + Stone

| 용도                | 색상               | Hex       |
| ------------------- | ------------------ | --------- |
| 페이지 배경         | `bg-ivory-100`     | `#F4F3EE` |
| 카드/컴포넌트 배경  | `bg-ivory-50`      | `#FAF9F5` |
| 기본 텍스트         | `text-stone-800`   | `#292524` |
| 보조 텍스트         | `text-stone-500`   | `#78716C` |
| 테두리 (최소한으로) | `border-stone-200` | `#E7E5E4` |
| 비활성/대기         | `text-stone-400`   | `#A8A29E` |

### 금지 색상

- `bg-white` — 아이보리 배경에서 흰색은 튄다. `bg-ivory-50` 사용.
- `blue-*`, `sky-*` — 차가운 파란색 계열 전면 금지.
- `gray-*` — cool gray 금지. 반드시 `stone-*` (warm gray) 사용.

### 시맨틱 색상 (경고/상태 한정)

의미가 있을 때만 색상을 사용한다. 장식용 색상 금지.

| 의미      | 색상        | 용도                    |
| --------- | ----------- | ----------------------- |
| 완료/정상 | `green-400` | 타임라인 완료 노드      |
| 경고/주의 | `amber-400` | 기한 임박 표시          |
| 위험/지연 | `red-400`   | 지연, 차단, 오류        |
| 진행중    | `stone-600` | 활성 항목 (파란색 대신) |

> `-500` 대신 `-400` 사용 — 아이보리 배경에서 원색은 너무 강하다.

### 프로젝트 유형 구분

유형은 **색상이 아닌 텍스트**로 구분한다. Badge 배경색/테두리 없이 텍스트만.

---

## 2. 컴포넌트 원칙

### Badge/라벨

Tremor `<Badge>`는 사용하지 않는다. color prop이 blue/sky/gray를 하드코딩하고 CSS로 오버라이드 불가능.

대신 `<WarmBadge>` 사용:

```tsx
// 배경 없음, 테두리 없음, 텍스트만
<span className="text-sm text-stone-500">{label}</span>
```

꼭 시각적 구분이 필요한 경우에만 미세한 ring 사용:

```tsx
<span className="rounded px-1.5 text-sm text-stone-500 ring-1 ring-stone-200">{label}</span>
```

### Button

Tremor `<Button>`도 마찬가지로 파란색 하드코딩. 사용 최소화.
액션이 필요한 곳은 밑줄 텍스트 링크로 대체:

```tsx
<a className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700">다운로드</a>
```

### Card

Tremor `<Card>`는 사용 가능하되 `decorationColor`에 `"blue"` 금지.
웜톤만 허용: `"stone"`, `"amber"`, `"green"`, `"red"`.

### ProgressBar

Tremor `<ProgressBar>`에서 `color="blue"` 금지. 대신:

- 진행중: `color="neutral"` 또는 `color="amber"`
- 완료: `color="green"`

### Table

Tremor `<Table>`은 사용 가능. tailwind.config.ts에서 `tremor-background` 등의
CSS 변수를 아이보리로 오버라이드했으므로 배경은 자동 적용됨.

---

## 3. 상태 라벨

상태 텍스트는 **한국어 고정**. 영문 라벨을 사용자에게 노출하지 않는다.

### 마일스톤 상태

| 코드      | 라벨   | 표현                                |
| --------- | ------ | ----------------------------------- |
| `done`    | 완료   | `text-stone-500` (색상 구분 불필요) |
| `active`  | 진행중 | `text-stone-700 font-medium`        |
| `pending` | 대기   | `text-stone-400`                    |
| `blocked` | 차단   | `text-red-400` (유일하게 색상 사용) |
| `skipped` | 건너뜀 | `text-stone-400`                    |

### 프로젝트 상태

| 코드              | 라벨               |
| ----------------- | ------------------ |
| `gen-permit`      | 발전허가           |
| `dev-permit`      | 개발허가           |
| `civil`           | 토목               |
| `structural-elec` | 구조물 및 전기공사 |
| `inspection`      | 사용전 검사        |
| `pre-cod`         | 준공대기           |

---

## 4. 타이포그래피

- 폰트: Pretendard Variable (웹폰트, globals.css에서 로드)
- **최소 글씨 크기: 12px** (`text-xs` 이상)
- 기본 본문: 14px (`text-sm`)
- 제목: `text-base` ~ `text-xl`

---

## 5. UI 원칙

- **다크 모드 없음** — 라이트 모드 단일 지원
- **그라디언트, 그림자, 애니메이션 금지**
- **박스/카드 구분 최소화** — 가능하면 여백과 구분선으로 영역 나누기
- Tremor 컴포넌트 사용 시 색상 prop에 `"blue"`, `"sky"` 절대 금지
- 별도 UI 라이브러리 추가 금지
