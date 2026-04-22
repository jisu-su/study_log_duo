import { auth } from './firebase'

export function getApiBaseUrl(): string | null {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!base) return null
  return base.replace(/\/+$/, '')
}

export function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  const base = getApiBaseUrl()
  if (!base) return input

  if (typeof input !== 'string') return input

  if (!input.startsWith('/')) return input
  return `${base}${input}`
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const user = auth?.currentUser ?? null
  const token = user ? await user.getIdToken() : null

  const headers = new Headers(init?.headers)
  const body = init?.body as any
  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(resolveApiUrl(input), { ...init, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export type MeUser = {
  id: string
  email: string
  name: string
  avatar_url: string | null
  day_start_hour: number
  name_locked?: number | null
}
