import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'

import '@/lib/ai/prompts'
import { runPromptStream } from '@/lib/ai/client'
import type { ChatMessage } from '@/lib/ai/client'

export async function POST(req: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  let body: { message?: string, history?: ChatMessage[], context?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const { message, history, context } = body
  if (!message || typeof message !== 'string') {
    return Response.json({ error: '메시지가 필요합니다' }, { status: 400 })
  }

  try {
    const stream = await runPromptStream('chat', {
      userMessage: message,
      history: history ?? [],
      variables: { context: context ? `\n현재 컨텍스트:\n${context}` : '' },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error('[AI Chat]', err)
    return Response.json(
      { error: 'AI 서버에 연결할 수 없습니다' },
      { status: 502 },
    )
  }
}
