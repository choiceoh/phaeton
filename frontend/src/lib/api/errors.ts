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

// Format an error for display in a toast or inline message.
// Always returns a non-empty string so callers don't have to null-check.
export function formatError(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return '알 수 없는 오류가 발생했습니다.'
}
