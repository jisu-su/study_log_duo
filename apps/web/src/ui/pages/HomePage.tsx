import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api'
import { auth, googleProvider, isFirebaseConfigured } from '../../firebase'
import { getNowKstLogicalDate } from '../../../../../shared/datetime'
import Modal from '../shared/Modal'

type HomeUser = {
  id: string
  name: string
  avatar_url: string | null
  email: string
}

type TimeLog = {
  user_id: string
  hour: number
  content: string
  tag: string | null
  focus_level: number | null
  updated_at: string | null
}

type DayOff = {
  user_id: string
  note: string | null
}

type Schedule = {
  id: string
  user_id: string
  start_hour: number
  end_hour: number
  title: string
}

type HomePayload = {
  logicalDate: string
  users: HomeUser[]
  timeLogs: TimeLog[]
  dayOffs: DayOff[]
  schedules: Schedule[]
}

function buildTimelineHours(dayStartHour = 6): number[] {
  const hours: number[] = []
  for (let h = dayStartHour; h <= 23; h++) hours.push(h)
  for (let h = 0; h < dayStartHour; h++) hours.push(h)
  return hours
}

export default function HomePage() {
  const [logicalDate] = useState(() => getNowKstLogicalDate(6))
  const [users, setUsers] = useState<HomeUser[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [dayOffs, setDayOffs] = useState<DayOff[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [meUid, setMeUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editHour, setEditHour] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTag, setEditTag] = useState<string>('study')
  const [editFocus, setEditFocus] = useState<number>(2)

  const timelineHours = useMemo(() => buildTimelineHours(6), [])

  useEffect(() => {
    if (!isFirebaseConfigured()) return
    return onAuthStateChanged(auth, (user) => {
      setMeUid(user?.uid ?? null)
    })
  }, [])

  async function refresh() {
    if (!auth.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch<{ user: any }>('/api/me')
      const data = await apiFetch<HomePayload>(
        `/api/home?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setUsers(data.users)
      setTimeLogs(data.timeLogs)
      setDayOffs(data.dayOffs)
      setSchedules(data.schedules)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meUid])

  const logsByUserHour = useMemo(() => {
    const map = new Map<string, Map<number, TimeLog>>()
    for (const r of timeLogs) {
      if (!map.has(r.user_id)) map.set(r.user_id, new Map())
      map.get(r.user_id)!.set(r.hour, r)
    }
    return map
  }, [timeLogs])

  const dayOffByUser = useMemo(() => {
    const map = new Map<string, DayOff>()
    for (const d of dayOffs) map.set(d.user_id, d)
    return map
  }, [dayOffs])

  const schedulesByUser = useMemo(() => {
    const map = new Map<string, Schedule[]>()
    for (const s of schedules) {
      if (!map.has(s.user_id)) map.set(s.user_id, [])
      map.get(s.user_id)!.push(s)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_hour - b.start_hour)
    }
    return map
  }, [schedules])

  function openEdit(hour: number) {
    setEditHour(hour)
    const mine = meUid ? logsByUserHour.get(meUid)?.get(hour) : undefined
    setEditContent(mine?.content ?? '')
    setEditTag(mine?.tag ?? 'study')
    setEditFocus(mine?.focus_level ?? 2)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (editHour == null) return
    await apiFetch('/api/time-logs', {
      method: 'POST',
      body: JSON.stringify({
        logicalDate,
        hour: editHour,
        content: editContent,
        tag: editTag,
        focusLevel: editFocus,
      }),
    })
    setEditOpen(false)
    await refresh()
  }

  if (!isFirebaseConfigured()) {
    return (
      <div className="card">
        <h2>홈</h2>
        <p>Firebase 설정이 비어있어요. `apps/web/.env.local`을 채운 뒤 다시 실행해줘.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="homeHeader">
          <div>
            <h2>홈</h2>
            <div className="muted">logical_date: {logicalDate}</div>
          </div>
          <div className="actions">
            {auth.currentUser ? (
              <>
                <button className="btn" onClick={() => refresh()} disabled={loading}>
                  새로고침
                </button>
                <button className="btnSecondary" onClick={() => signOut(auth)}>
                  로그아웃
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => signInWithPopup(auth, googleProvider)}>
                Google로 로그인
              </button>
            )}
          </div>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </div>

      <div className="timeline card">
        <div className="grid">
          <div className="cell head timeCol">시간</div>
          {users.map((u) => (
            <div key={u.id} className="cell head">
              <div className="userHead">
                <div className="avatar">{u.name.slice(0, 1)}</div>
                <div className="name">{u.name}</div>
                {u.id === meUid ? <div className="me">ME</div> : null}
              </div>
            </div>
          ))}

          {timelineHours.map((h) => (
            <Row
              key={h}
              hour={h}
              users={users}
              meUid={meUid}
              logsByUserHour={logsByUserHour}
              dayOffByUser={dayOffByUser}
              schedulesByUser={schedulesByUser}
              onEdit={openEdit}
            />
          ))}
        </div>
      </div>

      <Modal
        open={editOpen}
        title={editHour == null ? '로그 입력' : `${editHour}:00 로그 입력`}
        onClose={() => setEditOpen(false)}
      >
        <div className="form">
          <label className="label">
            작업 요약 (최대 200자)
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={200}
              rows={4}
            />
          </label>

          <div className="row">
            <label className="label">
              태그
              <select value={editTag} onChange={(e) => setEditTag(e.target.value)}>
                <option value="study">학습</option>
                <option value="coding">코딩</option>
                <option value="meeting">회의</option>
                <option value="rest">휴식</option>
                <option value="etc">기타</option>
              </select>
            </label>

            <label className="label">
              집중도
              <select
                value={editFocus}
                onChange={(e) => setEditFocus(Number(e.target.value))}
              >
                <option value={1}>낮음</option>
                <option value={2}>보통</option>
                <option value={3}>높음</option>
              </select>
            </label>
          </div>

          <div className="modalActions">
            <button className="btnSecondary" onClick={() => setEditOpen(false)}>
              취소
            </button>
            <button className="btn" onClick={saveEdit} disabled={!editContent.trim()}>
              저장
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Row(props: {
  hour: number
  users: HomeUser[]
  meUid: string | null
  logsByUserHour: Map<string, Map<number, TimeLog>>
  dayOffByUser: Map<string, DayOff>
  schedulesByUser: Map<string, Schedule[]>
  onEdit: (hour: number) => void
}) {
  const { hour, users, meUid, logsByUserHour, dayOffByUser, schedulesByUser, onEdit } = props
  return (
    <>
      <div className="cell timeCol">{String(hour).padStart(2, '0')}:00</div>
      {users.map((u) => {
        const r = logsByUserHour.get(u.id)?.get(hour)
        const isDayOff = dayOffByUser.has(u.id)
        const schedule = isDayOff
          ? null
          : (schedulesByUser.get(u.id) ?? []).find(
              (s) => s.start_hour <= hour && s.end_hour > hour,
            ) ?? null
        const isMe = u.id === meUid
        const clickable = isMe && !isDayOff && !schedule
        return (
          <div
            key={`${u.id}-${hour}`}
            className={`cell logCell ${r?.content ? 'has' : 'empty'} ${
              clickable ? 'clickable' : ''
            }`}
            onClick={() => (clickable ? onEdit(hour) : null)}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : -1}
          >
            {isDayOff ? (
              <div className="badgeOff">휴무</div>
            ) : schedule ? (
              <div className="badgeSchedule">📅 {schedule.title}</div>
            ) : r?.content ? (
              <>
                <div className="content">{r.content}</div>
                <div className="meta">
                  <span className="pill">{r.tag ?? 'study'}</span>
                  <span className="pill">focus {r.focus_level ?? 2}</span>
                </div>
              </>
            ) : (
              <div className="muted">{isMe ? '클릭해서 입력' : ''}</div>
            )}
          </div>
        )
      })}
    </>
  )
}
