import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api'
import { auth, googleProvider, isFirebaseConfigured } from '../../firebase'
import { getNowKstLogicalDate } from '../../../../../shared/datetime'
import Modal from '../shared/Modal'

type TimeLogRow = {
  user_id: string
  user_name: string
  avatar_url: string | null
  hour: number | null
  content: string | null
  tag: string | null
  focus_level: number | null
  updated_at: string | null
}

function buildTimelineHours(dayStartHour = 6): number[] {
  const hours: number[] = []
  for (let h = dayStartHour; h <= 23; h++) hours.push(h)
  for (let h = 0; h < dayStartHour; h++) hours.push(h)
  return hours
}

export default function HomePage() {
  const [logicalDate] = useState(() => getNowKstLogicalDate(6))
  const [rows, setRows] = useState<TimeLogRow[]>([])
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
      const data = await apiFetch<{ logicalDate: string; rows: TimeLogRow[] }>(
        `/api/time-logs?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setRows(data.rows)
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

  const users = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; avatar: string | null }>()
    for (const r of rows) {
      if (!byId.has(r.user_id)) {
        byId.set(r.user_id, {
          id: r.user_id,
          name: r.user_name,
          avatar: r.avatar_url,
        })
      }
    }
    return Array.from(byId.values())
  }, [rows])

  const logsByUserHour = useMemo(() => {
    const map = new Map<string, Map<number, TimeLogRow>>()
    for (const r of rows) {
      if (r.hour == null) continue
      if (!map.has(r.user_id)) map.set(r.user_id, new Map())
      map.get(r.user_id)!.set(r.hour, r)
    }
    return map
  }, [rows])

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
  users: { id: string; name: string; avatar: string | null }[]
  meUid: string | null
  logsByUserHour: Map<string, Map<number, TimeLogRow>>
  onEdit: (hour: number) => void
}) {
  const { hour, users, meUid, logsByUserHour, onEdit } = props
  return (
    <>
      <div className="cell timeCol">{String(hour).padStart(2, '0')}:00</div>
      {users.map((u) => {
        const r = logsByUserHour.get(u.id)?.get(hour)
        const isMe = u.id === meUid
        const clickable = isMe
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
            {r?.content ? (
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
