package migration

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// FieldTypeToPG maps a schema field type to its PostgreSQL column type.
func FieldTypeToPG(ft schema.FieldType) string {
	switch ft {
	case schema.FieldText:
		return "TEXT"
	case schema.FieldNumber:
		return "NUMERIC"
	case schema.FieldInteger:
		return "INTEGER"
	case schema.FieldBoolean:
		return "BOOLEAN"
	case schema.FieldDate:
		return "DATE"
	case schema.FieldDatetime:
		return "TIMESTAMPTZ"
	case schema.FieldSelect:
		return "VARCHAR(255)"
	case schema.FieldMultiselect:
		return "TEXT[]"
	case schema.FieldRelation:
		return "UUID"
	case schema.FieldFile:
		return "UUID"
	case schema.FieldJSON:
		return "JSONB"
	case schema.FieldTextarea:
		return "TEXT"
	case schema.FieldTime:
		return "TIME"
	case schema.FieldUser:
		return "UUID"
	case schema.FieldLabel, schema.FieldLine, schema.FieldSpacer:
		return "" // layout types have no DB column
	default:
		return "TEXT"
	}
}

// All generators return slices of individual SQL statements.
// Each element is a complete, standalone statement with no trailing semicolon.
// This avoids any `;\n` splitting that breaks on statements with embedded
// semicolons (function bodies, DO blocks, triggers).

// GenerateCreateTable produces the DDL statements for a new data table,
// including any requested indexes for indexed fields.
func GenerateCreateTable(col schema.Collection, fields []schema.Field) (up, down []string) {
	qTable := quoteIdent("data", col.Slug)

	var colDefs []string
	colDefs = append(colDefs, "id UUID PRIMARY KEY DEFAULT gen_random_uuid()")
	for _, f := range fields {
		if f.FieldType.IsLayout() {
			continue
		}
		colDefs = append(colDefs, columnDef(f))
	}
	colDefs = append(colDefs,
		"created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
		"updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
		"created_by UUID",
		"updated_by UUID",
		"deleted_at TIMESTAMPTZ",
	)

	up = append(up, fmt.Sprintf("CREATE TABLE %s (\n  %s\n)", qTable, strings.Join(colDefs, ",\n  ")))

	for _, f := range fields {
		if f.IsIndexed {
			up = append(up, generateCreateIndex(col.Slug, f.Slug))
		}
	}

	down = []string{fmt.Sprintf("DROP TABLE IF EXISTS %s", qTable)}
	return up, down
}

// GenerateDropTable produces DDL to drop a data table.
// The returned `down` is nil because reconstructing the original schema
// requires the full Collection+Fields (see engine.DropCollection which stores
// the reconstruction DDL in the migration record by calling GenerateCreateTable
// at drop time).
func GenerateDropTable(slug string) (up, down []string) {
	qTable := quoteIdent("data", slug)
	up = []string{fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", qTable)}
	return up, nil
}

// GenerateAddColumn produces DDL to add a column, plus any unique/index statements.
// Layout fields produce no DDL.
func GenerateAddColumn(tableSlug string, f schema.Field) (up, down []string) {
	if f.FieldType.IsLayout() {
		return nil, nil
	}
	qTable := quoteIdent("data", tableSlug)
	qCol := quoteIdentSingle(f.Slug)
	pgType := FieldTypeToPG(f.FieldType)

	clause := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", qTable, qCol, pgType)
	if f.IsRequired {
		clause += " NOT NULL"
	}
	if def := defaultClause(f); def != "" {
		clause += " DEFAULT " + def
	}
	up = append(up, clause)

	if f.IsUnique {
		up = append(up, generateAddUnique(tableSlug, f.Slug))
	}
	if f.IsIndexed {
		up = append(up, generateCreateIndex(tableSlug, f.Slug))
	}

	down = []string{fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %s", qTable, qCol)}
	return up, down
}

// GenerateDropColumn produces DDL to drop a column.
func GenerateDropColumn(tableSlug string, f schema.Field) (up, down []string) {
	qTable := quoteIdent("data", tableSlug)
	qCol := quoteIdentSingle(f.Slug)
	pgType := FieldTypeToPG(f.FieldType)

	up = []string{fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %s", qTable, qCol)}
	down = []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", qTable, qCol, pgType)}
	return up, down
}

// GenerateAlterColumnType produces DDL for a type change with the appropriate USING cast.
func GenerateAlterColumnType(tableSlug, colSlug string, from, to schema.FieldType) (up, down []string) {
	qTable := quoteIdent("data", tableSlug)
	qCol := quoteIdentSingle(colSlug)
	toPG := FieldTypeToPG(to)
	fromPG := FieldTypeToPG(from)
	casting := castExpr(qCol, from, to)

	up = []string{fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s USING %s",
		qTable, qCol, toPG, casting)}
	down = []string{fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s",
		qTable, qCol, fromPG)}
	return up, down
}

// GenerateSetNotNull / GenerateDropNotNull — single-statement helpers.
func GenerateSetNotNull(tableSlug, colSlug string) string {
	return fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s SET NOT NULL",
		quoteIdent("data", tableSlug), quoteIdentSingle(colSlug))
}

func GenerateDropNotNull(tableSlug, colSlug string) string {
	return fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s DROP NOT NULL",
		quoteIdent("data", tableSlug), quoteIdentSingle(colSlug))
}

// validOnDelete is the whitelist of allowed ON DELETE actions.
var validOnDelete = map[string]bool{
	"CASCADE":     true,
	"SET NULL":    true,
	"RESTRICT":    true,
	"NO ACTION":   true,
	"SET DEFAULT": true,
}

// SanitizeOnDelete returns a safe ON DELETE clause, defaulting to SET NULL.
func SanitizeOnDelete(s string) string {
	up := strings.ToUpper(strings.TrimSpace(s))
	if validOnDelete[up] {
		return up
	}
	return "SET NULL"
}

// GenerateAddFK produces a foreign-key constraint for a relation field.
func GenerateAddFK(tableSlug, colSlug, targetSlug, onDelete string) (up, down string) {
	constraintName := fmt.Sprintf("fk_%s_%s", tableSlug, colSlug)
	action := SanitizeOnDelete(onDelete)
	up = fmt.Sprintf(
		"ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s(id) ON DELETE %s",
		quoteIdent("data", tableSlug),
		quoteIdentSingle(constraintName),
		quoteIdentSingle(colSlug),
		quoteIdent("data", targetSlug),
		action,
	)
	down = fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT IF EXISTS %s",
		quoteIdent("data", tableSlug), quoteIdentSingle(constraintName))
	return up, down
}

// GenerateJunctionTable produces DDL for a many-to-many junction table.
func GenerateJunctionTable(slugA, slugB, junctionName string) (up, down string) {
	qTable := quoteIdent("data", junctionName)
	colA := slugA + "_id"
	colB := slugB + "_id"
	up = fmt.Sprintf(`CREATE TABLE %s (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  %s UUID NOT NULL REFERENCES %s(id) ON DELETE CASCADE,
  %s UUID NOT NULL REFERENCES %s(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(%s, %s)
)`,
		qTable,
		quoteIdentSingle(colA), quoteIdent("data", slugA),
		quoteIdentSingle(colB), quoteIdent("data", slugB),
		quoteIdentSingle(colA), quoteIdentSingle(colB),
	)
	down = fmt.Sprintf("DROP TABLE IF EXISTS %s", qTable)
	return up, down
}

// GenerateAddStatusColumn produces DDL to add the _status column to a data table.
func GenerateAddStatusColumn(tableSlug string) (up, down []string) {
	qTable := quoteIdent("data", tableSlug)
	up = []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN %q VARCHAR(255)", qTable, "_status")}
	down = []string{fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %q", qTable, "_status")}
	return up, down
}

// GenerateDropStatusColumn produces DDL to drop the _status column.
func GenerateDropStatusColumn(tableSlug string) (up, down []string) {
	qTable := quoteIdent("data", tableSlug)
	up = []string{fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %q", qTable, "_status")}
	down = []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN %q VARCHAR(255)", qTable, "_status")}
	return up, down
}

// ---------- internal helpers ----------

func columnDef(f schema.Field) string {
	qCol := quoteIdentSingle(f.Slug)
	pgType := FieldTypeToPG(f.FieldType)
	def := qCol + " " + pgType
	if f.IsRequired {
		def += " NOT NULL"
	}
	if d := defaultClause(f); d != "" {
		def += " DEFAULT " + d
	}
	if f.IsUnique {
		def += " UNIQUE"
	}
	return def
}

func defaultClause(f schema.Field) string {
	if len(f.DefaultValue) == 0 || string(f.DefaultValue) == "null" {
		return ""
	}
	var raw any
	if err := json.Unmarshal(f.DefaultValue, &raw); err != nil {
		return ""
	}
	switch v := raw.(type) {
	case string:
		return "'" + escapeSQLString(v) + "'"
	case float64:
		return fmt.Sprintf("%g", v)
	case bool:
		if v {
			return "TRUE"
		}
		return "FALSE"
	default:
		return ""
	}
}

func castExpr(qCol string, from, to schema.FieldType) string {
	toPG := FieldTypeToPG(to)
	switch {
	case from == schema.FieldSelect && to == schema.FieldMultiselect:
		return fmt.Sprintf("ARRAY[%s]::TEXT[]", qCol)
	case from == schema.FieldNumber && to == schema.FieldInteger:
		return fmt.Sprintf("%s::INTEGER", qCol)
	case from == schema.FieldInteger && to == schema.FieldNumber:
		return fmt.Sprintf("%s::NUMERIC", qCol)
	default:
		return fmt.Sprintf("%s::%s", qCol, toPG)
	}
}

func generateCreateIndex(tableSlug, colSlug string) string {
	idxName := fmt.Sprintf("idx_%s_%s", tableSlug, colSlug)
	return fmt.Sprintf("CREATE INDEX IF NOT EXISTS %s ON %s (%s)",
		quoteIdentSingle(idxName), quoteIdent("data", tableSlug), quoteIdentSingle(colSlug))
}

func generateAddUnique(tableSlug, colSlug string) string {
	cName := fmt.Sprintf("uq_%s_%s", tableSlug, colSlug)
	return fmt.Sprintf("ALTER TABLE %s ADD CONSTRAINT %s UNIQUE (%s)",
		quoteIdent("data", tableSlug), quoteIdentSingle(cName), quoteIdentSingle(colSlug))
}

func quoteIdent(schemaName, name string) string {
	return fmt.Sprintf("%q.%q", schemaName, name)
}

func quoteIdentSingle(name string) string {
	return fmt.Sprintf("%q", name)
}

func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}
