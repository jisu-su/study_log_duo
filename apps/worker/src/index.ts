import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getFirebaseToken, verifyFirebaseAuth } from '@hono/firebase-auth'
import type { Env } from './env'
import { ensureUser } from './db'

type AppBindings = { Bindings: Env }

const app = new Hono<AppBindings>()

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const configured = c.env.CORS_ORIGIN?.trim()
      if (configured) return configured
      if (!origin) return '*'
      if (origin === 'http://localhost:5173') return origin
      if (origin === 'http://127.0.0.1:5173') return origin
      return origin
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

app.get('/api/health', (c) => c.json({ ok: true, service: 'duoingsu' }))

app.use('/api/*', (c, next) => {
  if (c.req.path === '/api/health') return next()
  return verifyFirebaseAuth({ projectId: c.env.FIREBASE_PROJECT_ID })(c, next)
})

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()

  const token = getFirebaseToken(c)
  const allowed = c.env.ALLOWED_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const email = String(token?.email ?? '').toLowerCase()
  if (!allowed.includes(email)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

app.get('/api/me', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const user = await ensureUser(c.env, {
    uid: String(token.uid),
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })
  return c.json({ user })
})

app.get('/api/time-logs', async (c) => {
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  const rows = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.name AS user_name, u.avatar_url AS avatar_url,
            t.hour AS hour, t.content AS content, t.tag AS tag, t.focus_level AS focus_level,
            t.updated_at AS updated_at
     FROM users u
     LEFT JOIN time_logs t
       ON t.user_id = u.id AND t.logical_date = ?
     ORDER BY u.email ASC, t.hour ASC`,
  )
    .bind(logicalDate)
    .all()

  return c.json({ logicalDate, rows: rows.results })
})

app.post('/api/time-logs', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const logicalDate = String(body.logicalDate ?? '')
  const hour = Number(body.hour)
  const content = String(body.content ?? '').trim()
  const tag = body.tag != null ? String(body.tag) : null
  const focusLevel = body.focusLevel != null ? Number(body.focusLevel) : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)) {
    return c.json({ error: 'Invalid logicalDate' }, 400)
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return c.json({ error: 'Invalid hour' }, 400)
  }
  if (!content || content.length > 200) {
    return c.json({ error: 'Invalid content' }, 400)
  }
  if (
    focusLevel != null &&
    (!Number.isInteger(focusLevel) || focusLevel < 1 || focusLevel > 3)
  ) {
    return c.json({ error: 'Invalid focusLevel' }, 400)
  }

  await ensureUser(c.env, {
    uid: String(token.uid),
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })

  const id = crypto.randomUUID()
  const nowIso = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO time_logs (id, user_id, logged_at, logical_date, hour, content, tag, focus_level, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, logical_date, hour) DO UPDATE SET
       content = excluded.content,
       tag = excluded.tag,
       focus_level = excluded.focus_level,
       logged_at = excluded.logged_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      String(token.uid),
      nowIso,
      logicalDate,
      hour,
      content,
      tag,
      focusLevel,
      nowIso,
    )
    .run()

  return c.json({ ok: true })
})

app.delete('/api/time-logs', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const logicalDate = c.req.query('logicalDate')
  const hour = Number(c.req.query('hour'))

  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return c.json({ error: 'Invalid hour' }, 400)
  }

  await c.env.DB.prepare(
    `DELETE FROM time_logs WHERE user_id = ? AND logical_date = ? AND hour = ?`,
  )
    .bind(String(token.uid), logicalDate, hour)
    .run()

  return c.json({ ok: true })
})

export default app
