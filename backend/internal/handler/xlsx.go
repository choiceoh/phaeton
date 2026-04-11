package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/xuri/excelize/v2"

	"github.com/choiceoh/phaeton/backend/internal/pgutil"
	"github.com/choiceoh/phaeton/backend/internal/schema"
)

// ExportXLSX streams the entire (filtered) result set as an Excel XLSX file.
// It reuses the same filter/sort params as List but removes pagination.
func (h *DynHandler) ExportXLSX(w http.ResponseWriter, r *http.Request) {
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

	// Build field list (excluding layout/computed).
	type exportField struct {
		slug      string
		label     string
		fieldType schema.FieldType
		options   json.RawMessage
	}
	var ef []exportField
	for _, f := range fields {
		if f.FieldType.IsLayout() || f.FieldType.IsComputed() {
			continue
		}
		ef = append(ef, exportField{
			slug:      f.Slug,
			label:     f.Label,
			fieldType: f.FieldType,
			options:   f.Options,
		})
	}

	// Create workbook.
	f := excelize.NewFile()
	defer f.Close()

	sheetName := col.Label
	if sheetName == "" {
		sheetName = col.Slug
	}
	// Rename default sheet.
	f.SetSheetName("Sheet1", sheetName)

	// Header style: bold, light gray background.
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"F2F2F2"}, Pattern: 1},
		Alignment: &excelize.Alignment{Vertical: "center"},
		Border: []excelize.Border{
			{Type: "bottom", Color: "D0D0D0", Style: 1},
		},
	})

	// Write headers: field labels + system columns.
	headers := make([]string, 0, len(ef)+2)
	for _, field := range ef {
		headers = append(headers, field.label)
	}
	headers = append(headers, "작성일", "수정일")

	for ci, hdr := range headers {
		cell := cellRef(1, ci)
		f.SetCellStr(sheetName, cell, hdr)
		f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}

	// Freeze header row.
	f.SetPanes(sheetName, &excelize.Panes{
		Freeze:      true,
		Split:       false,
		XSplit:      0,
		YSplit:      1,
		TopLeftCell: "A2",
		ActivePane:  "bottomLeft",
	})

	// Pre-create number format styles per field.
	fieldStyles := make(map[int]int) // column index → style ID
	for ci, field := range ef {
		if style := numberFormatStyle(f, field.fieldType, field.options); style != 0 {
			fieldStyles[ci] = style
		}
	}
	dateStyle, _ := f.NewStyle(&excelize.Style{CustomNumFmt: stringPtr("yyyy-mm-dd")})
	datetimeStyle, _ := f.NewStyle(&excelize.Style{CustomNumFmt: stringPtr("yyyy-mm-dd hh:mm:ss")})

	// Track column widths (in approximate character count).
	colWidths := make([]int, len(headers))
	for ci, hdr := range headers {
		colWidths[ci] = runeWidth(hdr)
	}

	// Write data rows.
	for ri, rec := range records {
		rowNum := ri + 2 // 1-indexed, skip header
		ci := 0
		for fi, field := range ef {
			cell := cellRef(rowNum, ci)
			val := rec[field.slug]
			writeTypedCell(f, sheetName, cell, val, field.fieldType)
			if style, ok := fieldStyles[fi]; ok {
				f.SetCellStyle(sheetName, cell, cell, style)
			}
			// Track width (first 100 rows only).
			if ri < 100 {
				w := cellDisplayWidth(val)
				if w > colWidths[ci] {
					colWidths[ci] = w
				}
			}
			ci++
		}
		// System columns: created_at, updated_at.
		for _, sysCol := range []string{"created_at", "updated_at"} {
			cell := cellRef(rowNum, ci)
			if t, ok := parseTimeValue(rec[sysCol]); ok {
				f.SetCellValue(sheetName, cell, t)
				f.SetCellStyle(sheetName, cell, cell, datetimeStyle)
				if ri < 100 && 19 > colWidths[ci] {
					colWidths[ci] = 19
				}
			} else {
				f.SetCellStr(sheetName, cell, formatCSVValue(rec[sysCol]))
			}
			ci++
		}
	}

	// Apply column widths.
	for ci, w := range colWidths {
		colName := colLetter(ci)
		width := float64(w) + 2 // padding
		if width < 10 {
			width = 10
		}
		if width > 50 {
			width = 50
		}
		f.SetColWidth(sheetName, colName, colName, width)
	}

	// Apply date style to date-type columns.
	for fi, field := range ef {
		if field.fieldType == schema.FieldDate {
			colName := colLetter(fi)
			for ri := range records {
				cell := cellRef(ri+2, fi)
				f.SetCellStyle(sheetName, cell, cell, dateStyle)
			}
			_ = colName
		} else if field.fieldType == schema.FieldDatetime {
			for ri := range records {
				cell := cellRef(ri+2, fi)
				f.SetCellStyle(sheetName, cell, cell, datetimeStyle)
			}
		}
	}

	// Write response.
	filename := fmt.Sprintf("%s_%s.xlsx", col.Slug, time.Now().Format("20060102"))
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	if err := f.Write(w); err != nil {
		handleErr(w, r, err)
	}
}

// writeTypedCell writes a value to a cell with the appropriate Excel type.
func writeTypedCell(f *excelize.File, sheet, cell string, val any, ft schema.FieldType) {
	if val == nil {
		return
	}
	switch ft {
	case schema.FieldNumber:
		if n, ok := toFloat64(val); ok {
			f.SetCellFloat(sheet, cell, n, -1, 64)
			return
		}
	case schema.FieldInteger:
		if n, ok := toFloat64(val); ok {
			f.SetCellInt(sheet, cell, int64(n))
			return
		}
	case schema.FieldBoolean:
		switch v := val.(type) {
		case bool:
			f.SetCellBool(sheet, cell, v)
			return
		}
	case schema.FieldDate:
		if t, ok := parseTimeValue(val); ok {
			f.SetCellValue(sheet, cell, t)
			return
		}
	case schema.FieldDatetime:
		if t, ok := parseTimeValue(val); ok {
			f.SetCellValue(sheet, cell, t)
			return
		}
	case schema.FieldMultiselect:
		if arr, ok := val.([]any); ok {
			parts := make([]string, len(arr))
			for i, el := range arr {
				parts[i] = fmt.Sprint(el)
			}
			f.SetCellStr(sheet, cell, strings.Join(parts, ", "))
			return
		}
		if arr, ok := val.([]string); ok {
			f.SetCellStr(sheet, cell, strings.Join(arr, ", "))
			return
		}
	}
	// Fallback: string representation.
	f.SetCellStr(sheet, cell, fmt.Sprint(val))
}

// numberFormatStyle creates an Excel number format style based on field options.
func numberFormatStyle(f *excelize.File, ft schema.FieldType, opts json.RawMessage) int {
	if ft != schema.FieldNumber && ft != schema.FieldInteger {
		return 0
	}
	var parsed struct {
		DisplayType  string `json:"display_type"`
		CurrencyCode string `json:"currency_code"`
	}
	if len(opts) > 0 {
		_ = json.Unmarshal(opts, &parsed)
	}

	var numFmt string
	switch parsed.DisplayType {
	case "currency":
		code := strings.ToUpper(parsed.CurrencyCode)
		switch code {
		case "USD":
			numFmt = `$#,##0.00`
		case "EUR":
			numFmt = `€#,##0.00`
		case "JPY":
			numFmt = `¥#,##0`
		default: // KRW or unspecified
			numFmt = `₩#,##0`
		}
	case "percent":
		numFmt = `0.00%`
	default:
		if ft == schema.FieldInteger {
			numFmt = `#,##0`
		} else {
			numFmt = `#,##0.00`
		}
	}

	style, _ := f.NewStyle(&excelize.Style{CustomNumFmt: &numFmt})
	return style
}

// parseTimeValue tries to parse a time value from various formats.
func parseTimeValue(v any) (time.Time, bool) {
	switch t := v.(type) {
	case time.Time:
		return t, true
	case string:
		for _, layout := range []string{
			time.RFC3339,
			"2006-01-02T15:04:05",
			"2006-01-02",
		} {
			if parsed, err := time.Parse(layout, t); err == nil {
				return parsed, true
			}
		}
	}
	return time.Time{}, false
}

// cellRef returns an Excel cell reference like "A1", "B2", etc.
func cellRef(row, col int) string {
	return colLetter(col) + fmt.Sprint(row)
}

// colLetter converts a 0-based column index to Excel column letters (A, B, ..., Z, AA, AB, ...).
func colLetter(col int) string {
	result := ""
	for col >= 0 {
		result = string(rune('A'+col%26)) + result
		col = col/26 - 1
	}
	return result
}

// runeWidth estimates the display width of a string in characters.
func runeWidth(s string) int {
	// CJK characters are roughly 2 columns wide.
	w := 0
	for _, r := range s {
		if r >= 0x1100 && (r <= 0x115F || (r >= 0x2E80 && r <= 0x9FFF) ||
			(r >= 0xAC00 && r <= 0xD7AF) || (r >= 0xF900 && r <= 0xFAFF) ||
			(r >= 0xFE10 && r <= 0xFE6F) || (r >= 0xFF01 && r <= 0xFF60)) {
			w += 2
		} else {
			w++
		}
	}
	return w
}

// cellDisplayWidth estimates the display width for a cell value.
func cellDisplayWidth(v any) int {
	if v == nil {
		return 0
	}
	s := fmt.Sprint(v)
	n := utf8.RuneCountInString(s)
	if n > 30 {
		n = 30
	}
	return n
}

func stringPtr(s string) *string {
	return &s
}
