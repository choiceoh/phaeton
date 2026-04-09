'use client'

import { Button, Select, SelectItem, TextInput } from '@tremor/react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { uploadDocument } from '@/app/(frontend)/projects/[id]/actions'
import { DOC_TYPE_LABELS } from '@/lib/constants'

export function DocumentUploadForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    if (!title || !docType) {
      alert('서류명과 유형을 입력해 주세요.')
      return
    }

    const formData = new FormData()
    formData.set('projectId', projectId)
    formData.set('title', title)
    formData.set('docType', docType)
    if (expiryDate) formData.set('expiryDate', expiryDate)

    const file = fileRef.current?.files?.[0]
    if (file) formData.set('file', file)

    startTransition(async () => {
      const result = await uploadDocument(formData)
      if ('error' in result) {
        alert(result.error)
        return
      }
      setTitle('')
      setDocType('')
      setExpiryDate('')
      if (fileRef.current) fileRef.current.value = ''
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700"
      >
        서류 추가
      </button>
    )
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-medium">서류 업로드</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput
          placeholder="서류명"
          value={title}
          onValueChange={setTitle}
        />
        <Select
          placeholder="유형 선택"
          value={docType}
          onValueChange={setDocType}
        >
          {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          placeholder="만료일 (선택)"
          className="rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          className="text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="xs"
          variant="primary"
          color="blue"
          onClick={handleSubmit}
          loading={isPending}
        >
          업로드
        </Button>
        <Button
          size="xs"
          variant="secondary"
          color="gray"
          onClick={() => setOpen(false)}
        >
          취소
        </Button>
      </div>
    </div>
  )
}
