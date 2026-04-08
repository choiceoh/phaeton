# Phaeton ERP — 에너지 프로젝트 관리 시스템 마스터 플랜

**프로젝트명:** Phaeton (태양신 헬리오스의 아들 — 에너지 사업 관리 시스템)
**목적:** 엑셀과 개인 머릿속에 분산된 20+ 에너지 프로젝트 정보를 통합. 그룹 구성원 간 정보 공유를 쉽게 한다.
**사용자:** 총 300명 (데이터 입력·수정 100명, 열람 200명), 외부 인터넷 접속
**Deneb/Vega 연동:** 별개 시스템, REST API 연동만

---

## 1. 아키텍처 핵심 원칙

> "인프라는 빌려오고, 도메인만 만든다."

Payload CMS 3.0을 인프라 레이어로 사용하고, 에너지 사업 특화 도메인 로직만 직접 구현한다.

- **Payload가 제공하는 것:** 인증, RBAC, Admin UI, REST/GraphQL API, 파일 스토리지, 감사 로그.
- **직접 만드는 것:** 마일스톤 엔진, 포트폴리오 대시보드, 인허가 추적, 기성금 관리, 예산·비용 관리, Deneb 연동.

**핵심 장점:** TypeScript 단일 스택, Next.js 네이티브 통합, 하나의 앱·하나의 배포.

```
[현장 300명] → [Caddy HTTPS] → [Next.js + Payload 단일 앱]
                                    │
                                    ├── /admin        → Payload Admin Panel (관리자 10명)
                                    ├── /dashboard    → 커스텀 대시보드 (전체 300명)
                                    ├── /input        → 현장 입력 폼 (100명)
                                    ├── /api          → REST API (Deneb 호출)
                                    │
                                    └── [PostgreSQL 16]
                                            │
                                    [Deneb 텔레그램 봇] → /api/phaeton/* 호출
```

---

## 2. 기술 스택

| 레이어 | 선택 | 근거 |
|--------|------|------|
| 프레임워크 | Payload CMS 3.0 + Next.js 14 | 인증·RBAC·Admin UI 내장, TS 단일 스택 |
| DB | PostgreSQL 16 | Payload의 Drizzle 어댑터 공식 지원 |
| ORM | Drizzle (Payload 내장) | Payload가 스키마 관리, 필요 시 raw SQL 가능 |
| UI | Tremor + Tailwind | 대시보드 특화 컴포넌트 (Table, Card, ProgressBar 내장) |
| 인프라 | Docker Compose (Caddy + App + PG) | 단일 서버, HTTPS 자동 |
| 인증 | Payload 내장 (이메일/비밀번호) | RBAC 함수 기반, 필드 레벨 접근 제어 |

---

## 3. 데이터 모델 — Payload Collections

Payload에서는 테이블 대신 Collection config로 데이터 모델을 정의한다.
기존 SQL 스키마의 핵심 구조는 유지하되, Payload 방식에 맞게 재구성.

| Collection | 설명 | 기존 SQL 대응 |
|------------|------|---------------|
| sites | 물리적 현장 | site 테이블 |
| projects | 발전/ESS 사업 | project 테이블 |
| milestone-templates | 유형별 표준 마일스톤 | milestone_template 테이블 |
| project-milestones | 실제 마일스톤 인스턴스 | project_milestone 테이블 |
| project-documents | 인허가 서류, 계약서 | project_document 테이블 |
| users | 시스템 사용자 (Payload 내장 확장) | 신규 — 인증·역할 관리 |

### PostgreSQL 고급 기능 처리 전략

| 기존 설계 | Payload 내 처리 방식 |
|-----------|---------------------|
| PostgreSQL 뷰 4개 | Payload 초기화 후 payload.db.drizzle로 raw SQL 실행 |
| 트리거 (마일스톤 자동 복사) | afterChange 훅에서 TS로 구현 (더 유연함) |
| updated_at 자동 갱신 | Payload 기본 제공 (timestamps: true) |

---

## 4. 사용자 역할 (RBAC)

| 역할 | 인원 | 권한 |
|------|------|------|
| director | 1명 | 전체 읽기/쓰기, Admin Panel 접근, 사용자 관리 |
| pm | 10~15명 | 담당 프로젝트 읽기/쓰기, Admin Panel 접근 |
| engineer | ~85명 | 배정된 프로젝트의 마일스톤·서류 업데이트 |
| viewer | ~200명 | 전체 읽기 전용, 대시보드만 접근 |

Payload의 함수 기반 Access Control로 구현:

```typescript
// 예: PM은 자기 프로젝트만 수정 가능
access: {
  update: ({ req: { user } }) => {
    if (user.role === 'director') return true;
    if (user.role === 'pm') return { 'assignedPM': { equals: user.id } };
    return false;
  }
}
```

---

## 5. 병렬 작업 파트 및 우선순위

| 파트 | 파일 | 우선순위 | 의존성 |
|------|------|----------|--------|
| A. Payload + PG 초기 세팅 | 01-PAYLOAD-SETUP.md | P0 (최우선) | 없음 |
| B. Collection 정의 + Hooks | 02-COLLECTIONS.md | P0 | A 완료 후 |
| C. 대시보드 프론트엔드 | 03-DASHBOARD.md | P1 | B 완료 후 |
| D. Deneb API 연동 | 04-DENEB-API.md | P2 | B 완료 후 |

- **Phase 1 목표 (2주):** A + B 완료. Admin Panel에서 데이터 입력·관리 가능한 상태.
- **Phase 2 목표 (4주):** C 완성. 디렉터용 통합 대시보드 운영.
- **Phase 3 목표 (6주):** D 연동 + 기존 엑셀 데이터 마이그레이션 + 300명 배포.

---

## 6. 디렉토리 구조

```
phaeton/
├── docker-compose.yml              # Caddy + App + PostgreSQL
├── Dockerfile                       # Next.js + Payload 빌드
├── .env                             # DB_URL, PAYLOAD_SECRET 등
├── payload.config.ts                # Payload 메인 설정
├── src/
│   ├── collections/                 # Payload Collection 정의
│   │   ├── Sites.ts
│   │   ├── Projects.ts
│   │   ├── MilestoneTemplates.ts
│   │   ├── ProjectMilestones.ts
│   │   ├── ProjectDocuments.ts
│   │   └── Users.ts
│   ├── hooks/                       # 도메인 비즈니스 로직
│   │   ├── copyMilestones.ts        # 프로젝트 생성 → 마일스톤 자동 복사
│   │   └── checkMilestoneDeps.ts    # 마일스톤 선행 조건 검증
│   ├── access/                      # RBAC 접근 제어 함수
│   │   ├── roles.ts                 # 역할 정의 (director, pm, engineer, viewer)
│   │   ├── isDirector.ts
│   │   ├── isProjectMember.ts
│   │   └── isReadOnly.ts
│   ├── app/                         # Next.js App Router (커스텀 페이지)
│   │   ├── (frontend)/              # 대시보드 + 입력 폼 (Route Group)
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx         # 포트폴리오 대시보드
│   │   │   ├── projects/[id]/
│   │   │   │   └── page.tsx         # 프로젝트 상세
│   │   │   └── alerts/
│   │   │       └── page.tsx         # 알림 센터
│   │   └── api/
│   │       └── phaeton/             # Deneb 전용 API 라우트
│   │           ├── project-status/route.ts
│   │           ├── overdue/route.ts
│   │           └── summary/route.ts
│   ├── lib/
│   │   ├── queries.ts               # Drizzle raw SQL (대시보드 집계 쿼리)
│   │   └── types.ts
│   └── components/
│       ├── ProjectCard.tsx
│       ├── MilestoneTimeline.tsx
│       └── AlertPanel.tsx
├── migrations/                       # Payload 자동 생성 + 커스텀 SQL
└── docs/
    ├── 00-MASTER-PLAN.md
    ├── 01-PAYLOAD-SETUP.md
    ├── 02-COLLECTIONS.md
    ├── 03-DASHBOARD.md
    └── 04-DENEB-API.md
```

---

## 7. 핵심 제약조건 및 원칙

- Payload Admin Panel이 관리자의 일상 인터페이스. PM과 디렉터가 데이터를 직접 편집·관리.
- 대시보드 페이지는 같은 Next.js 앱 내의 커스텀 라우트. Payload와 별개가 아님.
- 비즈니스 로직은 Payload Hooks로 구현. DB 트리거가 아닌 애플리케이션 레벨.
- 대시보드 집계 쿼리는 Drizzle raw SQL 사용. Payload Collection API로 안 되는 복잡한 집계만.
- 한국어 UI. Admin Panel 라벨은 Payload i18n으로 한국어화.
- Deneb은 /api/phaeton/ 라우트를 호출. Payload REST API를 직접 호출하지 않음 (인증 분리).

---

## 8. 성공 기준

- [ ] 20+ 프로젝트의 진행률을 한 화면에서 확인 가능
- [ ] 마일스톤 지연 시 즉시 시각적 알림 (빨간색 표시 + 일수)
- [ ] 인허가 만료 90일 전 경고
- [ ] 마일스톤별 파일 첨부 및 프로젝트 상세 조회 가능
- [ ] 기성금 수령 현황 관리
- [ ] Admin Panel에서 PM이 담당 프로젝트 데이터를 직접 관리 가능
- [ ] 프로젝트별 예산·비용 관리 기능
- [ ] 계열사 업무 연동
- [ ] Deneb 텔레그램 봇에서 `/phaeton status SL-2025-003` 입력 시 현황 응답
- [ ] 기존 엑셀 데이터 100% 마이그레이션 완료
- [ ] 300명 동시 접속 시 응답 시간 2초 이내
