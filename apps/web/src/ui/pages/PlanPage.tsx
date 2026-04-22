import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api'
import { auth } from '../../firebase'
import { getNowKstLogicalDate } from '../../../../../shared/datetime'
import Modal from '../shared/Modal'

type HomeUser = {
  id: string
  email: string
  name: string
  avatar_url: string | null
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

type Plan = {
  user_id: string
  logical_date: string
  condition: number | null
  weather: string | null
  goal: string | null
  updated_at: string | null
}

type HomePayload = {
  logicalDate: string
  users: HomeUser[]
  dayOffs: DayOff[]
  schedules: Schedule[]
  plans: Plan[]
}

type PlanItem = {
  user_id: string
  hour: number
  content: string
  created_at: string
}

const weatherOptions = [
  { value: 'sunny', label: '☀️ sunny' },
  { value: 'cloudy', label: '⛅ cloudy' },
  { value: 'rainy', label: '🌧️ rainy' },
  { value: 'snow', label: '❄️ snow' },
  { value: 'foggy', label: '🌫️ foggy' },
] as const

function buildTimelineHours(dayStartHour = 6): number[] {
  const hours: number[] = []
  for (let h = dayStartHour; h <= 23; h++) hours.push(h)
  for (let h = 0; h < dayStartHour; h++) hours.push(h)
  return hours
}

export default function PlanPage() {
  const [logicalDate, setLogicalDate] = useState(() => getNowKstLogicalDate(6))
  const [users, setUsers] = useState<HomeUser[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [items, setItems] = useState<PlanItem[]>([])
  const [dayOffs, setDayOffs] = useState<DayOff[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myUid = auth?.currentUser?.uid ?? null
  const partnerUid = useMemo(() => {
    if (!myUid) return null
    return users.find((u) => u.id !== myUid)?.id ?? null
  }, [users, myUid])

  const timelineHours = useMemo(() => buildTimelineHours(6), [])

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
    for (const list of map.values()) list.sort((a, b) => a.start_hour - b.start_hour)
    return map
  }, [schedules])

  const itemsByUserHour = useMemo(() => {
    const map = new Map<string, Map<number, PlanItem>>()
    for (const it of items) {
      if (!map.has(it.user_id)) map.set(it.user_id, new Map())
      map.get(it.user_id)!.set(it.hour, it)
    }
    return map
  }, [items])

  const myPlan = useMemo(() => (myUid ? plans.find((p) => p.user_id === myUid) ?? null : null), [plans, myUid])
  const partnerPlan = useMemo(
    () => (partnerUid ? plans.find((p) => p.user_id === partnerUid) ?? null : null),
    [plans, partnerUid],
  )

  const [goal, setGoal] = useState('')
  const [condition, setCondition] = useState<number | null>(3)
  const [weather, setWeather] = useState<string | null>('sunny')

  useEffect(() => {
    if (!myPlan) return
    setGoal(myPlan.goal ?? '')
    setCondition(myPlan.condition ?? null)
    setWeather(myPlan.weather ?? null)
  }, [myPlan?.updated_at])

  async function refresh() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const home = await apiFetch<HomePayload>(`/api/home?logicalDate=${encodeURIComponent(logicalDate)}`)
      setUsers(home.users)
      setPlans(home.plans)
      setDayOffs(home.dayOffs)
      setSchedules(home.schedules)

      const i = await apiFetch<{ logicalDate: string; rows: PlanItem[] }>(
        `/api/plan-items?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setItems(i.rows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load plan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalDate, myUid])

  async function saveMyPlan() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/plans', {
        method: 'PUT',
        body: JSON.stringify({
          logicalDate,
          condition,
          weather,
          goal: goal.trim() || null,
        }),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save plan')
    } finally {
      setLoading(false)
    }
  }

  const [editOpen, setEditOpen] = useState(false)
  const [editHour, setEditHour] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editHadItem, setEditHadItem] = useState(false)

  function scheduleAt(userId: string, hour: number): Schedule | null {
    return (
      (schedulesByUser.get(userId) ?? []).find((s) => s.start_hour <= hour && s.end_hour > hour) ?? null
    )
  }

  function openEdit(hour: number) {
    if (!myUid) return
    if (dayOffByUser.has(myUid)) return
    if (scheduleAt(myUid, hour)) return
    const existing = itemsByUserHour.get(myUid)?.get(hour)
    setEditHour(hour)
    setEditContent(existing?.content ?? '')
    setEditHadItem(Boolean(existing?.content))
    setEditOpen(true)
  }

  async function saveItem() {
    if (!auth?.currentUser || !myUid || editHour == null) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/plan-items', {
        method: 'PUT',
        body: JSON.stringify({
          logicalDate,
          hour: editHour,
          content: editContent.trim(),
        }),
      })
      setEditOpen(false)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save item')
    } finally {
      setLoading(false)
    }
  }

  async function deleteItem() {
    if (!auth?.currentUser || !myUid || editHour == null) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch(
        `/api/plan-items?logicalDate=${encodeURIComponent(logicalDate)}&hour=${encodeURIComponent(String(editHour))}`,
        { method: 'DELETE' },
      )
      setEditOpen(false)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete item')
    } finally {
      setLoading(false)
    }
  }

  const myDayOff = myUid ? dayOffByUser.get(myUid) ?? null : null
  const partnerDayOff = partnerUid ? dayOffByUser.get(partnerUid) ?? null : null

  return (
    <div className="stack">
      <div className="card">
        <div className="homeHeader">
          <div>
            <h2>플랜</h2>
            <div className="muted">logical_date: {logicalDate}</div>
          </div>
          <div className="actions">
            <label className="label" style={{ gap: 4 }}>
              날짜
              <input className="textInput" type="date" value={logicalDate} onChange={(e) => setLogicalDate(e.target.value)} />
            </label>
            <button className="btnSecondary" onClick={() => refresh()} disabled={loading}>
              새로고침
            </button>
          </div>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {!auth?.currentUser ? (
          <div className="muted" style={{ marginTop: 8 }}>
            상단의 Google 로그인 후 사용 가능해.
          </div>
        ) : null}
      </div>

      {(myDayOff || partnerDayOff) && (
        <div className="card">
          <h3>휴무</h3>
          <div className="row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="badgeOff">
              내 휴무{myDayOff?.note ? ` · ${myDayOff.note}` : myDayOff ? '' : ' 아님'}
            </div>
            <div className="badgeOff">
              상대 휴무{partnerDayOff?.note ? ` · ${partnerDayOff.note}` : partnerDayOff ? '' : ' 아님'}
            </div>
          </div>
        </div>
      )}

      <div className="twoCol">
        <div className="card">
          <h3>내 하루 상태</h3>
          <div className="row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="label">
              컨디션(1~5)
              <select
                value={condition ?? ''}
                onChange={(e) => setCondition(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">미설정</option>
                <option value={1}>😴</option>
                <option value={2}>😞</option>
                <option value={3}>😐</option>
                <option value={4}>😊</option>
                <option value={5}>🔥</option>
              </select>
            </label>
            <label className="label">
              날씨
              <select value={weather ?? ''} onChange={(e) => setWeather(e.target.value || null)}>
                <option value="">미설정</option>
                {weatherOptions.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="label" style={{ marginTop: 10 }}>
            오늘 목표 한 줄(50자)
            <input className="textInput" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={50} />
          </label>
          <div className="modalActions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <button className="btn" onClick={saveMyPlan} disabled={loading || !auth?.currentUser}>
              저장
            </button>
          </div>
        </div>

        <div className="card">
          <h3>상대 하루 상태</h3>
          {!partnerPlan ? (
            <div className="muted">상대가 아직 상태를 저장하지 않았어.</div>
          ) : (
            <div className="box">
              <div className="boxRow">
                <div className="boxKey">컨디션</div>
                <div className="boxVal">{partnerPlan.condition ?? '-'}</div>
              </div>
              <div className="boxRow">
                <div className="boxKey">날씨</div>
                <div className="boxVal">{partnerPlan.weather ?? '-'}</div>
              </div>
              <div className="boxRow">
                <div className="boxKey">목표</div>
                <div className="boxVal">{partnerPlan.goal ?? '-'}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>시간별 계획(생선가시)</h3>
        <div className="muted">내 쪽은 클릭해서 입력/수정할 수 있어. (휴무/약속 시간은 입력 불가)</div>

        <div className="fishGrid" style={{ marginTop: 12 }}>
          <div className="fishHead fishLeft">나</div>
          <div className="fishHead fishMid">시간</div>
          <div className="fishHead fishRight">동기</div>

          {timelineHours.map((h) => (
            <FishRow
              key={h}
              hour={h}
              myUid={myUid}
              partnerUid={partnerUid}
              itemsByUserHour={itemsByUserHour}
              dayOffByUser={dayOffByUser}
              schedulesByUser={schedulesByUser}
              onEdit={openEdit}
            />
          ))}
        </div>
      </div>

      <Modal open={editOpen} title={editHour == null ? '계획 입력' : `${editHour}:00 계획 입력`} onClose={() => setEditOpen(false)}>
        <div className="form">
          <label className="label">
            내용(120자)
            <input
              className="textInput"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={120}
              placeholder="예: CS 복습"
            />
          </label>
          <div className="modalActions">
            {editHadItem ? (
              <button className="btnSecondary" onClick={deleteItem} disabled={loading}>
                삭제
              </button>
            ) : null}
            <button className="btnSecondary" onClick={() => setEditOpen(false)} disabled={loading}>
              취소
            </button>
            <button className="btn" onClick={saveItem} disabled={loading || editContent.trim().length === 0}>
              저장
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FishRow(props: {
  hour: number
  myUid: string | null
  partnerUid: string | null
  itemsByUserHour: Map<string, Map<number, PlanItem>>
  dayOffByUser: Map<string, DayOff>
  schedulesByUser: Map<string, Schedule[]>
  onEdit: (hour: number) => void
}) {
  const { hour, myUid, partnerUid, itemsByUserHour, dayOffByUser, schedulesByUser, onEdit } = props
  const myItem = myUid ? itemsByUserHour.get(myUid)?.get(hour) ?? null : null
  const partnerItem = partnerUid ? itemsByUserHour.get(partnerUid)?.get(hour) ?? null : null

  const myDayOff = myUid ? dayOffByUser.get(myUid) ?? null : null
  const partnerDayOff = partnerUid ? dayOffByUser.get(partnerUid) ?? null : null

  const scheduleAt = (uid: string, h: number) =>
    (schedulesByUser.get(uid) ?? []).find((s) => s.start_hour <= h && s.end_hour > h) ?? null

  const mySchedule = myUid ? scheduleAt(myUid, hour) : null
  const partnerSchedule = partnerUid ? scheduleAt(partnerUid, hour) : null

  const myClickable = Boolean(myUid && !myDayOff && !mySchedule)

  return (
    <>
      <div
        className={`fishCell fishLeft ${myClickable ? 'clickable' : ''}`}
        onClick={() => (myClickable ? onEdit(hour) : null)}
        role={myClickable ? 'button' : undefined}
        tabIndex={myClickable ? 0 : -1}
      >
        {myDayOff ? (
          <span className="badgeOff">휴무</span>
        ) : mySchedule ? (
          <span className="badgeSchedule">📅 {mySchedule.title}</span>
        ) : myItem ? (
          <span className="content">{myItem.content}</span>
        ) : (
          <span className="muted"> </span>
        )}
      </div>

      <div className="fishCell fishMid">
        <span className="timeCol">{String(hour).padStart(2, '0')}:00</span>
      </div>

      <div className="fishCell fishRight">
        {partnerDayOff ? (
          <span className="badgeOff">휴무</span>
        ) : partnerSchedule ? (
          <span className="badgeSchedule">📅 {partnerSchedule.title}</span>
        ) : partnerItem ? (
          <span className="content">{partnerItem.content}</span>
        ) : (
          <span className="muted"> </span>
        )}
      </div>
    </>
  )
}

