import { auth } from './firebase'

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const user = auth.currentUser
  const token = user ? await user.getIdToken() : null

  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers })
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

