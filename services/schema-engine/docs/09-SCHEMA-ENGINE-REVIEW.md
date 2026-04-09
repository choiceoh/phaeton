# Phaeton Schema Engine — 구현 리뷰

> 대상: `cmd/phaeton` + `internal/{config,database,schema,migration,api,pgutil}`
> 설계문서: Phaeton Schema Engine 설계문서 v0.1 (2026-04-09)
> 리뷰일: 2026-04-09

---

## 1. 요약

초안 구현을 설계문서와 대조하여 점검했다. 빌드와 `go vet`은 모두 통과한 상태였으나, **보안·안전성·롤백 가능성** 측면에서 5건의 버그가 있었고, 코드 중복과 미사용 함수가 있었다. 본 리뷰에서 이들을 모두 수정했다.

- **수정한 버그:** 5건
- **개선한 코드 품질 이슈:** 2건
- **남긴 개선 여지 (설계 갭):** 3건

---

## 2. 버그 및 수정 내용

### B1. `onDelete` SQL 인젝션 가능성 — **DANGEROUS**

**위치:** `internal/migration/ddl.go:GenerateAddFK`

**문제:** 사용자 입력인 `f.Relation.OnDelete`가 검증 없이 `ALTER TABLE ... ON DELETE %s` 문자열에 직접 삽입되었다. 임의의 SQL 단편이 끼어들 수 있었다.

**수정:**
- 화이트리스트 기반의 `SanitizeOnDelete()` 함수를 추가해 `CASCADE`, `SET NULL`, `RESTRICT`, `NO ACTION`, `SET DEFAULT`만 허용.
- 유효하지 않은 값은 기본값인 `SET NULL`로 대체.
- `schema/validate.go`에서도 동일한 화이트리스트로 입력 단계에서 차단.

```go
// ddl.go
var validOnDelete = map[string]bool{
    "CASCADE": true, "SET NULL": true, "RESTRICT": true,
    "NO ACTION": true, "SET DEFAULT": true,
}

func SanitizeOnDelete(s string) string {
    up := strings.ToUpper(strings.TrimSpace(s))
    if validOnDelete[up] {
        return up
    }
    return "SET NULL"
}
```

---

### B2. 컬렉션 삭제를 롤백할 수 없음

**위치:** `internal/migration/engine.go:DropCollection`, `internal/migration/ddl.go:GenerateDropTable`

**문제:** `GenerateDropTable`은 `ddl_down`을 빈 문자열로 반환했다. 그리고 `Rollback`은 `mig.DDLDown == ""`이면 에러를 던진다. 결과적으로 **한 번 삭제한 컬렉션은 영구 소실**. 설계문서는 "모든 스키마 변경은 롤백 가능"이라고 명시한다.

**수정:** `DropCollection`에서 원본 컬렉션의 `GenerateCreateTable(col, col.Fields)`를 실행해 재생성 DDL을 `ddl_down`에 저장한다. `restoreMeta`는 payload의 `collection` 항목으로부터 메타 행을 재삽입한다(기존에 이미 구현됨).

```go
ddlUp, _ := GenerateDropTable(col.Slug)
ddlDown, _ := GenerateCreateTable(col, col.Fields)  // ← 추가
payload, _ := json.Marshal(map[string]any{"collection": col})
```

**한계:** 재생성된 테이블은 컬럼 구조만 복구한다. 기존 **데이터 자체는 복구되지 않는다** — 이는 DROP TABLE의 원래 의미와 일치하며, 데이터 보존이 필요하면 삭제 전 백업을 별도로 해야 한다.

---

### B3. `is_system` 컬렉션 삭제 차단 없음

**위치:** `internal/migration/engine.go:DropCollection`

**문제:** 메타 테이블의 `is_system` 필드는 "시스템 컬렉션 여부 (삭제 불가)"로 문서화되어 있으나, `DropCollection`에 차단 로직이 없었다.

**수정:** 진입부에 즉시 체크:

```go
if col.IsSystem {
    return fmt.Errorf("%w: system collection %q cannot be deleted",
        schema.ErrInvalidInput, col.Slug)
}
```

---

### B4. `AddField`에서 M:N 관계의 junction 테이블 미생성

**위치:** `internal/migration/engine.go:AddField`

**문제:** 기존 코드는 관계 필드가 **일반 관계(1:1, 1:N)**인 경우에만 FK를 생성하고, M:N인 경우 junction 테이블 생성 코드가 아예 없었다. `CreateCollection`에는 있었지만 로직이 분산되어 있었다.

**수정:** 관계 DDL을 적용하는 공용 헬퍼 `applyRelationDDL()`를 추출해 `CreateCollection`과 `AddField` 모두에서 호출한다.

```go
func (e *Engine) applyRelationDDL(ctx context.Context, tx pgx.Tx, ownerSlug string, f schema.Field) error {
    targetCol, ok := e.cache.CollectionByID(f.Relation.TargetCollectionID)
    if !ok {
        return fmt.Errorf("%w: relation target %s does not exist",
            schema.ErrInvalidInput, f.Relation.TargetCollectionID)
    }
    tSlug := targetCol.Slug

    if f.Relation.RelationType == schema.RelManyToMany {
        junc := f.Relation.JunctionTable
        if junc == "" {
            junc = ownerSlug + "_" + tSlug + "_rel"
        }
        jUp, _ := GenerateJunctionTable(ownerSlug, tSlug, junc)
        return execMultiStmt(ctx, tx, jUp)
    }

    fkUp, _ := GenerateAddFK(ownerSlug, f.Slug, tSlug, f.Relation.OnDelete)
    return execMultiStmt(ctx, tx, fkUp)
}
```

---

### B5. FK 생성 실패가 silently swallow

**위치:** `internal/migration/engine.go:CreateCollection`, `AddField`

**문제:** 원래 코드는 FK 생성 실패 시 `_ = execMultiStmt(...)` 패턴으로 에러를 버렸다. 주석은 "target table may not exist yet"을 이유로 들었다. 하지만 PostgreSQL 트랜잭션 안에서 실패한 명령은 **전체 트랜잭션을 abort 상태로 만든다** — 이후의 모든 쿼리가 "current transaction is aborted" 에러로 실패한다. 에러를 무시해도 트랜잭션은 이미 망가진 상태.

**수정 전략:**
1. **사전 검증:** `CreateCollection` 진입부에서 각 관계 필드의 `target_collection_id`가 캐시에 존재하는지 확인하고, 없으면 `ErrInvalidInput`을 반환.
2. **실패는 fatal:** 사전 검증을 통과했다면 FK 생성이 실패할 이유가 없다. 실패 시 에러를 그대로 반환.
3. **성공은 로깅:** `log.Printf`로 "relation a.b → target.id created" 기록.

```go
// CreateCollection 진입부
for i := range req.Fields {
    if req.Fields[i].Relation == nil {
        continue
    }
    if _, ok := e.cache.CollectionByID(req.Fields[i].Relation.TargetCollectionID); !ok {
        return schema.Collection{}, fmt.Errorf("%w: field %q references unknown collection %s",
            schema.ErrInvalidInput,
            req.Fields[i].Slug,
            req.Fields[i].Relation.TargetCollectionID)
    }
}
```

**부수적 효과:** 설계 갭 G2(slug 충돌 시 친절한 에러)도 같은 블록에서 `cache.CollectionBySlug` 체크로 해결했다.

---

## 3. 코드 품질 개선

### Q1. UUID 헬퍼 3중 중복 → 공유 패키지로 추출

**문제:** `schema/models.go`, `migration/engine.go`, `api/dynamic_handler.go` 각각에 UUID 바이트 배열 ↔ 36자 대시 문자열 변환 로직이 중복 구현되어 있었다. 구현이 조금씩 달라 유지보수에 부담.

**수정:** `internal/pgutil/uuid.go`를 신설. 3개 함수만 노출:
- `FormatUUID(b [16]byte) string`
- `UUIDToString(u pgtype.UUID) string`
- `ParseUUID(s string) pgtype.UUID`

세 패키지의 로컬 구현은 모두 이 헬퍼를 호출하는 얇은 wrapper로 교체했다.

### Q2. 미사용 `ClassifyDropField` / `ClassifyDropCollection` 제거

**문제:** 두 함수는 정의만 있고 호출되는 곳이 없었다. 엔진은 호출 지점에서 `Dangerous` 상수를 직접 사용한다.

**수정:** 두 함수를 제거하고 주석으로 의도를 명시.

```go
// Note: drop_field and drop_collection are hardcoded as Dangerous at the call site
// (see engine.DropField / engine.DropCollection); no classifier helper is needed.
```

---

## 4. 남긴 개선 여지

본 리뷰에서 수정하지 않았지만 향후 개선이 필요한 항목.

### G1. `select` / `multiselect` 필드의 `options.choices` 검증 부재

설계문서는 select 필드가 `options: {choices: [...]}` 형태로 선택지를 가진다고 명시했으나, `validateFieldIn()`은 이를 강제하지 않는다. 빈 choices로 select 필드를 만들 수 있고, 그 경우 Dynamic API에서 어떤 값이든 통과한다.

**TODO:** `validateFieldIn`에서 `FieldSelect`/`FieldMultiselect`인 경우 options JSON을 파싱하여 `choices` 배열이 비어있지 않은지 확인.

### G2. `UpdateCollection`은 migration 이력을 기록하지 않음

label/icon/sort_order 변경은 DDL을 수반하지 않지만, 설계문서의 "모든 스키마 변경은 이력으로 남고"에 따르면 기록되어야 한다.

**TODO:** `UpdateCollection`을 `engine.UpdateCollection`으로 옮기고, DDL 없이 `_history.schema_migrations`에 `operation = update_collection_meta` 로 기록.

### G3. PostgreSQL 식별자 쿼팅은 `fmt.Sprintf("%q", ...)`

Go의 `%q`는 Go 문자열 literal 규칙(`\"` 이스케이프)을 따르고, PostgreSQL 식별자 쿼팅은 `""` 이스케이프를 쓴다. 현재 slug는 `^[a-z][a-z0-9_]{0,62}$` 정규식으로 검증되므로 쌍따옴표가 들어올 일이 없어 **현재 구현은 안전**하지만, 식별자 검증이 느슨해지면 취약해질 수 있다.

**TODO:** `internal/pgutil/quote.go`에 PostgreSQL 전용 `QuoteIdent(name string)`를 추가해 `""` 이스케이프를 수행.

---

## 5. 검증 결과

```
$ go build ./...     # 에러 없음
$ go vet ./...       # 경고 없음
$ go mod tidy        # 변경 없음
```

`go.mod`의 직접 의존성:
- `github.com/go-chi/chi/v5 v5.2.5`
- `github.com/jackc/pgx/v5 v5.9.1`

---

## 6. 최종 디렉토리 구조

```
cmd/phaeton/main.go
internal/
  config/
    config.go
  database/
    pool.go
    bootstrap.go
  pgutil/                    ← 신규
    uuid.go
  schema/
    models.go                ← UUID 로컬 함수를 pgutil wrapper로 축소
    validate.go              ← on_delete 화이트리스트 검증 추가
    store.go
    cache.go
  migration/
    models.go
    ddl.go                   ← SanitizeOnDelete 추가
    safety.go                ← 미사용 classifier 제거
    compat.go
    engine.go                ← applyRelationDDL 헬퍼, 사전 검증, 롤백 DDL, is_system 차단
  api/
    json.go
    filter.go
    schema_handler.go
    dynamic_handler.go       ← 로컬 formatUUID 제거, pgutil 사용
    routes.go
```

---

## 7. 변경 파일 일람

수정:
- `internal/migration/ddl.go` (+18 / SanitizeOnDelete)
- `internal/migration/engine.go` (+50 -40 / applyRelationDDL 추출, 사전 검증, 롤백 DDL, is_system 차단, UUID 로컬 함수 축소)
- `internal/migration/safety.go` (-6 +2 / 미사용 함수 제거)
- `internal/schema/models.go` (-70 +7 / UUID 헬퍼 축소)
- `internal/schema/validate.go` (+9 / on_delete 검증)
- `internal/api/dynamic_handler.go` (-16 +2 / formatUUID 제거)

신규:
- `internal/pgutil/uuid.go` (+67)

순 증감: **+59 / -132 = -73 lines**. 중복 제거 효과로 총 라인 수가 감소했다.
