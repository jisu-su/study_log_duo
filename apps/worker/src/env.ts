export type Env = {
  DB: D1Database
  R2: R2Bucket
  FIREBASE_PROJECT_ID: string
  ALLOWED_EMAILS: string
  CORS_ORIGIN?: string
  PUBLIC_JWK_CACHE_KV?: KVNamespace
  PUBLIC_JWK_CACHE_KEY?: string
  FIREBASE_AUTH_EMULATOR_HOST?: string

  // Notification settings
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
}
