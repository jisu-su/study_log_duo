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
  const todayLogicalDate = getNowKstLogicalDate(6)
  const [dayOffDate, setDayOffDate] = useState(() => todayLogicalDate)
  const [scheduleDate, setScheduleDate] = useState(() => todayLogicalDate)
  const [dayOffRows, setDayOffRows] = useState<DayOffRow[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dayOffNote, setDayOffNote] = useState('')
  const [scheduleTitle, setScheduleTitle] = useState('')
  const [scheduleStart, setScheduleStart] = useState(14)
  const [scheduleEnd, setScheduleEnd] = useState(16)

  const myUid = auth?.currentUser?.uid ?? null
  const myDayOff = useMemo(
    () => (myUid ? dayOffRows.find((r) => r.user_id === myUid) : null),
    [dayOffRows, myUid],
  )

  async function refreshDayOffs() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const dayOffData = await apiFetch<{ logicalDate: string; rows: DayOffRow[] }>(
        `/api/day-offs?logicalDate=${encodeURIComponent(dayOffDate)}`,
      )
      setDayOffRows(dayOffData.rows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load day offs')
    } finally {
      setLoading(false)
    }
  }

  async function refreshSchedules() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const scheduleData = await apiFetch<{ logicalDate: string; rows: ScheduleRow[] }>(
        `/api/schedules?logicalDate=${encodeURIComponent(scheduleDate)}`,
      )
      setScheduleRows(scheduleData.rows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshDayOffs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOffDate, myUid])

  useEffect(() => {
    refreshSchedules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleDate, myUid])

  useEffect(() => {
    setDayOffNote(myDayOff?.note ?? '')
  }, [myDayOff?.note, dayOffDate])

  async function setMyDayOff(enabled: boolean) {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      if (enabled) {
        await apiFetch('/api/day-offs', {
          method: 'POST',
          body: JSON.stringify({ logicalDate: dayOffDate, note: dayOffNote.trim() || null }),
        })
      } else {
        await apiFetch(`/api/day-offs?logicalDate=${encodeURIComponent(dayOffDate)}`, {
          method: 'DELETE',
        })
      }
      await refreshDayOffs()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update day off')
    } finally {
      setLoading(false)
    }
  }

  async function addSchedule() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          logicalDate: scheduleDate,
          startHour: scheduleStart,
          endHour: scheduleEnd,
          title: scheduleTitle.trim(),
        }),
      })
      setScheduleTitle('')
      await refreshSchedules()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add schedule')
    } finally {
      setLoading(false)
    }
  }

  async function deleteSchedule(id: string) {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/schedules?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      await refreshSchedules()
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
            <div className="muted">휴무와 약속은 각각 날짜를 따로 골라 관리합니다.</div>
          </div>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </div>

      <div className="card">
        <div className="homeHeader">
          <div>
            <h3>휴무</h3>
            <div className="muted">휴무면 홈 타임라인에서 하루 종일 “휴무”로 표시됩니다.</div>
          </div>
          <div className="actions">
            <label className="label" style={{ gap: 4 }}>
              휴무 날짜
              <input
                className="textInput"
                type="date"
                value={dayOffDate}
                onChange={(e) => {
                  setDayOffDate(e.target.value)
                  setDayOffNote('')
                }}
              />
            </label>
            <button className="btnSecondary" onClick={() => refreshDayOffs()} disabled={loading}>
              새로고침
            </button>
          </div>
        </div>
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
              disabled={loading || !auth?.currentUser}
            >
              내 휴무로 설정
            </button>
            <button
              className="btnSecondary"
              onClick={() => setMyDayOff(false)}
              disabled={loading || !auth?.currentUser}
            >
              내 휴무 해제
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="homeHeader">
          <div>
            <h3>약속</h3>
            <div className="muted">해당 시간대는 홈에서 “📅 약속”으로 표시되고 로그 입력이 막힙니다.</div>
          </div>
          <div className="actions">
            <label className="label" style={{ gap: 4 }}>
              약속 날짜
              <input
                className="textInput"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </label>
            <button className="btnSecondary" onClick={() => refreshSchedules()} disabled={loading}>
              새로고침
            </button>
          </div>
        </div>

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
            <div className="muted">등록된 약속이 없습니다.</div>
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
      <div className="card">
        <h3>알림 설정</h3>
        <div className="muted">
          정시마다 로그 기록이 없으면 알림을 보냅니다. (PWA 홈 화면 추가 필수)
        </div>
        <div className="modalActions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          <button
            className="btn"
            onClick={subscribePush}
            disabled={loading || !auth?.currentUser}
          >
            이 기기에서 푸시 알림 받기
          </button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          iOS 사용자는 반드시 <strong>Safari</strong>의 [홈 화면에 추가] 기능을 사용해야 알림을 받을 수 있습니다.
        </div>
      </div>
    </div>
  )
}

async function subscribePush() {
  if (!('serviceWorker' in navigator)) {
    return alert('Service Worker를 지원하지 않는 브라우저입니다.')
  }
  
  try {
    await navigator.serviceWorker.register('/sw.js')
    const registration = await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      alert('알림 권한이 거부되었습니다. 브라우저 설정에서 알림 권한을 허용해주세요.')
      return
    }

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      alert('VITE_VAPID_PUBLIC_KEY 환경변수가 설정되지 않았습니다.')
      return
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      })
    }

    await apiFetch('/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription })
    })

    alert('알림 구독이 완료되었습니다.')
  } catch (e: any) {
    console.error('Push Subscribe Error:', e)
    alert(`구독 실패: ${e.message}`)
  }
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray.buffer
}
