import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api'
import { auth } from '../../firebase'
import { getNowKstLogicalDate } from '../../../../../shared/datetime'

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

type TimeLog = {
  user_id: string
  hour: number
  content: string
  tag: string | null
  focus_level: number | null
  updated_at: string | null
}

type PlanItem = {
  user_id: string
  hour: number
  content: string
  created_at: string
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

export default function DashboardPage() {
  const [logicalDate, setLogicalDate] = useState(() => getNowKstLogicalDate(6))
  const [users, setUsers] = useState<HomeUser[]>([])
  const [items, setItems] = useState<PlanItem[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [dayOffs, setDayOffs] = useState<DayOff[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myUid = auth?.currentUser?.uid ?? null
  const displayUsers = useMemo(() => {
    const base = [...users]
    if (base.length === 0) {
      return [
        { id: '__placeholder_a', name: '(상대방 로그인 대기)', avatar_url: null, email: '' },
        { id: '__placeholder_b', name: '(상대방 로그인 대기)', avatar_url: null, email: '' },
      ]
    }
    if (base.length === 1) {
      base.push({ id: '__placeholder_b', name: '(상대 로그인 대기)', avatar_url: null, email: '' })
    }
    return base.slice(0, 2)
  }, [users])

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

  const logsByUserHour = useMemo(() => {
    const map = new Map<string, Map<number, TimeLog>>()
    for (const log of timeLogs) {
      if (!map.has(log.user_id)) map.set(log.user_id, new Map())
      map.get(log.user_id)!.set(log.hour, log)
    }
    return map
  }, [timeLogs])

  async function refresh() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const home = await apiFetch<HomePayload>(`/api/home?logicalDate=${encodeURIComponent(logicalDate)}`)
      setUsers(home.users)
      setTimeLogs(home.timeLogs)
      setDayOffs(home.dayOffs)
      setSchedules(home.schedules)

      const i = await apiFetch<{ logicalDate: string; rows: PlanItem[] }>(
        `/api/plan-items?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setItems(i.rows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalDate, myUid])

  return (
    <div className="stack">
      <div className="card">
        <div className="homeHeader">
          <div>
            <h2>대시보드</h2>
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
      </div>

      <div className="card">
        <h3>계획 vs 실적</h3>
        <div className="muted">시간대별로 계획과 실제 홈 로그를 함께 확인할 수 있습니다.</div>

        <div className="compareGrid" style={{ marginTop: 12 }}>
          <div className="compareHead compareTime">시간</div>
          <div className="compareHead">
            <UserColumnTitle
              user={displayUsers[0]}
              meUid={myUid}
              dayOff={dayOffByUser.get(displayUsers[0]?.id ?? '')}
            />
          </div>
          <div className="compareHead">
            <UserColumnTitle
              user={displayUsers[1]}
              meUid={myUid}
              dayOff={dayOffByUser.get(displayUsers[1]?.id ?? '')}
            />
          </div>

          {timelineHours.map((h) => (
            <CompareRow
              key={h}
              hour={h}
              users={displayUsers}
              itemsByUserHour={itemsByUserHour}
              logsByUserHour={logsByUserHour}
              dayOffByUser={dayOffByUser}
              schedulesByUser={schedulesByUser}
            />
          ))}
        </div>
      </div>
      
      {/* 추후 통계 섹션을 여기에 추가할 수 있습니다. */}
    </div>
  )
}

function CompareRow(props: {
  hour: number
  users: HomeUser[]
  itemsByUserHour: Map<string, Map<number, PlanItem>>
  logsByUserHour: Map<string, Map<number, TimeLog>>
  dayOffByUser: Map<string, DayOff>
  schedulesByUser: Map<string, Schedule[]>
}) {
  const { hour, users, itemsByUserHour, logsByUserHour, dayOffByUser, schedulesByUser } = props

  return (
    <>
      <div className="compareCell compareTime">
        <span className="timeCol">{String(hour).padStart(2, '0')}:00</span>
      </div>
      {users.slice(0, 2).map((user) => (
        <CompareCell
          key={`${user.id}-${hour}`}
          hour={hour}
          user={user}
          planItem={itemsByUserHour.get(user.id)?.get(hour) ?? null}
          timeLog={logsByUserHour.get(user.id)?.get(hour) ?? null}
          dayOff={dayOffByUser.get(user.id) ?? null}
          schedule={(schedulesByUser.get(user.id) ?? []).find((s) => s.start_hour <= hour && s.end_hour > hour) ?? null}
        />
      ))}
    </>
  )
}

function CompareCell(props: {
  hour: number
  user: HomeUser
  planItem: PlanItem | null
  timeLog: TimeLog | null
  dayOff: DayOff | null
  schedule: Schedule | null
}) {
  const { user, planItem, timeLog, dayOff, schedule } = props
  const isPlaceholder = user.id.startsWith('__placeholder_')

  if (isPlaceholder) {
    return <div className="compareCell muted">상대방 로그인을 기다리고 있습니다.</div>
  }

  if (dayOff) {
    return (
      <div className="compareCell compareMuted">
        <span className="badgeOff">휴무{dayOff.note ? ` · ${dayOff.note}` : ''}</span>
      </div>
    )
  }

  if (schedule) {
    return (
      <div className="compareCell compareMuted">
        <span className="badgeSchedule">📅 {schedule.title}</span>
      </div>
    )
  }

  const status = getCompareStatus(planItem, timeLog)

  return (
    <div className={`compareCell ${status.className}`}>
      <div className="compareStatus">{status.label}</div>
      <div className="comparePair">
        <div className="compareKey">계획</div>
        <div className="compareVal">{planItem?.content || '-'}</div>
      </div>
      <div className="comparePair">
        <div className="compareKey">실적</div>
        <div className="compareVal">{timeLog?.content || '-'}</div>
      </div>
    </div>
  )
}

function getCompareStatus(planItem: PlanItem | null, timeLog: TimeLog | null): {
  label: string
  className: string
} {
  if (planItem && timeLog) return { label: '계획/실적 있음', className: 'compareDone' }
  if (planItem && !timeLog) return { label: '실적 대기', className: 'comparePlanned' }
  if (!planItem && timeLog) return { label: '계획 외 실적', className: 'compareActualOnly' }
  return { label: '비어 있음', className: 'compareEmpty' }
}

function UserColumnTitle(props: {
  user: HomeUser | undefined
  meUid: string | null
  dayOff: DayOff | undefined
}) {
  const { user, meUid, dayOff } = props
  if (!user) return <span>대기</span>
  const isPlaceholder = user.id.startsWith('__placeholder_')
  const name = isPlaceholder ? user.name : `${user.name}${user.id === meUid ? ' (나)' : ''}`
  const offBadge = dayOff ? (
    <span className="miniOffBadge">
      휴무{dayOff.note ? ` · ${dayOff.note}` : ''}
    </span>
  ) : null

  return (
    <span className="columnTitle">
      <span>{name}</span>
      {offBadge}
    </span>
  )
}
