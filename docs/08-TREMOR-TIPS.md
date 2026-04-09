# 08. Tremor 삽질 기록 & 팁

Tremor v3 + Tailwind + Next.js (Turbopack) 조합에서 겪은 문제와 해결책.
다음 세션에서 같은 삽질 반복하지 말 것.

---

## 1. Tremor 색상은 CSS로 오버라이드 불가능

### 문제

Tremor 컴포넌트(`Badge`, `Button`, `ProgressBar` 등)는 `color` prop에 따라
`bg-blue-500`, `ring-sky-500`, `border-blue-500` 같은 Tailwind 클래스를 **인라인으로 하드코딩**한다.

```html
<!-- Tremor Badge color="gray" 실제 출력 -->
<span
  class="tremor-Badge-root bg-gray-500 bg-opacity-10 text-gray-600 ring-gray-500 ring-opacity-20 ... ..."
></span>
```

### 시도했지만 실패한 것들

1. **globals.css에서 `.tremor-Badge-root` 오버라이드**
   → Tailwind/PostCSS가 빌드 시 purge함. CSS 번들에 포함 안 됨.

2. **`[class*='tremor-Badge-root']` 속성 선택자**
   → Turbopack이 이것도 purge함.

3. **`!important`로 강제 오버라이드**
   → purge되면 `!important`도 의미 없음.

4. **tailwind.config.ts에서 `tremor-brand`, `tremor-background` 등 CSS 변수 오버라이드**
   → Card, Table, Select, TextInput 등 시맨틱 변수 쓰는 컴포넌트는 **이걸로 해결됨**.
   → 하지만 Badge, Button, ProgressBar는 시맨틱 변수가 아니라 `blue-500` 같은 **직접 색상 클래스**를 사용해서 소용없음.

### 해결책

**Tremor 컴포넌트를 사용하지 않고 직접 만든다.**

- `<Badge>` → `<WarmBadge>` (src/components/WarmBadge.tsx)
- `<Button>` → `<a>` 태그 + Tailwind 스타일
- `<ProgressBar color="blue">` → `color="neutral"` 또는 `color="amber"` (Tremor가 neutral은 gray 계열로 렌더링)

```tsx
// WarmBadge — 배경/테두리 없이 텍스트만
export function WarmBadge({ children }) {
  return <span className="text-sm text-stone-500">{children}</span>
}
```

---

## 2. tailwind.config.ts Tremor 시맨틱 변수 — 이건 효과 있음

Tremor의 Card, Table, Select, TextInput 등은 `bg-tremor-background`, `border-tremor-border` 같은 시맨틱 Tailwind 클래스를 사용한다. 이건 tailwind.config.ts에서 오버라이드 가능:

```typescript
colors: {
  tremor: {
    background: { DEFAULT: '#FAF9F5' },  // ivory
    border: { DEFAULT: '#D6D3D1' },       // stone-300
    ring: { DEFAULT: '#D6D3D1' },
    brand: { DEFAULT: '#57534E' },        // stone-600
    content: { DEFAULT: '#78716C' },      // stone-500
  },
}
```

이렇게 하면 Card 배경, Table 배경, Input 테두리 등이 일괄 웜톤으로 바뀐다.
**Badge와 Button은 이 변수를 안 쓰므로 효과 없음** (위 1번 참고).

---

## 3. Next.js 빌드 서빙 주의사항

### .next 캐시

`npm run build` 후에도 이전 빌드의 `.next`가 남아있으면 이전 CSS가 서빙된다.
**반드시 `rm -rf .next` 후 빌드.**

### next-server 프로세스 좀비

`next start`로 서버를 띄운 뒤 `kill`로 죽여도 자식 프로세스(`next-server`)가 살아있는 경우가 많다.

```bash
# 확인
ss -tlnp | grep 3100

# 강제 종료
pkill -9 -f 'next-server'
```

`lsof -ti:3100 | xargs kill -9`도 부모만 죽이고 자식이 포트를 물고 있는 경우가 있으니
`pkill -9 -f 'next-server'`가 더 확실하다.

### worktree → main 파일 복사 안 됨

git worktree는 같은 git 인덱스를 공유한다.
`cp worktree/file main/file`이 **겉보기에는 성공하지만 실제 파일 내용이 안 바뀌는** 경우가 있다.

**해결:** worktree에서 커밋 → push → main에서 pull. 파일 직접 복사하지 말 것.

---

## 4. Tremor 컴포넌트별 색상 제어 가능 여부

| 컴포넌트             | 시맨틱 변수 사용            | CSS 오버라이드         | 직접 교체 필요           |
| -------------------- | --------------------------- | ---------------------- | ------------------------ |
| Card                 | ✅ `bg-tremor-background`   | tailwind.config로 해결 | ❌                       |
| Table                | ✅                          | tailwind.config로 해결 | ❌                       |
| TextInput            | ✅                          | tailwind.config로 해결 | ❌                       |
| Select               | ✅ (배경), ❌ (포커스 ring) | 부분 해결              | △                        |
| Badge                | ❌ 직접 색상 하드코딩       | 불가능                 | ✅ WarmBadge             |
| Button               | ❌ 직접 색상 하드코딩       | 불가능                 | ✅ 텍스트 링크           |
| ProgressBar          | ❌ color prop 하드코딩      | 불가능                 | △ `color="neutral"` 사용 |
| Card decorationColor | ❌ 직접 색상 하드코딩       | 불가능                 | △ `"stone"` 등 웜톤만    |

---

## 5. 브라우저 캐시

프로덕션 빌드(`next start`)는 CSS/JS에 content hash가 붙지만,
같은 빌드를 재시작하면 같은 hash → 브라우저가 캐시에서 로드.

디자인 변경 후 확인할 때:

1. 시크릿/프라이빗 창 사용 (가장 확실)
2. 또는 개발자도구 → Application → Clear site data
3. Ctrl+Shift+R은 Service Worker가 있으면 안 먹힐 수 있음

---

## 6. 요약: 색상 변경 작업 시 체크리스트

1. [ ] Tremor 시맨틱 변수 쓰는 컴포넌트인가? → tailwind.config.ts 수정
2. [ ] color prop 하드코딩 컴포넌트인가? → 커스텀 컴포넌트로 교체
3. [ ] globals.css에 CSS 추가했는가? → Turbopack이 purge할 수 있으니 빌드 후 확인
4. [ ] `rm -rf .next` 했는가?
5. [ ] `pkill -9 -f 'next-server'` 했는가?
6. [ ] 시크릿 창에서 확인했는가?
