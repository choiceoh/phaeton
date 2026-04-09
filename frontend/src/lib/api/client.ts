// Typed fetch client that:
// - unwraps the {data, error} envelope returned by /api/* endpoints
// - converts non-2xx responses into ApiError (never raw Error or string)
// - redirects to /login on 401 (single source of truth for auth fallout)
// - is the only place that touches global window state — everything else is
//   pure functions on top of this.

import { ApiError } from './errors'

const BASE = '/api'

interface Envelope<T> {
  data?: T
  error?: string
}

interface ListEnvelope<T> {
  data: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export type { ListEnvelope }

interface RequestOptions {
  signal?: AbortSignal
  // When true, the response is returned as-is (no envelope unwrap). Used for
  // list endpoints that include total/page metadata at the envelope level.
  raw?: boolean
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    signal: opts.signal,
  })

  const requestId = res.headers.get('X-Request-ID') ?? undefined

  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`
    let code = `HTTP_${res.status}`
    try {
      const parsed = await res.json()
      message = parsed.message ?? parsed.error ?? message
      code = parsed.code ?? code
    } catch {
      // body wasn't JSON — fall through with HTTP defaults
    }

    if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }

    throw new ApiError(res.status, code, message, requestId)
  }

  if (res.status === 204) return undefined as T

  const json = (await res.json()) as Envelope<T> | T

  if (opts.raw) return json as T

  // Envelope unwrap. We accept both `{data: ...}` and bare values for
  // backwards compatibility with hand-written API endpoints.
  if (json && typeof json === 'object' && 'data' in (json as Envelope<T>)) {
    return (json as Envelope<T>).data as T
  }
  return json as T
}

export interface UploadResult {
  url: string
  name: string
  size: number
}

async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  })

  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`
    try {
      const parsed = await res.json()
      message = parsed.message ?? parsed.error ?? message
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, message)
  }

  const json = (await res.json()) as Envelope<UploadResult>
  return json.data as UploadResult
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  getList: <T>(path: string, opts?: RequestOptions) =>
    request<ListEnvelope<T>>('GET', path, undefined, { ...opts, raw: true }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PATCH', path, body, opts),
  del: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
  upload: uploadFile,
}
