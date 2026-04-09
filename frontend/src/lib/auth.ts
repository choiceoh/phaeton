import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { ApiError, api } from './api'
import type { User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
}

// useAuth fetches the current user via /api/auth/me and redirects to /login on 401.
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api
      .get<User>('/auth/me')
      .then((user) => {
        if (!cancelled) setState({ user, loading: false })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ user: null, loading: false })
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login', { replace: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  return state
}
