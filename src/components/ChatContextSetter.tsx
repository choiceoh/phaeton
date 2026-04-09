'use client'

import { useEffect } from 'react'

import { useChatContext } from '@/components/ChatContext'

export function ChatContextSetter({ context }: { context: string }) {
  const { setPageContext } = useChatContext()
  useEffect(() => {
    setPageContext(context)
    return () => setPageContext('')
  }, [context, setPageContext])
  return null
}
