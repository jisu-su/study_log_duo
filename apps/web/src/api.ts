import { auth } from './firebase'

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  const base = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined
  if (!base) return input

  if (typeof input !== 'string') return input

  const trimmedBase = base.replace(/\/+$/, '')
  if (!input.startsWith('/')) return input
  return `${trimmedBase}${input}`
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const user = auth.currentUser
  const token = user ? await user.getIdToken() : null

  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
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
