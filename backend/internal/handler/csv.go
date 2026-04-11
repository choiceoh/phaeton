package handler

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/xuri/excelize/v2"

	"github.com/choiceoh/phaeton/backend/internal/middleware"
	"github.com/choiceoh/phaeton/backend/internal/pgutil"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// ExportCSV streams the entire (filtered) result set as CSV.
// It reuses the same filter/sort params as List but removes pagination.
func (h *DynHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}
	if !h.checkAccess(w, r, col, "entry_view") {
		return
	}

	params := r.URL.Query()
	qTable := pgutil.QuoteQualified("data", col.Slug)

	where, args, err := ParseFilters(params, fields)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Text search.
	searchClause, searchArgs := BuildSearchClause(params.Get("q"), fields, "", len(args)+1)
	where += " " + searchClause
	args = append(args, searchArgs...)

	orderBy := ParseSort(params.Get("sort"), fields)
	selectCols := buildSelectCols(fields, false, &selectColOpts{cache: h.cache})

	sql := fmt.Sprintf("SELECT %s FROM %s WHERE deleted_at IS NULL %s %s",
		selectCols, qTable, where, orderBy)

	rows, err := h.pool.Query(r.Context(), sql, args...)
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer rows.Close()

	records, err := collectRows(rows)
	if err != nil {
		handleErr(w, r, err)
		return
	}

	// Build CSV headers: id + field labels + system columns.
	headers := []string{"id"}
	slugs := []string{"id"}
	for _, f := range fields {
		headers = append(headers, f.Label)
		slugs = append(slugs, f.Slug)
	}
	headers = append(headers, "작성일", "수정일")
	slugs = append(slugs, "created_at", "updated_at")

	filename := fmt.Sprintf("%s_%s.csv", col.Slug, time.Now().Format("20060102"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	// BOM for Excel UTF-8 compatibility.
	w.Write([]byte{0xEF, 0xBB, 0xBF})

	cw := csv.NewWriter(w)
	cw.Write(headers)

	for _, rec := range records {
		row := make([]string, len(slugs))
		for i, s := range slugs {
			row[i] = formatCSVValue(rec[s])
		}
		cw.Write(row)
	}
	cw.Flush()
}

func formatCSVValue(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case time.Time:
		return val.Format(time.RFC3339)
	case []any:
		parts := make([]string, len(val))
		for i, el := range val {
			parts[i] = fmt.Sprint(el)
		}
		return strings.Join(parts, ", ")
	case []string:
		return strings.Join(val, ", ")
	default:
		return fmt.Sprint(val)
	}
}

// ImportFile handles both CSV and XLSX file imports.
// It detects the file type from the uploaded filename extension
// and delegates parsing to the appropriate format handler.
func (h *DynHandler) ImportFile(w http.ResponseWriter, r *http.Request) {
	r, cancel := withDeadline(r, 60*time.Second)
	defer cancel()

	slug := chi.URLParam(r, "slug")
	col, fields, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}
	if !h.checkAccess(w, r, col, "entry_create") {
		return
	}

	// Limit upload size to 10 MB.
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	file, fh, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing or invalid file upload")
		return
	}
	defer file.Close()

	// Optional: AI-provided column mapping (header → slug).
	var aiMap map[string]string
	if cm := r.FormValue("column_map"); cm != "" {
		_ = json.Unmarshal([]byte(cm), &aiMap)
	}

	// Detect file format by extension.
	name := strings.ToLower(fh.Filename)
	if strings.HasSuffix(name, ".xlsx") || strings.HasSuffix(name, ".xls") {
		h.importXLSX(w, r, col, fields, file, aiMap)
	} else {
		h.importCSV(w, r, col, fields, file, aiMap)
	}
}

// importCSV parses a CSV file and imports records.
func (h *DynHandler) importCSV(w http.ResponseWriter, r *http.Request, col schema.Collection, fields []schema.Field, file io.Reader, aiMap map[string]string) {
	cr := csv.NewReader(file)
	cr.TrimLeadingSpace = true

	// Read header row.
	headerRow, err := cr.Read()
	if err != nil {
		writeError(w, http.StatusBadRequest, "cannot read CSV header")
		return
	}
	// Strip BOM from first header.
	if len(headerRow) > 0 {
		headerRow[0] = strings.TrimPrefix(headerRow[0], "\xef\xbb\xbf")
	}

	// Read data rows.
	var dataRows [][]string
	lineNum := 1
	for {
		record, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("CSV parse error at line %d: %v", lineNum+1, err))
			return
		}
		lineNum++
		dataRows = append(dataRows, record)
	}

	h.importRecords(w, r, col, fields, headerRow, dataRows, aiMap)
}

// importXLSX parses an XLSX file and imports records.
func (h *DynHandler) importXLSX(w http.ResponseWriter, r *http.Request, col schema.Collection, fields []schema.Field, file io.Reader, aiMap map[string]string) {
	// Optional: sheet name from form value.
	sheetName := r.FormValue("sheet")

	xf, err := excelize.OpenReader(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("cannot read Excel file: %v", err))
		return
	}
	defer xf.Close()

	// Use specified sheet or first sheet.
	if sheetName == "" {
		sheetName = xf.GetSheetName(0)
	}

	rows, err := xf.GetRows(sheetName)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("cannot read sheet %q: %v", sheetName, err))
		return
	}
	if len(rows) == 0 {
		writeError(w, http.StatusBadRequest, "Excel file contains no data")
		return
	}

	headerRow := rows[0]
	var dataRows [][]string
	if len(rows) > 1 {
		dataRows = rows[1:]
	}

	h.importRecords(w, r, col, fields, headerRow, dataRows, aiMap)
}

// importRecords is the shared import logic for both CSV and XLSX.
// It maps headers to fields, coerces values, validates, and bulk-inserts.
func (h *DynHandler) importRecords(w http.ResponseWriter, r *http.Request,
	col schema.Collection, fields []schema.Field,
	headerRow []string, dataRows [][]string, aiMap map[string]string) {

	// Map header indices to field slugs. Accept both slug and label.
	bySlug := make(map[string]schema.Field, len(fields))
	byLabel := make(map[string]schema.Field, len(fields))
	for _, f := range fields {
		bySlug[f.Slug] = f
		byLabel[f.Label] = f
	}

	type colMapping struct {
		idx   int
		field schema.Field
	}
	var mappings []colMapping
	for i, hdr := range headerRow {
		hdr = strings.TrimSpace(hdr)
		if f, ok := bySlug[hdr]; ok {
			mappings = append(mappings, colMapping{idx: i, field: f})
		} else if f, ok := byLabel[hdr]; ok {
			mappings = append(mappings, colMapping{idx: i, field: f})
		} else if aiMap != nil {
			if slug, ok := aiMap[hdr]; ok {
				if f, ok := bySlug[slug]; ok {
					mappings = append(mappings, colMapping{idx: i, field: f})
				}
			}
		}
	}

	if len(mappings) == 0 {
		writeError(w, http.StatusBadRequest, "no columns matched any field slug or label")
		return
	}

	// Build record bodies from data rows.
	var bodies []map[string]any
	for lineIdx, record := range dataRows {
		body := make(map[string]any)
		for _, m := range mappings {
			if m.idx >= len(record) {
				continue
			}
			val := strings.TrimSpace(record[m.idx])
			if val == "" {
				continue
			}
			coerced, err := coerceCSVValue(val, m.field)
			if err != nil {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("row %d, field %q: %v", lineIdx+2, m.field.Slug, err))
				return
			}
			body[m.field.Slug] = coerced
		}
		if len(body) > 0 {
			bodies = append(bodies, body)
		}
	}

	if len(bodies) == 0 {
		writeError(w, http.StatusBadRequest, "file contains no data rows")
		return
	}
	if len(bodies) > 1000 {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("too many rows: %d (max 1000)", len(bodies)))
		return
	}

	// Validate all records.
	for i, body := range bodies {
		if err := validatePayload(r.Context(), h.pool, h.cache, body, fields, true); err != nil {
			handleErr(w, r, fmt.Errorf("row %d: %w", i+2, err))
			return
		}
	}

	// Bulk insert in a single transaction.
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		handleErr(w, r, err)
		return
	}
	defer tx.Rollback(r.Context())

	qTable := pgutil.QuoteQualified("data", col.Slug)
	selectCols := buildSelectCols(fields, false, &selectColOpts{cache: h.cache})

	user, _ := middleware.GetUser(r.Context())
	created := make([]map[string]any, 0, len(bodies))
	for i, body := range bodies {
		colNames, placeholders, args := buildInsertColumns(body, fields, user.UserID)
		var sql string
		if len(colNames) == 0 {
			sql = fmt.Sprintf("INSERT INTO %s DEFAULT VALUES RETURNING %s", qTable, selectCols)
		} else {
			sql = fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING %s",
				qTable, strings.Join(colNames, ", "), strings.Join(placeholders, ", "), selectCols)
		}
		rows, err := tx.Query(r.Context(), sql, args...)
		if err != nil {
			handleErr(w, r, fmt.Errorf("row %d: %w", i+2, err))
			return
		}
		recs, err := collectRows(rows)
		rows.Close()
		if err != nil {
			handleErr(w, r, fmt.Errorf("row %d: %w", i+2, err))
			return
		}
		if len(recs) > 0 {
			created = append(created, recs[0])
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		handleErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"imported": len(created),
	})
}

// ImportPreview returns a preview of the uploaded file's headers and first rows.
// This enables the frontend to show column mapping UI for XLSX files
// without needing a client-side parser.
func (h *DynHandler) ImportPreview(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	_, _, ok := h.resolveCollection(w, slug)
	if !ok {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	file, fh, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing or invalid file upload")
		return
	}
	defer file.Close()

	name := strings.ToLower(fh.Filename)
	var headers []string
	var rows [][]string
	var sheetNames []string

	if strings.HasSuffix(name, ".xlsx") || strings.HasSuffix(name, ".xls") {
		xf, err := excelize.OpenReader(file)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("cannot read Excel file: %v", err))
			return
		}
		defer xf.Close()

		sheetNames = xf.GetSheetList()
		sheetName := xf.GetSheetName(0)
		allRows, err := xf.GetRows(sheetName)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("cannot read sheet: %v", err))
			return
		}
		if len(allRows) > 0 {
			headers = allRows[0]
		}
		limit := 10
		if len(allRows)-1 < limit {
			limit = len(allRows) - 1
		}
		if limit > 0 {
			rows = allRows[1 : 1+limit]
		}
	} else {
		// CSV
		cr := csv.NewReader(file)
		cr.TrimLeadingSpace = true
		headerRow, err := cr.Read()
		if err != nil {
			writeError(w, http.StatusBadRequest, "cannot read CSV header")
			return
		}
		if len(headerRow) > 0 {
			headerRow[0] = strings.TrimPrefix(headerRow[0], "\xef\xbb\xbf")
		}
		headers = headerRow
		for i := 0; i < 10; i++ {
			record, err := cr.Read()
			if err == io.EOF {
				break
			}
			if err != nil {
				break
			}
			rows = append(rows, record)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"headers":    headers,
		"rows":       rows,
		"sheetNames": sheetNames,
	})
}

// Korean date regex: 2024년 3월 15일 or 2024년 03월 15일
var koDateRe = regexp.MustCompile(`^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$`)

// coerceCSVValue converts a raw string into the appropriate Go type for a field.
// Handles Excel-originated formats: comma-separated numbers, Korean dates, Korean booleans, etc.
func coerceCSVValue(val string, f schema.Field) (any, error) {
	switch f.FieldType {
	case schema.FieldText, schema.FieldTextarea:
		return val, nil

	case schema.FieldNumber:
		cleaned := strings.NewReplacer(",", "", " ", "", "₩", "", "$", "", "€", "", "¥", "").Replace(val)
		cleaned = strings.TrimSuffix(cleaned, "%")
		n, err := strconv.ParseFloat(cleaned, 64)
		if err != nil {
			return nil, fmt.Errorf("expected number, got %q", val)
		}
		return n, nil

	case schema.FieldInteger:
		cleaned := strings.NewReplacer(",", "", " ", "", "₩", "", "$", "", "€", "", "¥", "").Replace(val)
		n, err := strconv.ParseInt(cleaned, 10, 64)
		if err != nil {
			// Try parsing as float and truncating (Excel sometimes exports integers as "100.0").
			f, ferr := strconv.ParseFloat(cleaned, 64)
			if ferr != nil {
				return nil, fmt.Errorf("expected integer, got %q", val)
			}
			return int64(f), nil
		}
		return n, nil

	case schema.FieldBoolean:
		switch strings.ToLower(val) {
		case "true", "1", "yes", "y", "참":
			return true, nil
		case "false", "0", "no", "n", "거짓":
			return false, nil
		default:
			return nil, fmt.Errorf("expected boolean, got %q", val)
		}

	case schema.FieldDate:
		if parsed, ok := parseDateFlexible(val); ok {
			return parsed.Format("2006-01-02"), nil
		}
		return nil, fmt.Errorf("expected date, got %q", val)

	case schema.FieldDatetime:
		if parsed, ok := parseDatetimeFlexible(val); ok {
			return parsed.Format(time.RFC3339), nil
		}
		return nil, fmt.Errorf("expected datetime, got %q", val)

	case schema.FieldTime:
		if _, err := time.Parse("15:04", val); err == nil {
			return val, nil
		}
		if _, err := time.Parse("15:04:05", val); err == nil {
			return val, nil
		}
		return nil, fmt.Errorf("expected HH:MM or HH:MM:SS, got %q", val)

	case schema.FieldSelect:
		choices, err := schema.ExtractChoices(f.Options)
		if err == nil && len(choices) > 0 {
			found := false
			for _, c := range choices {
				if c == val {
					found = true
					break
				}
			}
			if !found {
				return nil, fmt.Errorf("value %q is not in allowed choices %v", val, choices)
			}
		}
		return val, nil

	case schema.FieldMultiselect:
		parts := strings.Split(val, ",")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		choices, err := schema.ExtractChoices(f.Options)
		if err == nil && len(choices) > 0 {
			choiceSet := make(map[string]bool, len(choices))
			for _, c := range choices {
				choiceSet[c] = true
			}
			for _, p := range parts {
				if !choiceSet[p] {
					return nil, fmt.Errorf("value %q is not in allowed choices %v", p, choices)
				}
			}
		}
		return parts, nil

	case schema.FieldRelation, schema.FieldUser, schema.FieldFile:
		return val, nil // UUID string

	case schema.FieldJSON:
		return val, nil // stored as-is; validatePayload will check

	default:
		return val, nil
	}
}

// parseDateFlexible parses a date string from various formats.
func parseDateFlexible(val string) (time.Time, bool) {
	for _, layout := range []string{
		"2006-01-02",
		"2006.01.02",
		"01/02/2006",
		"1/2/2006",
	} {
		if t, err := time.Parse(layout, val); err == nil {
			return t, true
		}
	}
	// Korean text format: 2024년 3월 15일
	if m := koDateRe.FindStringSubmatch(val); m != nil {
		y, _ := strconv.Atoi(m[1])
		mo, _ := strconv.Atoi(m[2])
		d, _ := strconv.Atoi(m[3])
		return time.Date(y, time.Month(mo), d, 0, 0, 0, 0, time.UTC), true
	}
	return time.Time{}, false
}

// parseDatetimeFlexible parses a datetime string from various formats.
func parseDatetimeFlexible(val string) (time.Time, bool) {
	for _, layout := range []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006.01.02 15:04:05",
		"01/02/2006 15:04:05",
		"01/02/2006 3:04 PM",
	} {
		if t, err := time.Parse(layout, val); err == nil {
			return t, true
		}
	}
	// Fall back to date-only parsing for datetime fields.
	if t, ok := parseDateFlexible(val); ok {
		return t, true
	}
	return time.Time{}, false
}
