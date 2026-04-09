'use client'

import { useState } from 'react'

import ChatPanel from '@/components/ChatPanel'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-stone-700 text-lg text-white shadow-lg hover:bg-stone-800"
        aria-label={open ? 'AI 어시스턴트 닫기' : 'AI 어시스턴트 열기'}
      >
        {open ? '\u00d7' : 'AI'}
      </button>
    </>
  )
}
