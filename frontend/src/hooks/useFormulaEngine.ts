/**
 * useFormulaEngine — React hook for client-side formula evaluation.
 *
 * Parses all formula fields, builds a dependency graph, and provides
 * `recomputeRow` for instant formula recalculation after cell edits.
 * Cross-sheet formulas (LOOKUP, SUMREL, etc.) are skipped — their values
 * come from the server.
 */
import { useCallback, useMemo } from 'react'

import type { Field } from '@/lib/types'
import {
  buildDependencyGraph,
  evaluate,
  getAffectedFormulas,
  type DependencyGraph,
} from '@/lib/formulaEngine'

export interface UseFormulaEngineReturn {
  /** Dependency graph (stable ref while fields stay the same) */
  depGraph: DependencyGraph
  /** Recompute formula values for a single row after a field change.
   *  Returns a partial record of formula slug → new value.
   *  Only locally-evaluable formulas are included. */
  recomputeRow: (row: Record<string, unknown>, changedSlug: string) => Record<string, unknown>
  /** Check if any formula depends on the given field slug */
  hasFormulaDeps: (slug: string) => boolean
}

export function useFormulaEngine(fields: Field[]): UseFormulaEngineReturn {
  const depGraph = useMemo(() => buildDependencyGraph(fields), [fields])

  const recomputeRow = useCallback(
    (row: Record<string, unknown>, changedSlug: string): Record<string, unknown> => {
      const affected = getAffectedFormulas(changedSlug, depGraph)
      if (affected.length === 0) return {}

      const overrides: Record<string, unknown> = {}
      const working = { ...row }

      // Evaluate affected formulas in topological order
      for (const slug of affected) {
        const info = depGraph.parsedFormulas.get(slug)
        if (!info || info.hasCrossRefs) continue
        const value = evaluate(info.ast, working)
        overrides[slug] = value
        working[slug] = value // feed into subsequent chained formulas
      }

      return overrides
    },
    [depGraph],
  )

  const hasFormulaDeps = useCallback(
    (slug: string): boolean => {
      const deps = depGraph.graph.get(slug)
      return deps != null && deps.length > 0
    },
    [depGraph],
  )

  return { depGraph, recomputeRow, hasFormulaDeps }
}
