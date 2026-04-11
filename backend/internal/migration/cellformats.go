package migration

import (
	"context"
	"fmt"
	"log/slog"
)

// EnsureCellFormatsColumn adds the _cell_formats JSONB column to all existing
// dynamic tables that don't have it yet. Uses IF NOT EXISTS for idempotency.
func (e *Engine) EnsureCellFormatsColumn(ctx context.Context) error {
	collections := e.cache.Collections()
	for _, col := range collections {
		up, _ := GenerateAddCellFormatsColumn(col.Slug)
		for _, stmt := range up {
			if _, err := e.pool.Exec(ctx, stmt); err != nil {
				return fmt.Errorf("ensure _cell_formats on %s: %w", col.Slug, err)
			}
		}
	}
	slog.Info("ensured _cell_formats column", "tables", len(collections))
	return nil
}
