import { auth } from './firebase'

export function getApiBaseUrl(): string | null {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;

  // 상황별 로그 출력
  if (!base) {
    console.warn('⚠️ [API] VITE_API_BASE_URL 이 설정되지 않았습니다.');
    return null;
  }

  const cleanBase = base.replace(/\/+$/, '');
  console.log('🚀 [API] Base URL:', cleanBase);
  return cleanBase;
}

export function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  const base = getApiBaseUrl();

  // 배포된 환경인데 주소가 없으면 강제로 알림을 띄웁니다.
  if (import.meta.env.PROD && !base && typeof input === 'string' && input.startsWith('/api/')) {
    alert('환경변수가 없습니다! Pages 대시보드 설정을 확인하고 다시 배포하세요.');
  }

  if (!base) return input;
  if (typeof input !== 'string') return input;
  if (!input.startsWith('/')) return input;

  const finalUrl = `${base}${input}`;
  console.log(`🔗 [Request] ${input} -> ${finalUrl}`);
  return finalUrl;
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  if (import.meta.env.PROD && typeof input === 'string' && input.startsWith('/api/')) {
    const base = getApiBaseUrl()
    if (!base) {
      throw new Error(
        'Missing VITE_API_BASE_URL in Pages env vars. Without it, /api/* calls hit Pages and return Not Implemented.',
      )
    }
  }

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
