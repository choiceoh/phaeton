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

export interface AIBuildQuestion {
  id: string
  question: string
  placeholder?: string
  choices?: string[]
}

export interface AIBuildSchema {
  slug: string
  label: string
  description: string
  icon?: string
  fields: AIBuildField[]
}

export interface AIBuildEnvelope {
  mode: 'questions' | 'schema'
  questions?: AIBuildQuestion[]
  schema?: AIBuildSchema
}

/** For backwards compat */
export type AIBuildResult = AIBuildSchema

interface AIBuildInput {
  description: string
  answers?: Record<string, string>
}

export function useAIBuildCollection() {
  return useMutation({
    mutationFn: (input: AIBuildInput) =>
      api.post<AIBuildEnvelope>('/ai/build-collection', input),
  })
}
