import { useQueries } from '@tanstack/react-query'

import { useCollections } from '@/hooks/useCollections'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Collection, RelationType } from '@/lib/types'

export interface GraphNode {
  id: string
  label: string
  icon?: string
  fieldCount: number
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  label: string
  relationType: RelationType
}

export function useRelationshipGraph() {
  const { data: collections, isLoading: collectionsLoading } = useCollections()

  // Fetch detail for each collection (includes fields with relation data)
  const detailQueries = useQueries({
    queries: (collections ?? []).map((c) => ({
      queryKey: queryKeys.collections.detail(c.id),
      queryFn: () => api.get<Collection>(`/schema/collections/${c.id}`),
      enabled: !!collections,
      staleTime: 5 * 60 * 1000,
    })),
  })

  const isLoading = collectionsLoading || detailQueries.some((q) => q.isLoading)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  if (!isLoading && collections) {
    const collectionMap = new Map(collections.map((c) => [c.id, c]))

    for (const query of detailQueries) {
      const col = query.data
      if (!col) continue

      nodes.push({
        id: col.id,
        label: col.label,
        icon: col.icon,
        fieldCount: col.fields?.filter((f) => f.field_type !== 'label' && f.field_type !== 'line' && f.field_type !== 'spacer').length ?? 0,
      })

      for (const field of col.fields ?? []) {
        if (field.field_type !== 'relation' || !field.relation) continue
        const target = collectionMap.get(field.relation.target_collection_id)
        if (!target) continue

        edges.push({
          id: field.id,
          sourceId: col.id,
          targetId: field.relation.target_collection_id,
          label: field.label,
          relationType: field.relation.relation_type,
        })
      }
    }
  }

  return { nodes, edges, isLoading }
}
