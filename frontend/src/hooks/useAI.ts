import { useMutation } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface AIBuildField {
  slug: string
  label: string
  field_type: string
  is_required: boolean
  width: number
  height: number
  options?: Record<string, unknown>
}

export interface AIBuildResult {
  slug: string
  label: string
  description: string
  icon?: string
  fields: AIBuildField[]
}

export function useAIBuildCollection() {
  return useMutation({
    mutationFn: (description: string) =>
      api.post<AIBuildResult>('/ai/build-collection', { description }),
  })
}
