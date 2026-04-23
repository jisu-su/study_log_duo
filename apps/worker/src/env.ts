export type Env = {
  DB: D1Database
  R2: R2Bucket
  FIREBASE_PROJECT_ID: string
  ALLOWED_EMAILS: string
  CORS_ORIGIN?: string

  // Notification settings
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
}

