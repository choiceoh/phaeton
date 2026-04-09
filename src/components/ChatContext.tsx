'use client'

import { createContext, useCallback, useContext, useState } from 'react'

interface ChatContextValue {
  pageContext: string
  setPageContext: (ctx: string) => void
}

const ChatCtx = createContext<ChatContextValue>({
  pageContext: '',
  setPageContext: () => {},
})

export function ChatContextProvider({ children }: { children: React.ReactNode }) {
  const [pageContext, setPageContextState] = useState('')
  const setPageContext = useCallback((ctx: string) => setPageContextState(ctx), [])

  return <ChatCtx.Provider value={{ pageContext, setPageContext }}>{children}</ChatCtx.Provider>
}

export function useChatContext() {
  return useContext(ChatCtx)
}
