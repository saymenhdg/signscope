const DEFAULT_API_BASE = 'http://127.0.0.1:8000'
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim() || DEFAULT_API_BASE

type RequestOptions = RequestInit

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: options.credentials ?? 'include',
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot reach the API at ${API_BASE}. Check that the backend is running and VITE_API_BASE is correct.`)
    }
    throw error
  }

  if (!response.ok) {
    let message = 'Request failed.'
    try {
      const payload = (await response.json()) as { detail?: string }
      message = payload.detail ?? message
    } catch {
      // Ignore malformed error payloads.
    }
    throw new ApiError(response.status, message)
  }

  return (await response.json()) as T
}

export { API_BASE }
