package formula

import (
	"testing"
)

func TestParse(t *testing.T) {
	slugs := map[string]bool{
		"price":    true,
		"quantity": true,
		"tax":      true,
		"discount": true,
		"name":     true,
	}

	tests := []struct {
		name    string
		input   string
		wantSQL string
		wantErr bool
	}{
		{
			name:    "simple multiplication",
			input:   "price * quantity",
			wantSQL: `("price" * "quantity")`,
		},
		{
			name:    "leading equals sign",
			input:   "=price * quantity",
			wantSQL: `("price" * "quantity")`,
		},
		{
			name:    "arithmetic with parentheses",
			input:   "(price + tax) * quantity",
			wantSQL: `((("price" + "tax")) * "quantity")`,
		},
		{
			name:    "ROUND function",
			input:   "ROUND(price * 1.1, 2)",
			wantSQL: `ROUND(("price" * 1.1), 2)`,
		},
		{
			name:    "IF function",
			input:   "IF(quantity > 100, price * 0.9, price)",
			wantSQL: `CASE WHEN ("quantity" > 100) THEN ("price" * 0.9) ELSE "price" END`,
		},
		{
			name:    "COALESCE",
			input:   "COALESCE(discount, 0)",
			wantSQL: `COALESCE("discount", 0)`,
		},
		{
			name:    "nested functions",
			input:   "ROUND(price * quantity - COALESCE(discount, 0), 2)",
			wantSQL: `ROUND((("price" * "quantity") - COALESCE("discount", 0)), 2)`,
		},
		{
			name:    "unary minus",
			input:   "-price",
			wantSQL: `(-"price")`,
		},
		{
			name:    "number literal",
			input:   "price + 100",
			wantSQL: `("price" + 100)`,
		},
		{
			name:    "string literal",
			input:   "COALESCE(name, 'unknown')",
			wantSQL: `COALESCE("name", 'unknown')`,
		},
		{
			name:    "modulo",
			input:   "quantity % 10",
			wantSQL: `("quantity" % 10)`,
		},
		{
			name:    "unknown field",
			input:   "unknown_field * 2",
			wantErr: true,
		},
		{
			name:    "unknown function",
			input:   "DROP(price)",
			wantErr: true,
		},
		{
			name:    "empty expression",
			input:   "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sql, _, err := Parse(tt.input, slugs)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got sql=%q", sql)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if sql != tt.wantSQL {
				t.Errorf("sql mismatch:\n  got:  %s\n  want: %s", sql, tt.wantSQL)
			}
		})
	}
}

func TestParseRefs(t *testing.T) {
	slugs := map[string]bool{"price": true, "quantity": true, "tax": true}
	_, refs, err := Parse("price * quantity + tax", slugs)
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 3 {
		t.Errorf("expected 3 refs, got %d: %v", len(refs), refs)
	}
}
