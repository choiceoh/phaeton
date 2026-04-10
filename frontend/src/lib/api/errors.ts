// Typed API error. Every fetch failure becomes one of these — no untyped Errors
// reach the UI layer.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  isUnauthorized(): boolean {
    return this.status === 401
  }
  isForbidden(): boolean {
    return this.status === 403
  }
  isNotFound(): boolean {
    return this.status === 404
  }
  isConflict(): boolean {
    return this.status === 409
  }
  isValidation(): boolean {
    return this.status === 400 || this.status === 422
  }
  isServer(): boolean {
    return this.status >= 500
  }
}

// User-friendly fallback messages when the server response is terse or empty.
const FRIENDLY_MESSAGES: Record<number, string> = {
  400: '입력값을 확인해 주세요.',
  401: '로그인이 필요합니다. 다시 로그인해 주세요.',
  403: '이 작업을 수행할 권한이 없습니다.',
  404: '요청한 항목을 찾을 수 없습니다.',
  409: '다른 사용자가 수정한 내용과 충돌합니다. 새로고침 후 다시 시도해 주세요.',
  413: '파일 크기가 너무 큽니다.',
  422: '입력값을 확인해 주세요.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  500: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  502: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  503: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
}

// Format an error for display in a toast or inline message.
// Always returns a non-empty string so callers don't have to null-check.
export function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    // Use the server message if it's meaningful, otherwise fall back to a
    // friendly status-based message.
    if (err.message && err.message !== err.code) return err.message
    return FRIENDLY_MESSAGES[err.status] ?? err.message
  }
  if (err instanceof Error) {
    if (err.message === 'Failed to fetch') return '네트워크 연결을 확인해 주세요.'
    return err.message
  }
  if (typeof err === 'string') return err
  return '알 수 없는 오류가 발생했습니다.'
}
