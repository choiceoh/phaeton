package migration

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/choiceoh/phaeton/services/schema-engine/internal/schema"
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
	default:
		return "TEXT"
	}
}

// GenerateCreateTable produces the DDL for a new data table.
func GenerateCreateTable(col schema.Collection, fields []schema.Field) (up, down string) {
	qTable := quoteIdent("data", col.Slug)

	var colDefs []string
	colDefs = append(colDefs, "id UUID PRIMARY KEY DEFAULT gen_random_uuid()")

	for _, f := range fields {
		colDefs = append(colDefs, columnDef(f))
	}

	colDefs = append(colDefs,
		"created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
		"updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
		"created_by UUID",
		"deleted_at TIMESTAMPTZ",
	)

	up = fmt.Sprintf("CREATE TABLE %s (\n  %s\n)", qTable, strings.Join(colDefs, ",\n  "))

	// Append indexes for indexed fields.
	for _, f := range fields {
		if f.IsIndexed {
			up += ";\n" + generateCreateIndex(col.Slug, f.Slug)
		}
	}

	down = fmt.Sprintf("DROP TABLE IF EXISTS %s", qTable)
	return up, down
}

// GenerateDropTable produces DDL to drop a data table (for rollback of create).
func GenerateDropTable(slug string) (up, down string) {
	qTable := quoteIdent("data", slug)
	up = fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", qTable)
	down = "" // cannot reconstruct — full DDL is stored in the original migration payload
	return up, down
}

// GenerateAddColumn produces DDL to add a column to an existing table.
func GenerateAddColumn(tableSlug string, f schema.Field) (up, down string) {
	qTable := quoteIdent("data", tableSlug)
	qCol := quoteIdentSingle(f.Slug)
	pgType := FieldTypeToPG(f.FieldType)

	clause := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", qTable, qCol, pgType)
	if f.IsRequired {
		clause += " NOT NULL"
	}
	def := defaultClause(f)
	if def != "" {
		clause += " DEFAULT " + def
	}
	up = clause

	down = fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %s", qTable, qCol)

	// If unique or indexed, append extra statements.
	if f.IsUnique {
		up += ";\n" + generateAddUnique(tableSlug, f.Slug)
	}
	if f.IsIndexed {
		up += ";\n" + generateCreateIndex(tableSlug, f.Slug)
	}

	return up, down
}

// GenerateDropColumn produces DDL to drop a column.
func GenerateDropColumn(tableSlug string, f schema.Field) (up, down string) {
	qTable := quoteIdent("data", tableSlug)
	qCol := quoteIdentSingle(f.Slug)
	up = fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS %s", qTable, qCol)

	// Down: re-add the column.
	pgType := FieldTypeToPG(f.FieldType)
	down = fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", qTable, qCol, pgType)
	return up, down
}

// GenerateAlterColumnType produces DDL for a type change.
func GenerateAlterColumnType(tableSlug, colSlug string, from, to schema.FieldType) (up, down string) {
	qTable := quoteIdent("data", tableSlug)
	qCol := quoteIdentSingle(colSlug)
	toPG := FieldTypeToPG(to)
	fromPG := FieldTypeToPG(from)

	casting := castExpr(qCol, from, to)
	up = fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s USING %s",
		qTable, qCol, toPG, casting)
	down = fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE %s",
		qTable, qCol, fromPG)
	return up, down
}

// GenerateSetNotNull / GenerateDropNotNull
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
	"CASCADE":   true,
	"SET NULL":  true,
	"RESTRICT":  true,
	"NO ACTION": true,
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
	// The default value is stored as JSON. Extract the raw value.
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

	// Special conversions.
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

// quoteIdent quotes a two-part PostgreSQL identifier (schema.table).
func quoteIdent(schemaName, name string) string {
	return fmt.Sprintf("%q.%q", schemaName, name)
}

// quoteIdentSingle quotes a single PostgreSQL identifier.
func quoteIdentSingle(name string) string {
	return fmt.Sprintf("%q", name)
}

func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}
