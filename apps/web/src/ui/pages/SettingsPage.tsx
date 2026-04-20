import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api'
import { auth } from '../../firebase'
import { getNowKstLogicalDate } from '../../../../../shared/datetime'

type DayOffRow = {
  user_id: string
  user_name: string
  note: string | null
}

type ScheduleRow = {
  id: string
  user_id: string
  user_name: string
  start_hour: number
  end_hour: number
  title: string
  created_at: string
}

function hourOptions() {
  const opts: number[] = []
  for (let i = 0; i <= 24; i++) opts.push(i)
  return opts
}

export default function SettingsPage() {
  const [logicalDate, setLogicalDate] = useState(() => getNowKstLogicalDate(6))
  const [dayOffRows, setDayOffRows] = useState<DayOffRow[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dayOffNote, setDayOffNote] = useState('')
  const [scheduleTitle, setScheduleTitle] = useState('')
  const [scheduleStart, setScheduleStart] = useState(14)
  const [scheduleEnd, setScheduleEnd] = useState(16)

  const myUid = auth.currentUser?.uid ?? null
  const myDayOff = useMemo(
    () => (myUid ? dayOffRows.find((r) => r.user_id === myUid) : null),
    [dayOffRows, myUid],
  )

  async function refresh() {
    if (!auth.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const dayOffData = await apiFetch<{ logicalDate: string; rows: DayOffRow[] }>(
        `/api/day-offs?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setDayOffRows(dayOffData.rows)

      const scheduleData = await apiFetch<{ logicalDate: string; rows: ScheduleRow[] }>(
        `/api/schedules?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setScheduleRows(scheduleData.rows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalDate, myUid])

  useEffect(() => {
    if (myDayOff?.note != null) setDayOffNote(myDayOff.note)
  }, [myDayOff?.note])

  async function setMyDayOff(enabled: boolean) {
    if (!auth.currentUser) return
    setLoading(true)
    setError(null)
    try {
      if (enabled) {
        await apiFetch('/api/day-offs', {
          method: 'POST',
          body: JSON.stringify({ logicalDate, note: dayOffNote.trim() || null }),
        })
      } else {
        await apiFetch(`/api/day-offs?logicalDate=${encodeURIComponent(logicalDate)}`, {
          method: 'DELETE',
        })
      }
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update day off')
    } finally {
      setLoading(false)
    }
  }

  async function addSchedule() {
    if (!auth.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          logicalDate,
          startHour: scheduleStart,
          endHour: scheduleEnd,
          title: scheduleTitle.trim(),
        }),
      })
      setScheduleTitle('')
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add schedule')
    } finally {
      setLoading(false)
    }
  }

  async function deleteSchedule(id: string) {
    if (!auth.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/schedules?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete schedule')
    } finally {
      setLoading(false)
    }
  }

  const canAddSchedule =
    scheduleTitle.trim().length > 0 &&
    Number.isInteger(scheduleStart) &&
    Number.isInteger(scheduleEnd) &&
    scheduleEnd > scheduleStart

  return (
    <div className="stack">
      <div className="card">
        <div className="homeHeader">
          <div>
            <h2>설정</h2>
            <div className="muted">logical_date 기준으로 휴무/약속을 관리해.</div>
          </div>
          <div className="actions">
            <label className="label" style={{ gap: 4 }}>
              날짜
              <input
                className="textInput"
                type="date"
                value={logicalDate}
                onChange={(e) => setLogicalDate(e.target.value)}
              />
            </label>
            <button className="btnSecondary" onClick={() => refresh()} disabled={loading}>
              새로고침
            </button>
          </div>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </div>

      <div className="card">
        <h3>휴무</h3>
        <div className="muted">휴무면 홈 타임라인에서 하루 종일 “휴무”로 표시돼.</div>
        <div style={{ marginTop: 10 }} className="row">
          <label className="label">
            휴무 메모 (선택)
            <input
              className="textInput"
              value={dayOffNote}
              onChange={(e) => setDayOffNote(e.target.value)}
              maxLength={80}
              placeholder="예: 여행, 병원"
            />
          </label>
          <div className="modalActions" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn"
              onClick={() => setMyDayOff(true)}
              disabled={loading || !auth.currentUser}
            >
              내 휴무로 설정
            </button>
            <button
              className="btnSecondary"
              onClick={() => setMyDayOff(false)}
              disabled={loading || !auth.currentUser}
            >
              내 휴무 해제
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>약속</h3>
        <div className="muted">해당 시간대는 홈에서 “📅 약속”으로 표시되고 로그 입력이 막혀.</div>

        <div style={{ marginTop: 10 }} className="row">
          <label className="label">
            제목
            <input
              className="textInput"
              value={scheduleTitle}
              onChange={(e) => setScheduleTitle(e.target.value)}
              maxLength={40}
              placeholder="예: 친구 약속"
            />
          </label>
          <div className="row">
            <label className="label">
              시작
              <select
                value={scheduleStart}
                onChange={(e) => setScheduleStart(Number(e.target.value))}
              >
                {hourOptions().slice(0, 24).map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              종료(Exclusive)
              <select value={scheduleEnd} onChange={(e) => setScheduleEnd(Number(e.target.value))}>
                {hourOptions().slice(1).map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="modalActions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" onClick={addSchedule} disabled={loading || !canAddSchedule}>
              약속 추가
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          {scheduleRows.length === 0 ? (
            <div className="muted">등록된 약속이 없어.</div>
          ) : (
            <div className="list">
              {scheduleRows.map((s) => (
                <div key={s.id} className="listRow">
                  <div className="listMain">
                    <div className="content">{s.title}</div>
                    <div className="muted">
                      {s.user_name} · {s.start_hour}:00 ~ {s.end_hour}:00
                    </div>
                  </div>
                  {s.user_id === myUid ? (
                    <button className="btnSecondary" onClick={() => deleteSchedule(s.id)}>
                      삭제
                    </button>
                  ) : (
                    <div className="muted">읽기 전용</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
