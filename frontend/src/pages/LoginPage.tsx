import { useState } from 'react'
import { useNavigate } from 'react-router'

import { api } from '@/lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/auth/login', { email, password })
      navigate('/')
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-stone-900">Phaeton</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm text-stone-600">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-stone-600">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <button type="submit" className="w-full rounded-md bg-stone-900 py-2 text-sm text-white hover:bg-stone-800">
          로그인
        </button>
      </form>
    </div>
  )
}
