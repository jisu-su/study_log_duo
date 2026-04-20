import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api'
import { auth } from '../../firebase'
import { getNowKstLogicalDate } from '../../../../../shared/datetime'

type PlanRow = {
  user_id: string
  user_name: string
  condition: number | null
  weather: string | null
  goal: string | null
  updated_at: string | null
}

type PlanItem = {
  user_id: string
  hour: number
  content: string
  created_at: string
}

const weatherOptions = [
  { value: 'sunny', label: '☀️' },
  { value: 'cloudy', label: '⛅' },
  { value: 'rainy', label: '🌧️' },
  { value: 'snow', label: '❄️' },
  { value: 'foggy', label: '🌫️' },
] as const

export default function PlanPage() {
  const [logicalDate, setLogicalDate] = useState(() => getNowKstLogicalDate(6))
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myUid = auth.currentUser?.uid ?? null
  const myPlan = useMemo(
    () => (myUid ? plans.find((p) => p.user_id === myUid) : null),
    [plans, myUid],
  )
  const myItems = useMemo(
    () => items.filter((it) => it.user_id === myUid).sort((a, b) => a.hour - b.hour),
    [items, myUid],
  )

  const [goal, setGoal] = useState('')
  const [condition, setCondition] = useState<number | null>(3)
  const [weather, setWeather] = useState<string | null>('sunny')

  const [editHour, setEditHour] = useState(9)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    if (myPlan) {
      setGoal(myPlan.goal ?? '')
      setCondition(myPlan.condition ?? null)
      setWeather(myPlan.weather ?? null)
    }
  }, [myPlan?.updated_at])

  async function refresh() {
    if (!auth.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const p = await apiFetch<{ logicalDate: string; rows: PlanRow[] }>(
        `/api/plans?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setPlans(p.rows)

      const i = await apiFetch<{ logicalDate: string; rows: PlanItem[] }>(
        `/api/plan-items?logicalDate=${encodeURIComponent(logicalDate)}`,
      )
      setItems(i.rows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalDate, myUid])

  async function saveMyPlan() {
    if (!auth.currentUser) return
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

  async function saveMyItem() {
    if (!auth.currentUser) return
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
      setEditContent('')
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save plan item')
    } finally {
      setLoading(false)
    }
  }

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
        <h3>내 하루 상태</h3>
        <div className="row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="label">
            컨디션 (1~5)
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
                  {w.label} {w.value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="label" style={{ marginTop: 10 }}>
          오늘 목표 한 줄 (50자)
          <input
            className="textInput"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={50}
            placeholder="예: 알고리즘 3문제 + 프로젝트 2시간"
          />
        </label>

        <div className="modalActions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          <button className="btn" onClick={saveMyPlan} disabled={loading || !auth.currentUser}>
            저장
          </button>
        </div>
      </div>

      <div className="card">
        <h3>내 계획 항목</h3>
        <div className="muted">생선가시는 다음 단계에서, 지금은 시간 단위로만 입력 가능해.</div>
        <div className="row" style={{ marginTop: 10, gridTemplateColumns: '160px 1fr' }}>
          <label className="label">
            시간
            <select value={editHour} onChange={(e) => setEditHour(Number(e.target.value))}>
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            내용 (120자)
            <input
              className="textInput"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={120}
              placeholder="예: CS 복습"
            />
          </label>
        </div>
        <div className="modalActions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          <button
            className="btn"
            onClick={saveMyItem}
            disabled={loading || editContent.trim().length === 0}
          >
            추가/수정
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          {myItems.length === 0 ? (
            <div className="muted">아직 입력한 계획 항목이 없어.</div>
          ) : (
            <div className="list">
              {myItems.map((it) => (
                <div key={`${it.user_id}-${it.hour}`} className="listRow">
                  <div className="listMain">
                    <div className="content">
                      {String(it.hour).padStart(2, '0')}:00 · {it.content}
                    </div>
                    <div className="muted">{it.created_at}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
