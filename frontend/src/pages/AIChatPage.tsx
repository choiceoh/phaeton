import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle, RotateCcw, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAIAvailable } from '@/contexts/AIAvailabilityContext'
import { useAIChat, type ChatMessage } from '@/hooks/useAIChat'

const HINTS = [
  '앱을 만들려면 어떻게 하나요?',
  '현재 어떤 앱들이 있나요?',
  '항목 유형에는 어떤 것들이 있나요?',
  '데이터를 필터링하려면 어떻게 하나요?',
  '자동화 규칙을 설정하는 방법은?',
  '뷰를 추가하거나 전환하려면?',
]

export default function AIChatPage() {
  const aiAvailable = useAIAvailable()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const chatMutation = useAIChat()

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || chatMutation.isPending) return

    const userMsg: ChatMessage = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')

    chatMutation.mutate(
      { message: msg, history: messages },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.reply },
          ])
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
            },
          ])
        },
      },
    )
  }

  function autoResize() {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!aiAvailable) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-stone-400">
        <MessageCircle className="mb-3 h-10 w-10" />
        <p className="text-sm">AI 서버에 연결할 수 없습니다.</p>
        <p className="text-xs">잠시 후 다시 시도해 주세요.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-3xl flex-col">
      {/* Header */}
      {messages.length > 0 && (
        <div className="flex items-center justify-end py-2">
          <button
            onClick={() => { setMessages([]); setInput('') }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            새 대화
          </button>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="mb-3 h-10 w-10 text-stone-300" />
            <h2 className="text-lg font-medium text-stone-700">Topworks AI</h2>
            <p className="mt-1 text-sm text-stone-400">
              Topworks 사용에 대해 궁금한 점을 물어보세요.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {HINTS.map((hint) => (
                <button
                  key={hint}
                  onClick={() => handleSend(hint)}
                  className="rounded-lg border border-stone-200 px-4 py-2.5 text-left text-sm text-stone-600 transition-colors hover:bg-stone-50"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-800'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  답변 생성 중...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-stone-200 pt-4 pb-2">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요..."
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-stone-200 px-4 py-3 text-sm outline-none placeholder:text-stone-400 focus:border-stone-400"
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || chatMutation.isPending}
            className="h-11 w-11 shrink-0 p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-stone-400">
          로컬 AI가 응답합니다. 답변이 정확하지 않을 수 있습니다.
        </p>
      </div>
    </div>
  )
}
