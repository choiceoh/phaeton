const BASE = '/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface Envelope<T> {
  data?: T
  error?: string
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })

  if (!res.ok) {
    let errMsg = res.statusText
    let code = 'UNKNOWN'
    try {
      const parsed = await res.json()
      // apierr format: { code, message, ... }
      // envelope error format: { error: "message" }
      errMsg = parsed.message || parsed.error || res.statusText
      code = parsed.code || 'UNKNOWN'
    } catch {
      // body not JSON — fall through with defaults
    }

    // Redirect to login on 401, but skip when already on /login to avoid loop.
    if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }

    throw new ApiError(res.status, code, errMsg)
  }

  if (res.status === 204) {
    return undefined as T
  }

  const json = (await res.json()) as Envelope<T> | T

  // Unwrap envelope if present.
  if (json && typeof json === 'object' && 'data' in (json as Envelope<T>)) {
    return (json as Envelope<T>).data as T
  }
  return json as T
}

// requestRaw returns the raw response (not envelope-unwrapped).
// Use this for endpoints that return listEnvelope (with total/page metadata).
async function requestRaw<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })

  if (!res.ok) {
    let errMsg = res.statusText
    let code = 'UNKNOWN'
    try {
      const parsed = await res.json()
      errMsg = parsed.message || parsed.error || res.statusText
      code = parsed.code || 'UNKNOWN'
    } catch {
      // ignore
    }
    if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new ApiError(res.status, code, errMsg)
  }

  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  // Raw variants that preserve the full envelope (used for paginated lists).
  getRaw: <T>(path: string) => requestRaw<T>('GET', path),
}
