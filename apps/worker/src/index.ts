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

app.post('/api/me/nickname', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as any
  const nickname = String(body?.nickname ?? '').trim()

  // Rule: set once, 2~12 chars, and only Korean/English/numbers.
  if (nickname.length < 2 || nickname.length > 12) {
    return c.json({ error: 'Nickname must be 2~12 characters.' }, 400)
  }
  if (/[\r\n\t]/.test(nickname)) {
    return c.json({ error: 'Nickname contains invalid characters.' }, 400)
  }
  if (!/^[0-9A-Za-z\u3131-\u318E\uAC00-\uD7A3]+$/.test(nickname)) {
    return c.json({ error: 'Nickname may contain only Korean/English letters and numbers.' }, 400)
  }

  // Ensure user row exists before trying to lock nickname.
  await ensureUser(c.env, {
    uid: String(token.uid),
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })

  const res = await c.env.DB.prepare(
    `UPDATE users
     SET name = ?, name_locked = 1
     WHERE id = ? AND (name_locked IS NULL OR name_locked = 0)`,
  )
    .bind(nickname, String(token.uid))
    .run()

  if ((res.meta?.changes ?? 0) === 0) {
    return c.json({ error: 'Nickname already set.' }, 409)
  }

  const user = await c.env.DB.prepare(
    `SELECT id, email, name, avatar_url, day_start_hour, name_locked
     FROM users WHERE id = ?`,
  )
    .bind(String(token.uid))
    .first()

  return c.json({ user })
})

app.get('/api/home', async (c) => {
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  const users = await c.env.DB.prepare(
    `SELECT id, email, name, avatar_url, day_start_hour, name_locked
     FROM users
     ORDER BY email ASC`,
  ).all()

  const timeLogs = await c.env.DB.prepare(
    `SELECT user_id, hour, content, tag, focus_level, updated_at
     FROM time_logs
     WHERE logical_date = ?`,
  )
    .bind(logicalDate)
    .all()

  const dayOffs = await c.env.DB.prepare(
    `SELECT user_id, note
     FROM day_offs
     WHERE logical_date = ?`,
  )
    .bind(logicalDate)
    .all()

  const schedules = await c.env.DB.prepare(
    `SELECT id, user_id, start_hour, end_hour, title
     FROM schedules
     WHERE logical_date = ?`,
  )
    .bind(logicalDate)
    .all()

  const plans = await c.env.DB.prepare(
    `SELECT user_id, logical_date, condition, weather, goal, updated_at
     FROM plans
     WHERE logical_date = ?`,
  )
    .bind(logicalDate)
    .all()

  return c.json({
    logicalDate,
    users: users.results,
    timeLogs: timeLogs.results,
    dayOffs: dayOffs.results,
    schedules: schedules.results,
    plans: plans.results,
  })
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

app.get('/api/day-offs', async (c) => {
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  const rows = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.name AS user_name, d.note AS note
     FROM users u
     LEFT JOIN day_offs d
       ON d.user_id = u.id AND d.logical_date = ?
     ORDER BY u.email ASC`,
  )
    .bind(logicalDate)
    .all()

  return c.json({ logicalDate, rows: rows.results })
})

app.post('/api/day-offs', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const logicalDate = String(body.logicalDate ?? '')
  const note = body.note != null ? String(body.note).trim() : null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)) {
    return c.json({ error: 'Invalid logicalDate' }, 400)
  }
  if (note != null && note.length > 80) {
    return c.json({ error: 'Note too long' }, 400)
  }

  await ensureUser(c.env, {
    uid: String(token.uid),
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })

  await c.env.DB.prepare(
    `INSERT INTO day_offs (id, user_id, logical_date, note)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, logical_date) DO UPDATE SET
       note = excluded.note`,
  )
    .bind(crypto.randomUUID(), String(token.uid), logicalDate, note)
    .run()

  return c.json({ ok: true })
})

app.delete('/api/day-offs', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  await c.env.DB.prepare(
    `DELETE FROM day_offs WHERE user_id = ? AND logical_date = ?`,
  )
    .bind(String(token.uid), logicalDate)
    .run()

  return c.json({ ok: true })
})

app.get('/api/schedules', async (c) => {
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, u.name AS user_name,
            s.start_hour, s.end_hour, s.title, s.created_at
     FROM schedules s
     JOIN users u ON u.id = s.user_id
     WHERE s.logical_date = ?
     ORDER BY u.email ASC, s.start_hour ASC`,
  )
    .bind(logicalDate)
    .all()

  return c.json({ logicalDate, rows: rows.results })
})

app.post('/api/schedules', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const logicalDate = String(body.logicalDate ?? '')
  const startHour = Number(body.startHour)
  const endHour = Number(body.endHour)
  const title = String(body.title ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)) {
    return c.json({ error: 'Invalid logicalDate' }, 400)
  }
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    return c.json({ error: 'Invalid startHour' }, 400)
  }
  if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
    return c.json({ error: 'Invalid endHour' }, 400)
  }
  if (endHour <= startHour) {
    return c.json({ error: 'endHour must be greater than startHour' }, 400)
  }
  if (!title || title.length > 40) {
    return c.json({ error: 'Invalid title' }, 400)
  }

  await ensureUser(c.env, {
    uid: String(token.uid),
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO schedules (id, user_id, logical_date, start_hour, end_hour, title)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, String(token.uid), logicalDate, startHour, endHour, title)
    .run()

  return c.json({ ok: true, id })
})

app.delete('/api/schedules', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.query('id')
  if (!id) return c.json({ error: 'id is required' }, 400)

  await c.env.DB.prepare(
    `DELETE FROM schedules WHERE id = ? AND user_id = ?`,
  )
    .bind(id, String(token.uid))
    .run()

  return c.json({ ok: true })
})

app.get('/api/plans', async (c) => {
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  const rows = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.name AS user_name,
            p.condition, p.weather, p.goal, p.updated_at
     FROM users u
     LEFT JOIN plans p
       ON p.user_id = u.id AND p.logical_date = ?
     ORDER BY u.email ASC`,
  )
    .bind(logicalDate)
    .all()

  return c.json({ logicalDate, rows: rows.results })
})

app.put('/api/plans', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const logicalDate = String(body.logicalDate ?? '')
  const condition = body.condition != null ? Number(body.condition) : null
  const weather = body.weather != null ? String(body.weather) : null
  const goal = body.goal != null ? String(body.goal).trim() : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)) {
    return c.json({ error: 'Invalid logicalDate' }, 400)
  }
  if (condition != null && (!Number.isInteger(condition) || condition < 1 || condition > 5)) {
    return c.json({ error: 'Invalid condition' }, 400)
  }
  if (goal != null && goal.length > 50) {
    return c.json({ error: 'Goal too long' }, 400)
  }

  const allowedWeather = new Set(['sunny', 'cloudy', 'rainy', 'snow', 'foggy'])
  if (weather != null && !allowedWeather.has(weather)) {
    return c.json({ error: 'Invalid weather' }, 400)
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
    `INSERT INTO plans (id, user_id, logical_date, condition, weather, goal, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, logical_date) DO UPDATE SET
       condition = excluded.condition,
       weather = excluded.weather,
       goal = excluded.goal,
       updated_at = excluded.updated_at`,
  )
    .bind(id, String(token.uid), logicalDate, condition, weather, goal, nowIso)
    .run()

  return c.json({ ok: true })
})

app.get('/api/plan-items', async (c) => {
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  const rows = await c.env.DB.prepare(
    `SELECT user_id, hour, content, created_at
     FROM plan_items
     WHERE logical_date = ?`,
  )
    .bind(logicalDate)
    .all()

  return c.json({ logicalDate, rows: rows.results })
})

app.put('/api/plan-items', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const logicalDate = String(body.logicalDate ?? '')
  const hour = Number(body.hour)
  const content = String(body.content ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)) {
    return c.json({ error: 'Invalid logicalDate' }, 400)
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return c.json({ error: 'Invalid hour' }, 400)
  }
  if (!content || content.length > 120) {
    return c.json({ error: 'Invalid content' }, 400)
  }

  await ensureUser(c.env, {
    uid: String(token.uid),
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })

  await c.env.DB.prepare(
    `INSERT INTO plan_items (id, user_id, logical_date, hour, content)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, logical_date, hour) DO UPDATE SET
       content = excluded.content`,
  )
    .bind(crypto.randomUUID(), String(token.uid), logicalDate, hour, content)
    .run()

  return c.json({ ok: true })
})

app.delete('/api/plan-items', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const logicalDate = c.req.query('logicalDate')
  const hour = Number(c.req.query('hour'))

  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return c.json({ error: 'Invalid hour' }, 400)
  }

  await c.env.DB.prepare(
    `DELETE FROM plan_items WHERE user_id = ? AND logical_date = ? AND hour = ?`,
  )
    .bind(String(token.uid), logicalDate, hour)
    .run()

  return c.json({ ok: true })
})

export default app
