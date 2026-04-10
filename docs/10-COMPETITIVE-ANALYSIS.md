# 10. 경쟁 분석 — 노코드 업무앱 플랫폼

> Phaeton v2의 최소 구현 목표 수립을 위한 경쟁 제품 조사.
> 1차 벤치마크: **다우오피스 Works** (한국 시장 검증 제품)
> 보조 벤치마크: Airtable, NocoDB, Google AppSheet, Monday.com, ClickUp

---

## 1. 다우오피스 Works — 1차 벤치마크

### 1.1 제품 개요

한국 다우기술이 개발한 **노코드 업무앱 플랫폼**. 다우오피스 그룹웨어의 핵심 모듈.
특허 기술(제10-1723973호, "가변형 입력 폼 기반 앱 생성 솔루션") 기반.

- **실적**: 35,000개 앱 제작, 누적 데이터 865만 건, 700+ 무료 템플릿
- **고객**: Nature Republic, 현대중공업, 삼천리자전거, LS오토모티브, 삼성서울병원
- **사례**: 역전에프앤씨 — 1,000개 가맹점 관리, 반복 업무 70% 감소
- **가격**: 4,000~5,000원/인/월, 5인 이하 무료

### 1.2 앱 구조 (5대 관리 메뉴)

| 메뉴 | 설명 |
|------|------|
| **기본 정보** | 앱 이름, 운영자, 설명, 아이콘 |
| **입력 화면** | 드래그 앤 드롭 폼 빌더 |
| **목록 화면** | 차트 + 데이터 목록 구성 |
| **프로세스** | 상태 정의 및 흐름 설정 |
| **접근 제어** | 부서/사용자 단위 공유 설정 |

### 1.3 필드 타입 (컴포넌트)

#### 데이터 컴포넌트
| 컴포넌트 | 설명 |
|---------|------|
| 텍스트 | 한 줄 텍스트 |
| 멀티 텍스트 | 여러 줄 텍스트 |
| 숫자 | 숫자/비율(프로그레스바)/등급(별점) 3가지 유형 선택 |
| 드롭 박스 | 단일 선택 드롭다운 |
| 체크박스 | 다중 선택 |
| 단일 선택 | 라디오 버튼 |
| 리스트박스 | 리스트 선택 |
| 날짜 | 날짜 입력 |
| 시간 | 시간 입력 |
| 날짜와 시간 | 날짜+시간 복합 |
| 파일첨부 | 파일 업로드 (드래그 또는 파일선택) |
| 사용자 선택 | 조직도에서 사용자 선택 |
| 부서 선택 | 조직도에서 부서 선택 |
| 테이블 영역 | 반복 입력 가능한 인라인 테이블 |

#### 디자인 컴포넌트
| 컴포넌트 | 설명 |
|---------|------|
| 등록자/등록일 | 자동 표시 (시스템) |
| 변경자/변경일 | 자동 표시 (시스템) |
| 라벨/라인/공백/다단 | 폼 레이아웃 요소 |

#### 고급 컴포넌트
| 컴포넌트 | 설명 |
|---------|------|
| 자동 계산 | 숫자 컴포넌트 간 합계/평균 등 |
| 앱간 데이터 연동 | 마스터 앱 데이터 참조 (Lookup) |

#### 컴포넌트 속성
- 이름, 이름숨기기, 설명, 툴팁 표현, 필수 입력, 기본값, 최소/최대 입력 수, 단위 표현

### 1.4 뷰 타입

| 뷰 | 설명 |
|----|------|
| **리스트 뷰** | 그리드 형태. 열 순서 변경, 열 고정, 합계/평균, 더블클릭 인라인 편집. 상단 차트 영역 + 하단 데이터 목록 |
| **간트 뷰** | 좌측 리스트(제목/시작/종료/담당자/진행률) + 우측 타임라인 바. 드래그로 일정 변경. 그룹 관리 |
| **캘린더 뷰** | 일간/주간/월간 전환. 단일날짜 또는 기간 설정. 색상별 항목 구분 |
| **리포트** | 차트/카드/데이터/텍스트/사진 5가지 구성요소. PDF 내보내기, 메일 공유 |

> **참고**: 칸반 뷰 없음 — 한국 기업 사용자는 칸반에 익숙하지 않아 수요가 낮음. Phaeton에서도 후순위(P3)로 분류

### 1.5 프로세스 (상태 머신)

- **상태 정의**: START → 대기 → 진행 → 완료/반려 (커스텀 추가 가능)
- **비주얼 다이어그램**: 상태 노드 간 화살표로 흐름 정의, 상태변경 버튼명 설정
- **상태 변경 권한**: 운영자/등록자/요청자/처리 담당자 중 선택
- **상태 변경 알림**: 대상별 알림 발송
- **상태별 색상**: 리스트뷰/간트뷰에서 배지 색상으로 표시
- **ON/OFF 토글**: "이 앱에서는 상태를 사용하지 않겠습니다"

### 1.6 접근 제어

#### 데이터 권한
| 항목 | 설정 대상 |
|------|----------|
| 등록 권한 | 공유자 전체 / 운영자 |
| 수정 권한 | 공유자 전체 / 등록자 / 운영자 / 요청자 / 처리 담당자 |
| 삭제 권한 | 공유자 전체 / 등록자 / 운영자 / 요청자 / 처리 담당자 |
| 수정 알림 | 등록자 / 운영자 / 요청자 / 처리 담당자 |

#### 행 단위 조회 권한
- 필터 조건 기반 (예: "요청자 = 현재 사용자", "상태 = 대기")
- AND/OR 조합, 필터별 적용 대상(사용자) 지정

#### 멀티폼
- 메인폼(1개) + 하위폼(최대 20개)
- 하위폼별 접근 권한: 공개/비공개, 사용자/부서/직위/직급 단위

### 1.7 차트

- 차트 타입: 세로 막대형 / 가로 막대형 / 꺾은선형 / 원형 + 기본형/누적형
- 설정: 차트 이름, 그룹별 통계 항목, 집계 방식(개수/합계/평균), 테마(4종), 콤보 차트
- 앱 홈 화면 상단에 표시

### 1.8 데이터 관리

| 기능 | 설명 |
|------|------|
| 단건 등록 | 입력 폼 |
| 일괄 등록 | CSV/Excel 대량 등록 |
| 인라인 수정 | 리스트뷰 더블클릭 |
| 데이터 복사 | 기존 데이터 복제 |
| 목록 다운로드 | Excel/CSV 내보내기 |
| 변경 이력 | 모든 등록/수정 자동 기록 |
| 활동 기록 | 리치 텍스트 댓글 + 파일 첨부 |
| 앱 간 연계 | 마스터 앱 참조 자동 입력 |
| 인쇄 | 상세 화면 인쇄 |

### 1.9 UI/UX 패턴

#### Works 홈
- 검색 바 (앱 명 검색, 상세 검색)
- 탭: Works 홈 / 즐겨찾는 앱 / 운영중인 앱
- 앱 카드 그리드 (아이콘 + 앱 이름)
- 좌측 사이드바: 만들기 버튼, 나의 폴더

#### 앱 실행 홈 (데이터 목록)
- **좌측 사이드바**: 등록 버튼, 뷰 목록, 리포트, 기본 필터, 개인 필터
- **메인 상단**: 차트 영역 (막대/원형)
- **메인 하단**: 데이터 목록 테이블 (상태 배지, 등록일, 각 필드)
- **액션 버튼**: 등록 / 삭제 / 일괄 등록 / 목록 다운로드

#### 데이터 상세 화면
- 상단: 상태변경 버튼 (동적), 수정/삭제/복사/인쇄
- 본문: 입력 폼과 동일 구조 (2컬럼 레이아웃)
- 하단: 변경이력 + 활동기록 (댓글)

#### 앱 빌더
- 좌측: 컴포넌트 목록 (드래그 앤 드롭)
- 중앙: 폼 미리보기
- 좌측 하단: 선택 컴포넌트 속성 패널

### 1.10 평가

**강점**:
- 프로세스(상태 머신)가 한국 기업 "품의/결재/처리" 문화에 최적화
- 행 단위 필터 기반 권한이 실용적
- 35,000개 앱으로 한국 시장 요구사항 검증

**약점**:
- 칸반 뷰 없음
- Formula/Rollup/Lookup 등 계산형 필드 빈약 ("자동 계산"과 "앱간 연동"이 전부)
- 자동화가 상태 변경 알림 수준에 그침 (트리거→조건→액션 빌더 없음)
- UI가 전통적 그룹웨어 스타일 (2컬럼 폼, 페이지네이션)
  - 단, 이는 한국 기업 사용자의 보수성을 반영한 의도된 설계로 판단

---

## 2. 보조 벤치마크 — 글로벌 플랫폼 비교

### 2.1 필드 타입 비교 (전체 플랫폼)

| 필드 카테고리 | 다우 Works | Airtable | NocoDB | AppSheet | Monday | ClickUp |
|-------------|-----------|----------|--------|----------|--------|---------|
| **텍스트** | 텍스트, 멀티텍스트 | SingleLine, LongText, RichText | SingleLine, LongText | Text, LongText, Name | Text, LongText | ShortText, LongText |
| **숫자** | 숫자 (숫자/비율/등급) | Number, Currency, Percent, Rating, Duration | Number, Currency, Percent, Rating, Duration, Decimal | Number, Decimal, Price, Percent, Progress | Numbers, Rating | Number, Currency, EmojiRating |
| **날짜/시간** | 날짜, 시간, 날짜+시간 | Date, DateTime, CreatedTime, LastModifiedTime | Date, DateTime, Time, Year, CreatedTime, LastModifiedTime | Date, DateTime, Time, Duration | Date, Timeline, Hour, Week | Date |
| **선택** | 드롭박스, 체크박스, 단일선택, 리스트박스 | SingleSelect, MultiSelect, Checkbox | SingleSelect, MultiSelect, Checkbox | Enum, EnumList, Yes/No | Status, Dropdown, Checkbox | Dropdown, Labels, Checkbox |
| **파일** | 파일첨부 | Attachment | Attachment | Image, File, Video, Audio, Drawing, Signature | File | Files |
| **사용자** | 사용자선택, 부서선택 | Collaborator(단일/다중), CreatedBy, LastModifiedBy | CreatedBy, LastModifiedBy | (Ref to Users table) | People, CreationLog, LastUpdated | Users |
| **관계형** | 앱간 데이터 연동 | LinkedRecord, Lookup, Rollup, Count | Links, Lookup, Rollup | Ref, List | ConnectBoards, Mirror | Tasks(Relationship) |
| **계산** | 자동 계산 | Formula | Formula | Virtual Column (200+ 함수) | Formula | Formula |
| **특수** | 테이블 영역 | Barcode, Button, AI Text, AutoNumber | Barcode, QrCode, JSON, Button, AutoNumber, Geometry | Address, LatLong, Color, ChangeCounter | TimeTracking, AutoNumber, Vote, Progress, Button, Tags, Dependencies | AutoProgress, ManualProgress, Voting, Location |
| **연락처** | — | Email, URL, Phone | Email, URL, Phone | Email, Phone, URL | Email, Phone, Link, Location | Email, Phone, URL |
| **총 개수** | ~16종 | ~35종 | ~25종 | ~30종 | ~36종 | ~20종 |

### 2.2 뷰 타입 비교

| 뷰 | 다우 Works | Airtable | NocoDB | AppSheet | Monday | ClickUp |
|----|-----------|----------|--------|----------|--------|---------|
| **그리드/테이블** | O (리스트뷰) | O (Grid) | O (Grid) | O (Table) | O (Table) | O (Table) |
| **칸반** | **X** | O | O | — | O | O (Board) |
| **캘린더** | O | O | O | O | O | O |
| **간트** | O | O (유료) | — | — | O | O |
| **타임라인** | — | O (유료) | — | — | O | O |
| **갤러리** | — | O | O | O (Gallery) | O | — |
| **폼** | (빌더 통합) | O (유료) | O | O | O (WorkForms) | O |
| **차트** | O (목록 상단) | — (Extension) | — | O | O | — (Dashboard) |
| **지도** | — | — (Extension) | — | O | O | — |
| **대시보드** | O (리포트) | O (Interface) | — | O | O (50+ 위젯) | O (50+ 위젯) |
| **리포트** | O | — | — | — | — | — |
| **Deck/카드** | — | O (List) | — | O (Deck) | — | O (List) |
| **워크로드** | — | — | — | — | O | O |
| **마인드맵** | — | — | — | — | — | O |
| **화이트보드** | — | — | — | — | — | O |

### 2.3 자동화 비교

| 항목 | 다우 Works | Airtable | NocoDB | AppSheet | Monday | ClickUp |
|------|-----------|----------|--------|----------|--------|---------|
| **트리거 방식** | 상태 변경 알림만 | 레코드 생성/수정/뷰 진입/폼 제출/버튼/Webhook/스케줄 | Webhook + 레코드 CRUD + 스케줄 | 데이터 변경/스케줄/폼 제출 | 상태변경/날짜/생성/주기 | 상태/필드변경/생성/날짜/스케줄 |
| **액션** | 알림 발송 | 레코드 CRUD/이메일/Slack/스크립트/AI 생성/Webhook | 이메일/Webhook/Slack/Discord/Teams | 이메일/SMS/알림/Webhook/PDF생성/레코드CRUD/Apps Script | 컬럼 업데이트/이동/복제/삭제/알림/이메일/외부서비스 | 상태/담당자/우선순위 변경/이동/복제/삭제/댓글/이메일/태그 |
| **조건 분기** | X | O (if/else) | O (조건 필터) | O (Branch) | O (조건부) | O (조건부) |
| **외부 연동** | API 제공 (엔터프라이즈) | 200+ (Gmail, Slack, Jira, Salesforce 등) | Webhook 기반 | Google Workspace + Twilio 등 | 200+ 통합 | HubSpot, GitHub, Slack 등 |

### 2.4 권한 비교

| 항목 | 다우 Works | Airtable | NocoDB | AppSheet | Monday | ClickUp |
|------|-----------|----------|--------|----------|--------|---------|
| **역할 체계** | 운영자/등록자/요청자/처리담당자 | Owner/Creator/Editor/Commenter/ReadOnly | Owner/Creator/Editor/Commenter/Viewer | 커스텀 역할 (USERROLE) | Admin/Member/Viewer/Guest + 커스텀 | Owner/Admin/Member/Guest + 커스텀 |
| **앱/Base 단위** | O | O | O | O | O (Board) | O (Space/List) |
| **행 단위 (RLS)** | O (필터 기반) | 제한적 (Interface로 우회) | 뷰 필터로 우회 | O (Security Filter) | 제한적 (Enterprise) | X |
| **필드 단위** | O (멀티폼) | O (필드 잠금) | 뷰별 숨기기 | O (SHOW_IF, EDITABLE_IF) | O (Enterprise) | X |
| **멀티폼** | O (최대 20개) | X | X | X | X | X |

### 2.5 데이터 관리 비교

| 기능 | 다우 Works | Airtable | NocoDB | AppSheet | Monday | ClickUp |
|------|-----------|----------|--------|----------|--------|---------|
| **인라인 편집** | O (더블클릭) | O (셀 클릭) | O (셀 클릭) | O (Quick Edit) | O (셀 클릭) | O |
| **일괄 등록** | O (CSV/Excel) | O (CSV, 25K행) | O (CSV/Excel) | O (CSV) | O (Excel) | O |
| **내보내기** | O (Excel/CSV) | O (CSV) | O (CSV/Excel) | O (CSV) | O (Excel) | O |
| **변경 이력** | O (자동) | O (2주~3년) | O (감사 로그) | O | O | O (Activity) |
| **댓글/활동** | O (리치텍스트+파일) | O (@멘션) | O | — | O (Update) | O (Comment) |
| **API** | O (엔터프라이즈) | O (REST+Webhook) | O (REST+Meta) | O (REST) | O (GraphQL) | O (REST) |

---

## 3. Phaeton v2 구현 로드맵 제안

### 3.1 설계 철학: "쉬운데 튼튼한"

> **비IT 고령 사용자도 학습이 쉽고, 고급 설정으로 가면 기능이 강력한 UX.**
> 프론트는 다우오피스처럼 쉽게, 백엔드는 PostgreSQL 풀파워.

#### 핵심 원칙: Progressive Disclosure

기능 자체는 경쟁사 이상이되, **보이는 복잡도**를 계층별로 분리한다.

| 계층 | 대상 | 경험 |
|------|------|------|
| **1단계 — 즉시 사용** | 비IT 사용자, 첫 접속 | 앱 이름 입력 → 필드 몇 개 추가 → 바로 데이터 입력 가능. 뷰/권한/프로세스 = 합리적 기본값 자동 적용 |
| **2단계 — 커스터마이즈** | 업무 담당자 | 필터 저장, 뷰 추가, 필드 속성 세부 설정, 차트 추가 |
| **3단계 — 고급 설정** | 앱 운영자/관리자 | 상태 머신, 조건부 권한(RLS), 자동화, Formula/Lookup/Rollup |

> **핵심 제약**: 고급 기능의 난이도 기준은 "IT 지식"이 아니라 "Phaeton 숙련도"다.
> Phaeton을 충분히 써본 사람이라면, IT 배경 없이도 고급 설정을 자연스럽게 다룰 수 있어야 한다.
> 즉 고급 기능은 **외부 지식(코딩, DB, API)**을 요구하지 않고,
> 1~2단계에서 이미 익힌 Phaeton의 조작 패턴(드래그, 선택, 토글)만으로 설정 가능해야 한다.
> 계층 간 **조작 문법은 하나**, **노출 범위만 다르다.**

#### 용어 전략: DB 사고 → 양식 사고

한국 비IT 사용자에게 "테이블", "필드", "레코드"는 낯선 용어.
NocoDB/Airtable이 한국에서 안 먹히는 이유 중 하나.

| 경쟁사 (DB 사고) | Phaeton (양식 사고) | 이유 |
|----------------|-------------------|------|
| "테이블을 만드세요" | "어떤 업무를 관리하시겠어요?" | 목적부터 시작 |
| "필드 타입을 선택하세요" | "어떤 항목을 입력받으시겠어요?" | 입력 관점 |
| "레코드를 추가하세요" | "데이터를 등록하세요" | 한국 그룹웨어 용어 |
| 빈 그리드 → 시작 | 템플릿 선택 or 자연어 설명 → 자동 구성 | 빈 화면 공포 제거 |
| 필드 35종 나열 | 자주 쓰는 5종만 보이고 나머지는 "더보기" | 선택 마비 방지 |

#### 기본 화면 원칙

- **빈 상태(empty state) 없애기**: 첫 접속 시 템플릿 갤러리 또는 가이드 위저드
- **용어 통일**: 앱/항목/데이터/등록/목록 — 한국 그룹웨어 관행 따름
- **액션 최소화**: 첫 앱 완성까지 클릭 5회 이내
- **되돌리기 안전망**: 실수해도 복구 가능하다는 확신 → 탐색 용기 부여

#### 백엔드 우위 — "쉬운데 한계가 없다"

프론트가 쉬운 건 다우오피스도 하지만, 데이터가 커지면 무너지는 게 대부분의 노코드 플랫폼.
Phaeton은 PostgreSQL 네이티브 아키텍처로 이 한계를 구조적으로 돌파한다.

| 항목 | Phaeton | 경쟁사 한계 |
|------|---------|-----------|
| 데이터 규모 | PostgreSQL — 수천만 행도 인덱스만 잡으면 OK | Airtable 50K행, AppSheet 5K행 권장 |
| 동적 DDL | 진짜 ALTER TABLE — 트랜잭션 원자성 보장 | JSON blob 또는 EAV 패턴 |
| 쿼리 성능 | pgx v5 네이티브, ORM 오버헤드 없음 | NocoDB: ORM 레이어, AppSheet: Sheets API |
| 보안 | `pgx.Identifier` 이스케이프 + PostgreSQL RLS | 앱 레벨 필터링 (코드 버그 = 데이터 유출) |
| 배포 | Go 싱글 바이너리, DGX Spark 단독 구동 | SaaS 종속 또는 Docker 필수 |

### 3.2 현재 구현 상태 (2026-04-10 업데이트)

#### 백엔드 — 거의 완성

**필드 타입 (19종, schema/models.go)**:
| 필드 | PG 타입 | 상태 |
|------|---------|------|
| text | TEXT | 완료 |
| textarea | TEXT | 완료 |
| number | NUMERIC | 완료 (display: currency/percent/rating/progress) |
| integer | INTEGER | 완료 |
| boolean | BOOLEAN | 완료 |
| date | DATE | 완료 |
| datetime | TIMESTAMPTZ | 완료 |
| time | TIME | 완료 |
| select | VARCHAR(255) | 완료 (choices 검증) |
| multiselect | TEXT[] | 완료 (choices 검증) |
| relation | UUID | 완료 (1:1, 1:N, M:N + FK + junction) |
| user | UUID | 완료 (auth.users FK) |
| file | UUID | 완료 (업로드 엔드포인트) |
| json | JSONB | 완료 |
| autonumber | SERIAL 계열 | 완료 |
| label/line/spacer | — (레이아웃) | 완료 (IsLayout() 구분) |

**스키마 엔진 (migration/engine.go)**:
| 기능 | 상태 |
|------|------|
| CREATE TABLE (동적 DDL) | 완료 — 트랜잭션 원자성 |
| ALTER TABLE ADD/DROP COLUMN | 완료 — 안전도 분류 (Safe/Cautious/Dangerous) |
| ALTER COLUMN TYPE (타입 변환) | 완료 — 호환성 검사 + 미리보기 |
| FK 생성 / Junction 테이블 | 완료 |
| 마이그레이션 이력 + 롤백 | 완료 |
| 변경 미리보기 (Preview) | 완료 — 영향 행 수, 비호환 샘플, DDL 표시 |

**데이터 엔진 (handler/dynamic.go)**:
| 기능 | 상태 |
|------|------|
| CRUD (단건) | 완료 |
| 페이지네이션 | 완료 (기본 20, 최대 100) |
| 필터링 | 완료 (eq/neq/gt/gte/lt/lte/like/in/is_null) |
| 텍스트 검색 | 완료 (ILIKE, ?q= 파라미터, text/textarea 전 필드) |
| 정렬 (다중 필드) | 완료 (관계 필드 dot notation 포함) |
| 관계 확장 (expand) | 완료 (배치 쿼리, N+1 방지) |
| 일괄 등록 (BulkCreate) | 완료 (최대 1000건, 트랜잭션) |
| 일괄 삭제 (BulkDelete) | 완료 (소프트 삭제) |
| 집계 (Aggregate) | 완료 (count/sum/avg/min/max + 다중 GROUP BY + 날짜 구간) |
| CSV 내보내기 | 완료 (필터/정렬 적용, UTF-8 BOM) |
| CSV 가져오기 | 완료 (헤더 매핑, 타입 변환, 최대 1000행) |
| 소프트 삭제 | 완료 (deleted_at) |

**인증/권한**:
| 기능 | 상태 |
|------|------|
| JWT 인증 (HS256, 7일 만료) | 완료 |
| SAML 2.0 SP | 완료 (crewjam/saml, IdP 메타데이터 연결 대기) |
| 역할 체계 (director/pm/engineer/viewer) | 완료 |
| 컬렉션 멤버 (owner/editor/viewer) | 완료 (collection_members 테이블 + CRUD + 미들웨어) |
| 컬렉션 접근 제어 (AccessConfig) | 완료 (view/create/edit/delete 역할별 분리) |
| 로그인 레이트 리미팅 | 완료 (5회/15분 → 30분 잠금) |
| CORS / httpOnly 쿠키 | 완료 |

**조직/인사**:
| 기능 | 상태 |
|------|------|
| auth.departments 테이블 | 완료 (external_code, parent_id 트리) |
| auth.users 확장 | 완료 (external_id, department_id, position, title, phone, avatar, joined_at) |
| 부서 CRUD API | 완료 (트리 조회 포함, director 전용) |
| 사용자 관리 API | 완료 |

**협업**:
| 기능 | 상태 |
|------|------|
| 댓글 (comments) | 완료 (CRUD + 이벤트 버스 발행) |
| 변경 이력 (record_changes) | 완료 (operation + diff JSON, 레코드별 조회) |
| 알림 (notifications) | 완료 (DB + API + Dispatcher + 이벤트 구독) |
| Notifier 인터페이스 | 완료 (어댑터 구현 대기 — 메신저 연동 시 끼워넣기) |

**연동 인프라**:
| 기능 | 상태 |
|------|------|
| Webhook 수신 | 완료 (HMAC-SHA256 검증, 토픽 라우팅) |
| 동기화 Runner | 완료 (주기적 실행 프레임워크, Source 인터페이스) |
| SAML SP | 완료 (IdP 메타데이터 수령 후 연결만 하면 됨) |

**프로세스 (워크플로우)**:
| 기능 | 상태 |
|------|------|
| 상태 정의/전이/색상 | 완료 |
| 초기 상태 자동 주입 | 완료 (BulkCreate 포함) |
| 상태 변경 이벤트 발행 | 완료 (EventStateChange → 알림 구독) |

**뷰 관리**:
| 기능 | 상태 |
|------|------|
| _meta.views CRUD API | 완료 (list/kanban/calendar/gallery 타입) |
| _meta.saved_views 테이블 | 생성됨 (핸들러 미구현 — 필터 저장 API 없음) |

#### 프론트엔드 — 거의 완성

**페이지 (11개)**:
| 페이지 | 파일 | 상태 |
|--------|------|------|
| 로그인 | LoginPage.tsx | 완료 |
| 앱 목록 | AppListPage.tsx | 완료 (온보딩 가이드 + 빈 상태 위저드) |
| 앱 빌더 | AppBuilderPage.tsx | 스텁 (최소 구현) |
| 앱 뷰 | AppViewPage.tsx | 완료 (756줄, 필터/검색/정렬/인라인편집/CSV/뷰전환) |
| 앱 설정 | AppSettingsPage.tsx | 완료 (필드 관리 + 멤버 접근 제어) |
| 프로세스 | ProcessPage.tsx | 완료 (상태 머신 UI + 전이 설정) |
| 프로필 | ProfilePage.tsx | 완료 (프로필 편집 + 비밀번호 변경) |
| 조직도 | OrgChartPage.tsx | 완료 (트리 뷰 + 사용자 패널) |
| 사용자 관리 | UsersPage.tsx | 완료 (목록 + 부서 배정 + 추가/편집) |
| 마이그레이션 이력 | MigrationHistoryPage.tsx | 완료 |
| 404 | NotFoundPage.tsx | 완료 |

**뷰 (views/)**:
| 뷰 | 상태 | 비고 |
|----|------|------|
| 리스트 뷰 | 완료 | 인라인 편집 (더블클릭), 정렬, 필터 |
| 칸반 뷰 | 완료 | @dnd-kit 드래그 앤 드롭 |
| 캘린더 뷰 | 완료 | 월 그리드, 날짜별 그룹핑, 오늘 하이라이트 |
| 뷰 탭 | 완료 | 리스트/칸반/캘린더 동적 전환 |
| 갤러리 뷰 | 타입만 정의 | 컴포넌트 미구현 |

**핵심 UI 기능**:
| 기능 | 상태 |
|------|------|
| 필터 빌더 (FilterBuilder) | 완료 (필드별 연산자, AND 조건, 동적 입력) |
| 검색 바 | 완료 (300ms 디바운스, ?q= 파라미터) |
| CSV 내보내기 | 완료 (필터/정렬 반영) |
| CSV 가져오기 | 완료 (파일 업로드 UI) |
| 인라인 편집 | 완료 (InlineEditCell, 더블클릭 → Enter/blur 저장) |
| 댓글 탭 | 완료 (EntrySheet 내 탭, 추가/삭제) |
| 변경이력 탭 | 완료 (EntrySheet 내 탭, diff 표시) |
| 온보딩 가이드 | 완료 (3단계 위저드, EmptyState 컴포넌트) |
| 조직도 트리 | 완료 (OrgTree + DepartmentPanel) |

**React Query 훅 (12개)**:
useCollections, useEntries, useProcess, useAuth, useMigrations, useUsers, useComments, useDepartments, useMembers, useViews, useHistory, useNotifications

---

### 3.3 우선순위별 미구현 기능 매핑

#### P-1 — 기반 (아마란스10 연동 + 조직 인프라)

> **모든 기능의 전제조건.** 사용자/부서/인증이 없으면 앱을 만들어도 "누가 쓰는지" 모른다.
> 현재 회사 그룹웨어 **더존 아마란스10**과 연동하여 조직 인프라를 확보한다.

**SSO 인증 연동 (필수)** — SAML SP 구현 완료, IdP 연결 대기:
| 항목 | 상태 |
|------|------|
| SAML 2.0 SP 미들웨어 | ✅ 완료 (`crewjam/saml`, samlsp/samlsp.go) |
| 환경변수 설정 | ✅ 완료 (SAML_ENTITY_ID, SAML_ROOT_URL, SAML_IDP_METADATA_URL 등) |
| 라우트 등록 | ✅ 완료 (`/saml/*` 핸들러) |
| **남은 작업** | 더존에서 IdP 메타데이터 URL 수령 → 환경변수 설정 → 연결 |

**조직/인사 동기화 (필수)** — DB/API 구현 완료, 동기화 소스 대기:
| 항목 | 상태 |
|------|------|
| auth.departments 테이블 | ✅ 완료 (external_code, parent_id 트리) |
| auth.users 확장 컬럼 | ✅ 완료 (external_id, department_id, position, title, phone, avatar, joined_at) |
| 부서 CRUD API | ✅ 완료 (트리 조회 포함) |
| 사용자 관리 API | ✅ 완료 |
| 동기화 Runner 프레임워크 | ✅ 완료 (sync/sync.go — Source 인터페이스, 주기적 실행) |
| **남은 작업** | 더존 API 스펙 수령 → 아마란스 Source 어댑터 구현 → Runner에 등록 |

**아마란스 메뉴 등록 (권장)**:
| 항목 | 설명 |
|------|------|
| 방식 | 아마란스 관리자 화면에서 외부 URL 메뉴 등록 (iframe 또는 새 탭) |
| 효과 | 사용자가 아마란스 사이드 메뉴에서 바로 Phaeton 접근 |
| SSO 연계 | 메뉴 클릭 시 SSO 토큰 파라미터로 자동 로그인 |

**더존에 요청할 것**:
1. 아마란스10 외부 시스템 SSO 연동 가이드 (SAML 2.0 / OAuth 2.0)
2. 인사/조직 동기화 API 스펙 (사원, 부서, 직위 조회)
3. 메신저 알림 외부 연동 API (P1에서 활용)
4. 전자결재 외부 기안 API (P2에서 활용)

> **참고**: 더존은 공개 API 문서가 없으며, 파트너 계약/고객사 요청으로 별도 제공.
> 전자결재 연동, SSO, 인사/조직 동기화는 더존이 일반적으로 고객사에 제공하는 표준 연동 항목.

**더존에서 받아야 하는 것**:
| 항목 | 요청 내용 | 용도 |
|------|----------|------|
| SSO 스펙 | SAML 2.0 IdP 메타데이터 (Entity ID, 인증서, 엔드포인트 URL) 또는 OAuth 2.0 client_id/secret + authorize/token URL | Phaeton SP 구현 |
| 조직/인사 API | 사원 조회 (사번/이름/이메일/부서코드/직위/직책/재직상태), 부서 조회 (코드/이름/상위부서) — 엔드포인트 + 인증 + 응답 포맷 | 사용자/부서 동기화 |
| 메신저 API | 외부 → 특정 사용자/그룹 메시지 발송 (URL + 인증 + 페이로드) | P1 알림 발송 |
| 전자결재 API | 외부 기안 (양식 ID, 결재선, 본문 매핑) + 결재 완료 콜백(webhook) 스펙 | P1 결재 연동 |
| 연동 환경 | 테스트/스테이징 서버 접근 권한, API 키 또는 서비스 계정 | 개발/테스트 |

**Phaeton 쪽 사전 준비** — 모두 완료:
| 작업 | 상태 |
|------|------|
| `auth.departments` 테이블 + CRUD API | ✅ 완료 |
| `auth.users` 확장 (external_id, department_id 등) | ✅ 완료 |
| SAML 2.0 SP 미들웨어 | ✅ 완료 (crewjam/saml) |
| 동기화 Runner + Source 인터페이스 | ✅ 완료 (sync/sync.go) |
| Notifier + Dispatcher 인터페이스 | ✅ 완료 (notify/notify.go) |
| Webhook 수신 (HMAC-SHA256) | ✅ 완료 (handler/webhook.go) |
| 알림 DB + API + 이벤트 구독 | ✅ 완료 (notifications.go) |

> **현재 상태**: 모든 인터페이스/프레임워크가 준비 완료.
> 더존 API 문서 수령 즉시 **어댑터만 끼워넣으면** 연동 가능.

#### P0 — 핵심 (다우오피스 Works 기본 기능 달성) — ✅ 거의 완료

> 필드 19종, 뷰 3종(리스트+칸반+캘린더), 인라인 편집, 필터 빌더, 검색,
> CSV 임포트/내보내기, 프로세스, 댓글, 변경이력 — 대부분 구현 완료.

**남은 P0 작업**:
| 항목 | 현재 | 목표 |
|------|------|------|
| AppBuilderPage | 스텁 (최소 구현) | 3패널 빌더 완성 (FieldPalette+Preview+Properties는 있음) |
| 필터 저장 API | DB 테이블만 있음 (saved_views) | 핸들러 구현 → 필터 저장/불러오기/공유 |
| 리스트뷰 열 고정/리사이즈 | 미구현 | 고정 열 + 드래그 리사이즈 |
| 리스트뷰 합계/평균 행 | 미구현 | 숫자 필드 하단 집계 행 (Aggregate API 있음) |

#### P1 — 경쟁력 (다우오피스 수준 + 모던 UX) — 부분 완료

**프로세스 강화** (기본 완료, 고급 기능 추가):
| 기능 | 현재 | 목표 |
|------|------|------|
| 상태 정의/전이/색상 | ✅ 완료 | — |
| 초기 상태 자동 주입 | ✅ 완료 | — |
| 상태 변경 이벤트 → 알림 | ✅ 완료 | — |
| 전이별 권한 | 미구현 | 운영자/등록자/담당자별 전이 허용 |

**접근 제어** (컬렉션 레벨 완료, 행 레벨 미구현):
| 기능 | 현재 | 목표 |
|------|------|------|
| 컬렉션 멤버 (owner/editor/viewer) | ✅ 완료 | — |
| AccessConfig (view/create/edit/delete) | ✅ 완료 | — |
| 컬렉션 접근 미들웨어 | ✅ 완료 | — |
| 행 단위 조회 (RLS) | 미구현 | 필터 조건 기반 (내 데이터만 / 내 부서만) |

**아마란스10 연동 확장**:
| 기능 | 현재 | 목표 |
|------|------|------|
| 메신저 알림 | Notifier 인터페이스 ✅ | 아마란스 메신저 어댑터 구현 (API 스펙 대기) |
| 전자결재 | Webhook 수신 ✅ | 기안 어댑터 + 결재 콜백 처리 (API 스펙 대기) |

#### P2 — 차별화 (Airtable/Monday.com급 고급 기능)

**고급 필드 타입** (rating/progress/currency는 number display로 이미 구현):
| 필드 | 설명 | 참고 플랫폼 |
|------|------|-----------|
| formula | 같은 테이블 필드 기반 계산식 | Airtable, NocoDB |
| lookup | 연결 레코드의 특정 필드 참조 | Airtable, NocoDB |
| rollup | 연결 레코드 집계 (SUM/AVG/COUNT) | Airtable, NocoDB |

**고급 뷰**:
| 뷰 | 설명 |
|----|------|
| 간트 뷰 | 좌측 리스트 + 우측 타임라인 바, 의존성 표시 |
| 갤러리 뷰 | 이미지/카드 기반 레코드 표시 |
| 대시보드 | 차트 위젯 조합 (막대/원형/꺾은선), 숫자 요약 |

**차트 시스템**:
| 기능 | 설명 |
|------|------|
| 차트 타입 | 세로 막대 / 가로 막대 / 꺾은선 / 원형 / 도넛 |
| 집계 | 개수 / 합계 / 평균 |
| 그룹 | 선택형 필드 기준 그룹핑 |
| 배치 | 앱 홈 상단 또는 대시보드 |

**자동화 (기초)**:
| 기능 | 설명 |
|------|------|
| 트리거 | 레코드 생성/수정/삭제, 상태 변경, 스케줄 |
| 액션 | 알림 발송, 필드 값 업데이트, Webhook 호출 |
| 조건 | if/else 분기 |

**템플릿**:
| 기능 | 설명 |
|------|------|
| 샘플 앱 | 카테고리별 사전 구성 앱 (총무/인사/영업/재무 등) |
| 앱 내보내기/가져오기 | 앱 구조를 파일로 내보내기/가져오기 |

#### P3 — 장기 (엔터프라이즈)

| 기능 | 설명 | 참고 플랫폼 |
|------|------|-----------|
| 칸반 뷰 | 상태 기반 드래그 앤 드롭 보드 (한국 사용자 인지도 낮음, 후순위) | Airtable, Monday, ClickUp |
| 멀티폼 | 메인폼 + 하위폼(최대 20개), 폼별 접근 권한 | 다우 Works |
| 테이블 영역 | 폼 내 인라인 반복 입력 테이블 | 다우 Works |
| Interface Designer | 커스텀 대시보드/인터페이스 빌더 | Airtable |
| AI 필드 | AI 기반 텍스트 자동 생성 | Airtable |
| 고급 자동화 | 다단계 워크플로우, 외부 서비스 통합 | Airtable, Monday |
| 모바일 앱 | 네이티브 모바일 지원 | AppSheet |
| 오프라인 | 오프라인 데이터 캐시 + 동기화 | AppSheet |
| 감사 로그 | 전체 작업 감사 추적 | 전체 |

---

## 4. Phaeton 아키텍처 우위

| 항목 | Phaeton | 경쟁사 |
|------|---------|-------|
| **데이터 저장** | 앱 = 진짜 PostgreSQL 테이블 (동적 DDL) | Airtable: 내부 저장소, AppSheet: Google Sheets 위 레이어 |
| **SQL 활용** | JOIN, 인덱스, RLS 등 RDBMS 기능 직접 사용 가능 | 대부분 추상화 계층 위에서 동작 |
| **배포** | Go 싱글 바이너리 (embed.FS) — 설치/운영 단순 | NocoDB: Docker, Airtable/Monday: SaaS만 |
| **성능** | PostgreSQL 네이티브 쿼리 → 대용량 데이터 유리 | Airtable: 50K행 제한, AppSheet: 5K행 권장 |
| **확장성** | pgx v5 커넥션 풀 + 워커풀 | SaaS 플랜별 제한 |

---

## 5. 참고 자료

### 다우오피스 Works
- [공식 페이지](https://daouoffice.com/works.jsp)
- [Works 가이드 PART 1 PDF](https://daouoffice.com/cloud_guide/works/PART1_Works.pdf)
- [Works Advanced PDF](https://daouoffice.com/cloud_guide/works/Works_Advanced.pdf)
- [주요 기능 소개](https://manual.daouoffice.co.kr/hc/ko/articles/24396253862041)
- [Works 샘플앱 100종](https://blog.daouoffice.com/77)

### Airtable
- [Supported Field Types](https://support.airtable.com/docs/supported-field-types-in-airtable-overview)
- [Views](https://support.airtable.com/docs/getting-started-with-airtable-views)
- [Automations](https://support.airtable.com/docs/getting-started-with-airtable-automations)
- [Interface Designer](https://support.airtable.com/docs/getting-started-with-airtable-interface-designer)
- [Permissions](https://support.airtable.com/docs/airtable-permissions-overview)

### NocoDB
- [Field Types](https://docs.nocodb.com/fields/fields-overview)
- [Views](https://docs.nocodb.com/views/views-overview)
- [API](https://docs.nocodb.com/developer-resources/rest-APIs)

### Google AppSheet
- [Column Types](https://support.google.com/appsheet/answer/10107610)
- [Views](https://support.google.com/appsheet/answer/10105402)
- [Automation](https://support.google.com/appsheet/answer/10105411)

### Monday.com
- [Column Types](https://support.monday.com/hc/en-us/articles/115005310285)
- [Views](https://support.monday.com/hc/en-us/articles/360001267945)
- [Automations](https://support.monday.com/hc/en-us/articles/360001222900)

### ClickUp
- [Custom Fields](https://help.clickup.com/hc/en-us/articles/6303499162647)
- [Views](https://help.clickup.com/hc/en-us/articles/6329880717719)
- [Automations](https://help.clickup.com/hc/en-us/articles/6312102752791)
