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
      if (!origin) return configured || '*'

      // Always allow local dev.
      if (origin === 'http://localhost:5173') return origin
      if (origin === 'http://127.0.0.1:5173') return origin

      // In production, lock down to the single configured Pages origin.
      if (configured) return origin === configured ? origin : ''

      // If not configured, fall back to allowing same-origin callers only.
      return ''
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

app.get('/api/reflections', async (c) => {
  const logicalDate = c.req.query('logicalDate')
  if (!logicalDate) return c.json({ error: 'logicalDate is required' }, 400)

  const reflections = await c.env.DB.prepare(
    `SELECT u.id AS user_id, u.name AS user_name, u.avatar_url AS avatar_url,
            r.id AS reflection_id,
            r.emotion_tags AS emotion_tags,
            r.went_well AS went_well,
            r.went_wrong AS went_wrong,
            r.memo AS memo,
            r.updated_at AS updated_at
     FROM users u
     LEFT JOIN reflections r
       ON r.user_id = u.id AND r.logical_date = ?
     ORDER BY u.email ASC`,
  )
    .bind(logicalDate)
    .all()

  const reflectionIds = reflections.results
    .map((r: any) => r.reflection_id as string | null)
    .filter((id: string | null): id is string => Boolean(id))

  let reactions: any[] = []
  if (reflectionIds.length > 0) {
    const placeholders = reflectionIds.map(() => '?').join(',')
    const stmt = c.env.DB.prepare(
      `SELECT reflection_id, user_id, emoji, created_at
       FROM reactions
       WHERE reflection_id IN (${placeholders})`,
    )
    reactions = (await (stmt as any).bind(...reflectionIds).all()).results
  }

  return c.json({ logicalDate, reflections: reflections.results, reactions })
})

app.put('/api/reflections', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const logicalDate = String(body.logicalDate ?? '')
  const emotionTags = Array.isArray(body.emotionTags) ? body.emotionTags : null
  const wentWell = body.wentWell != null ? String(body.wentWell).trim() : null
  const wentWrong = body.wentWrong != null ? String(body.wentWrong).trim() : null
  const memo = body.memo != null ? String(body.memo) : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)) {
    return c.json({ error: 'Invalid logicalDate' }, 400)
  }
  if (wentWell != null && wentWell.length > 800) return c.json({ error: 'wentWell too long' }, 400)
  if (wentWrong != null && wentWrong.length > 800) return c.json({ error: 'wentWrong too long' }, 400)
  if (memo != null && memo.length > 10_000) return c.json({ error: 'memo too long' }, 400)
  if (emotionTags != null) {
    if (emotionTags.length > 12) return c.json({ error: 'Too many emotion tags' }, 400)
    for (const t of emotionTags) {
      if (typeof t !== 'string' || t.length < 1 || t.length > 20) {
        return c.json({ error: 'Invalid emotion tag' }, 400)
      }
    }
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
    `INSERT INTO reflections (id, user_id, logical_date, emotion_tags, went_well, went_wrong, memo, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, logical_date) DO UPDATE SET
       emotion_tags = excluded.emotion_tags,
       went_well = excluded.went_well,
       went_wrong = excluded.went_wrong,
       memo = excluded.memo,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      String(token.uid),
      logicalDate,
      emotionTags ? JSON.stringify(emotionTags) : null,
      wentWell,
      wentWrong,
      memo,
      nowIso,
    )
    .run()

  const row = await c.env.DB.prepare(
    `SELECT id AS reflection_id
     FROM reflections
     WHERE user_id = ? AND logical_date = ?`,
  )
    .bind(String(token.uid), logicalDate)
    .first()

  return c.json({ ok: true, reflectionId: (row as any)?.reflection_id ?? null })
})

app.put('/api/reactions', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const reflectionId = String(body.reflectionId ?? '')
  const emoji = String(body.emoji ?? '')
  const allowed = new Set(['👍', '💪', '❤️'])
  if (!reflectionId) return c.json({ error: 'reflectionId is required' }, 400)
  if (!allowed.has(emoji)) return c.json({ error: 'Invalid emoji' }, 400)

  const exists = await c.env.DB.prepare(
    `SELECT id FROM reflections WHERE id = ?`,
  )
    .bind(reflectionId)
    .first()
  if (!exists) return c.json({ error: 'Reflection not found' }, 404)

  await ensureUser(c.env, {
    uid: String(token.uid),
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })

  await c.env.DB.prepare(
    `INSERT INTO reactions (id, reflection_id, user_id, emoji)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(reflection_id, user_id) DO UPDATE SET
       emoji = excluded.emoji`,
  )
    .bind(crypto.randomUUID(), reflectionId, String(token.uid), emoji)
    .run()

  return c.json({ ok: true })
})

function parseTags(input: any): string | null {
  if (input == null) return null
  if (Array.isArray(input)) {
    const tags = input
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10)
    return tags.length ? JSON.stringify(tags) : null
  }
  if (typeof input === 'string') {
    const tags = input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10)
    return tags.length ? JSON.stringify(tags) : null
  }
  return null
}

function extractOg(html: string): { title?: string; ogImage?: string } {
  const pick = (re: RegExp): string | undefined => {
    const m = html.match(re)
    const v = m?.[1]?.trim()
    return v || undefined
  }

  const ogTitle =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i)

  const ogImage =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i)

  const titleTag = pick(/<title[^>]*>([^<]{1,200})<\/title>/i)
  return { title: ogTitle || titleTag, ogImage }
}

app.get('/api/resources', async (c) => {
  const type = c.req.query('type')
  const q = (c.req.query('q') ?? '').trim()
  const date = c.req.query('date') // YYYY-MM-DD (created_at based)

  const where: string[] = []
  const args: any[] = []

  if (type) {
    where.push('r.type = ?')
    args.push(type)
  }

  if (date) {
    where.push(`date(r.created_at) = ?`)
    args.push(date)
  }

  if (q) {
    where.push(`(r.title LIKE ? OR r.memo LIKE ? OR r.url LIKE ?)`)
    args.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const stmt = c.env.DB.prepare(
    `SELECT r.id, r.user_id, u.name AS user_name, u.avatar_url AS avatar_url,
            r.type, r.title, r.url, r.memo, r.tags, r.is_pinned, r.og_image, r.created_at
     FROM resources r
     JOIN users u ON u.id = r.user_id
     ${whereSql}
     ORDER BY r.is_pinned DESC, r.created_at DESC
     LIMIT 100`,
  )

  const rows = (await (stmt as any).bind(...args).all()).results
  return c.json({ rows })
})

app.post('/api/resources', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)

  const contentType = c.req.header('content-type') || ''
  const userId = String(token.uid)

  await ensureUser(c.env, {
    uid: userId,
    email: String(token.email),
    name: (token as any).name ? String((token as any).name) : undefined,
    picture: token.picture ? String(token.picture) : undefined,
  })

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return c.json({ error: 'file is required' }, 400)
    }
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File too large (max 10MB)' }, 400)
    }

    const title = String(form.get('title') ?? file.name).trim()
    const memo = form.get('memo') != null ? String(form.get('memo')).trim() : null
    const tags = parseTags(form.get('tags'))
    if (!title || title.length > 80) return c.json({ error: 'Invalid title' }, 400)
    if (memo != null && memo.length > 800) return c.json({ error: 'Memo too long' }, 400)

    const id = crypto.randomUUID()
    const safeName = file.name.replace(/[^\w.\-() ]+/g, '_').slice(0, 100) || 'file'
    const key = `${userId}/${id}/${safeName}`

    const buf = await file.arrayBuffer()
    await c.env.R2.put(key, buf, {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
      },
    })

    await c.env.DB.prepare(
      `INSERT INTO resources (id, user_id, type, title, url, memo, tags)
       VALUES (?, ?, 'file', ?, ?, ?, ?)`,
    )
      .bind(id, userId, title, key, memo, tags)
      .run()

    const row = await c.env.DB.prepare(
      `SELECT r.id, r.user_id, u.name AS user_name, u.avatar_url AS avatar_url,
              r.type, r.title, r.url, r.memo, r.tags, r.is_pinned, r.og_image, r.created_at
       FROM resources r JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
    )
      .bind(id)
      .first()

    return c.json({ row })
  }

  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const type = String(body.type ?? '').trim()
  if (!['link', 'memo'].includes(type)) return c.json({ error: 'Invalid type' }, 400)

  const title = String(body.title ?? '').trim()
  const url = body.url != null ? String(body.url).trim() : null
  const memo = body.memo != null ? String(body.memo).trim() : null
  const tags = parseTags(body.tags)

  if (title.length > 80) return c.json({ error: 'Title too long' }, 400)
  if (memo != null && memo.length > 800) return c.json({ error: 'Memo too long' }, 400)

  if (type === 'link') {
    if (!url) return c.json({ error: 'url is required for link' }, 400)
    if (!/^https?:\/\//i.test(url)) return c.json({ error: 'url must start with http(s)://' }, 400)

    const dup = await c.env.DB.prepare(
      `SELECT id, user_id FROM resources WHERE type = 'link' AND url = ? LIMIT 1`,
    )
      .bind(url)
      .first()
    if (dup) return c.json({ error: 'URL already shared', id: (dup as any).id }, 409)
  }

  const id = crypto.randomUUID()

  let finalTitle = title
  let ogImage: string | null = null

  if (type === 'link' && url) {
    if (!finalTitle) finalTitle = url

    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
      clearTimeout(t)
      const ct = res.headers.get('content-type') || ''
      if (res.ok && ct.includes('text/html')) {
        const html = await res.text()
        const og = extractOg(html)
        if (!title && og.title) finalTitle = og.title.slice(0, 80)
        if (og.ogImage) ogImage = og.ogImage.slice(0, 500)
      }
    } catch {
      // best-effort only
    }
  }

  if (!finalTitle || finalTitle.length < 1) return c.json({ error: 'title is required' }, 400)

  await c.env.DB.prepare(
    `INSERT INTO resources (id, user_id, type, title, url, memo, tags, og_image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, type, finalTitle, url, memo, tags, ogImage)
    .run()

  const row = await c.env.DB.prepare(
    `SELECT r.id, r.user_id, u.name AS user_name, u.avatar_url AS avatar_url,
            r.type, r.title, r.url, r.memo, r.tags, r.is_pinned, r.og_image, r.created_at
     FROM resources r JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
  )
    .bind(id)
    .first()

  return c.json({ row })
})

app.patch('/api/resources/:id', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')

  const body = (await c.req.json().catch(() => null)) as any
  if (!body) return c.json({ error: 'Invalid JSON' }, 400)

  const row = await c.env.DB.prepare(
    `SELECT id, user_id, type FROM resources WHERE id = ?`,
  )
    .bind(id)
    .first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  if ((row as any).user_id !== String(token.uid)) return c.json({ error: 'Forbidden' }, 403)

  const title = body.title != null ? String(body.title).trim() : null
  const memo = body.memo != null ? String(body.memo).trim() : null
  const tags = body.tags !== undefined ? parseTags(body.tags) : undefined
  const isPinned = body.isPinned != null ? Number(body.isPinned) : null

  if (title != null && (!title || title.length > 80)) return c.json({ error: 'Invalid title' }, 400)
  if (memo != null && memo.length > 800) return c.json({ error: 'Memo too long' }, 400)
  if (isPinned != null && (isPinned !== 0 && isPinned !== 1)) return c.json({ error: 'Invalid isPinned' }, 400)

  const set: string[] = []
  const args: any[] = []
  if (title != null) {
    set.push('title = ?')
    args.push(title)
  }
  if (memo != null) {
    set.push('memo = ?')
    args.push(memo)
  }
  if (tags !== undefined) {
    set.push('tags = ?')
    args.push(tags)
  }
  if (isPinned != null) {
    set.push('is_pinned = ?')
    args.push(isPinned)
  }

  if (set.length === 0) return c.json({ error: 'No changes' }, 400)

  args.push(id)
  await c.env.DB.prepare(
    `UPDATE resources SET ${set.join(', ')} WHERE id = ?`,
  )
    .bind(...args)
    .run()

  return c.json({ ok: true })
})

app.delete('/api/resources/:id', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')

  const row = await c.env.DB.prepare(
    `SELECT id, user_id, type, url FROM resources WHERE id = ?`,
  )
    .bind(id)
    .first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  if ((row as any).user_id !== String(token.uid)) return c.json({ error: 'Forbidden' }, 403)

  if ((row as any).type === 'file' && (row as any).url) {
    await c.env.R2.delete(String((row as any).url))
  }

  await c.env.DB.prepare(`DELETE FROM resources WHERE id = ?`).bind(id).run()
  return c.json({ ok: true })
})

app.get('/api/resources/:id/file', async (c) => {
  const token = getFirebaseToken(c)
  if (!token?.uid || !token.email) return c.json({ error: 'Unauthorized' }, 401)
  const id = c.req.param('id')

  const row = await c.env.DB.prepare(
    `SELECT type, title, url FROM resources WHERE id = ?`,
  )
    .bind(id)
    .first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  if ((row as any).type !== 'file') return c.json({ error: 'Not a file resource' }, 400)

  const key = String((row as any).url)
  const obj = await c.env.R2.get(key)
  if (!obj) return c.json({ error: 'File missing' }, 404)

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('content-disposition', `attachment; filename="${String((row as any).title).replace(/"/g, '')}"`)
  return new Response(obj.body, { headers })
})

export default app
