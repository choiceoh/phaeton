import { useMutation } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  message: string
  history: ChatMessage[]
}

interface ChatResponse {
  reply: string
}

export function useAIChat() {
  return useMutation({
    mutationFn: (req: ChatRequest) =>
      api.post<ChatResponse>('/ai/chat', req),
  })
}
