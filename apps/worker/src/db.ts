import type { Env } from './env'

export type FirebaseToken = {
  uid: string
  email: string
  name?: string
  picture?: string
}

export async function ensureUser(env: Env, token: FirebaseToken) {
  const name = token.name?.trim() || token.email.split('@')[0] || 'User'

  await env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar_url)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       avatar_url = excluded.avatar_url`,
  )
    .bind(token.uid, token.email, name, token.picture ?? null)
    .run()

  return env.DB.prepare(
    `SELECT id, email, name, avatar_url, day_start_hour, name_locked
     FROM users WHERE id = ?`,
  )
    .bind(token.uid)
    .first()
}
