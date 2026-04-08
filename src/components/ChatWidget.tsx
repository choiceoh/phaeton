'use client'

import { useState } from 'react'

import ChatPanel from '@/components/ChatPanel'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-blue-500 text-white
          rounded-full flex items-center justify-center hover:bg-blue-600
          shadow-lg z-50 text-lg"
        aria-label="AI 어시스턴트 열기"
      >
        {open ? '\u00d7' : 'AI'}
      </button>
    </>
  )
}
