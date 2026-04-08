# CLAUDE.md — Phaeton 프로젝트 규칙

## 프로젝트

에너지(태양광·풍력·ESS) 프로젝트 관리 ERP. Payload CMS 3.0 + Next.js 14 + PostgreSQL 16 + Tremor.
사용자 300명(입력 100, 열람 200), 외부 인터넷 접속, DGX Spark에서 구동.

## 필독 문서

코드 작성 전 반드시 해당 문서를 읽을 것:

- `docs/00-MASTER-PLAN.md` — 아키텍처, 디렉토리 구조, 전체 컨텍스트
- `docs/05-SOLAR-DOMAIN.md` — 태양광 인허가 절차, 공사 단계, 관련 법규, 마일스톤 템플릿. 도메인 작업 시 필수
- `docs/06-DESIGN-SYSTEM.md` — 색상, 상태 매핑, 톤앤매너. UI 작업 시 필수
- `docs/07-LINT-RULES.md` — 포매팅, 네이밍, import 순서

## 스택 규칙

- TypeScript 단일 스택. Python, Shell 스크립트 금지 (DB init 제외)
- Payload Collection으로 데이터 모델 정의. raw SQL로 테이블 만들지 않음
- 비즈니스 로직은 Payload Hooks (`beforeChange`, `afterChange`). DB 트리거 아님
- 대시보드 집계 쿼리만 `payload.db.drizzle`로 raw SQL 허용
- UI 컴포넌트는 Tremor 우선. Tremor에 없는 것만 Tailwind로 직접 구현
- 다크 모드 없음

## 코드 스타일

- 세미콜론 없음, 작은따옴표, trailing comma, 들여쓰기 2칸, 줄 폭 100자
- `any`: Collection/Hook 파일만 허용. 나머지 금지
- `console.log` 금지. `console.warn`, `console.error`만 허용
- `===` 강제, `var` 금지, `const` 우선
- import 순서: node 내장 → 외부 패키지 → @/ 내부 → 상대경로. 그룹 간 빈 줄

## 네이밍

- 컴포넌트 파일: PascalCase (`ProjectCard.tsx`)
- 유틸/훅 파일: camelCase (`copyMilestones.ts`)
- Collection slug: kebab-case (`project-milestones`)
- API 라우트: kebab-case (`/api/phaeton/staff-load`)

## 색상 규칙 (절대 준수)

색상은 의미 기반으로만 사용. 장식용 색상 금지.

- 정상/완료: `green-500`
- 진행중/정보: `blue-500`
- 경고/주의: `amber-500`
- 위험/지연: `red-500`
- 비활성/대기: `gray-300`
- 프로젝트 유형: 태양광=`amber`, 풍력=`sky`, ESS=`emerald`, 하이브리드=`violet`

## 상태 라벨 (한국어 고정)

마일스톤: done=완료, active=진행중, pending=대기, blocked=차단, skipped=건너뜀
프로젝트: planning=기획, permit=인허가, construction=시공, testing=시운전, cod=운영

## 대시보드 데이터 접근

서버 컴포넌트에서 Payload Local API 직접 호출:

```typescript
const payload = await getPayload({ config })
const projects = await payload.find({ collection: 'projects' })
```

집계 쿼리는 `src/lib/queries.ts`의 함수 사용. 새 집계 쿼리가 필요하면 이 파일에 추가.

## 로컬 AI 호출

`src/lib/ai/`의 `runPrompt()` 함수를 통해서만 호출. vLLM 직접 fetch 금지.
새 AI 기능은 `src/lib/ai/prompts/`에 프롬프트 파일 추가 + `registerPrompt()`.

## 커밋 메시지

```
feat: 마일스톤 타임라인 컴포넌트
fix: 인력 과할당 검증 날짜 비교 오류
chore: Tremor 버전 업데이트
docs: API 스펙 staff-load 응답 형식 수정
```

## 병렬 작업 규칙 (10+ 에이전트 동시 작업)

이 프로젝트는 여러 AI 에이전트가 worktree 기반으로 동시에 작업한다.
충돌 방지를 위해 아래 규칙을 반드시 지킬 것.

### 파일 충돌 방지

- 하나의 작업 단위(PR)에서 수정하는 파일 범위를 최소화
- Collection 파일 하나당 하나의 에이전트만 수정. 여러 Collection을 동시에 건드리지 않음
- `payload.config.ts`, `src/lib/queries.ts` 같은 공유 파일 수정 시 최소한의 라인만 변경
- `package.json` 의존성 추가는 반드시 별도 브랜치에서 단독으로

### DB 공유

- 모든 worktree는 동일한 PostgreSQL 인스턴스(localhost:5432) 공유
- 마이그레이션은 메인 브랜치에서만 실행. worktree에서 `payload migrate` 금지
- seed 데이터 변경은 기존 데이터를 삭제하지 않고 추가만 (upsert 패턴)

### 라이브 테스트

- 코드 작업 완료 후 반드시 `npm run test:live`로 스모크 테스트 실행
- 포트 3100–3199 범위에서 자동 할당 (10개 에이전트 동시 가능)
- 빌드 없이 빠른 확인: `npm run test:live:dev`
- 테스트 항목: 프론트 페이지, 헬스체크 API, Phaeton API 4종, 대시보드 페이지 4종
- 테스트 결과 JSON이 stdout 마지막 줄에 출력됨: `{"passed":N,"total":N,"port":N}`
- 서버는 테스트 후 자동 종료 (수동 정리 불필요)

### 빌드/타입

- `payload-types.ts`는 자동 생성 파일. 직접 수정 금지
- worktree에서 `generate:types` 실행 시 메인과 diff가 생기면 무시 (커밋하지 않음)
- `.next/`는 각 worktree별 독립 — 병렬 빌드 충돌 없음

### 커밋/브랜치

- 브랜치명: `feat/기능명`, `fix/버그명` — 작업 내용이 명확하게 드러나야 함
- 커밋은 작고 자주. 하나의 PR에 하나의 기능/버그
- 메인 브랜치에 직접 push 금지. 반드시 PR을 통해 merge

## 하지 말 것

- Payload Admin Panel 테마·레이아웃 수정
- `payload-types.ts` 수동 편집
- `migrations/` 수동 편집 (커스텀 마이그레이션 제외)
- 대시보드에 그라디언트, 그림자, 애니메이션 추가
- 12px 미만 글씨 크기 사용
