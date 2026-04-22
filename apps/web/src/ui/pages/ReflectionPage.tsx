import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../api'
import { auth } from '../../firebase'
import { getNowKstLogicalDate } from '../../../../../shared/datetime'

const EMOTIONS = [
  '집중됨',
  '뿌듯함',
  '산만함',
  '지침',
  '답답함',
  '설렘',
  '평온함',
  '불안함',
] as const

type ReflectionRow = {
  user_id: string
  user_name: string
  avatar_url: string | null
  reflection_id: string | null
  emotion_tags: string | null
  went_well: string | null
  went_wrong: string | null
  memo: string | null
  updated_at: string | null
}

type ReactionRow = {
  reflection_id: string
  user_id: string
  emoji: '👍' | '💪' | '❤️'
  created_at: string
}

export default function ReflectionPage() {
  const [logicalDate, setLogicalDate] = useState(() => getNowKstLogicalDate(6))
  const [reflections, setReflections] = useState<ReflectionRow[]>([])
  const [reactions, setReactions] = useState<ReactionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myUid = auth?.currentUser?.uid ?? null
  const myReflection = useMemo(
    () => (myUid ? reflections.find((r) => r.user_id === myUid) : null),
    [reflections, myUid],
  )
  const partnerReflection = useMemo(() => {
    if (!myUid) return reflections[0] ?? null
    return reflections.find((r) => r.user_id !== myUid) ?? null
  }, [reflections, myUid])

  const [selected, setSelected] = useState<string[]>([])
  const [wentWell, setWentWell] = useState('')
  const [wentWrong, setWentWrong] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (!myReflection) return
    setSelected(safeParseJsonArray(myReflection.emotion_tags))
    setWentWell(myReflection.went_well ?? '')
    setWentWrong(myReflection.went_wrong ?? '')
    setMemo(myReflection.memo ?? '')
  }, [myReflection?.updated_at])

  async function refresh() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{
        logicalDate: string
        reflections: ReflectionRow[]
        reactions: ReactionRow[]
      }>(`/api/reflections?logicalDate=${encodeURIComponent(logicalDate)}`)
      setReflections(data.reflections)
      setReactions(data.reactions)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load reflections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalDate, myUid])

  function toggleEmotion(tag: string) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  async function save() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/reflections', {
        method: 'PUT',
        body: JSON.stringify({
          logicalDate,
          emotionTags: selected,
          wentWell: wentWell.trim() || null,
          wentWrong: wentWrong.trim() || null,
          memo: memo || null,
        }),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save reflection')
    } finally {
      setLoading(false)
    }
  }

  const reactionsForPartner = useMemo(() => {
    const id = partnerReflection?.reflection_id
    if (!id) return []
    return reactions.filter((r) => r.reflection_id === id)
  }, [reactions, partnerReflection?.reflection_id])

  const myReactionEmoji = useMemo(() => {
    const id = partnerReflection?.reflection_id
    if (!id || !myUid) return null
    return reactions.find((r) => r.reflection_id === id && r.user_id === myUid)?.emoji ?? null
  }, [reactions, partnerReflection?.reflection_id, myUid])

  async function react(emoji: '👍' | '💪' | '❤️') {
    if (!auth?.currentUser) return
    if (!partnerReflection?.reflection_id) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/reactions', {
        method: 'PUT',
        body: JSON.stringify({ reflectionId: partnerReflection.reflection_id, emoji }),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to react')
    } finally {
      setLoading(false)
    }
  }

  const canSave =
    selected.length > 0 || wentWell.trim().length > 0 || wentWrong.trim().length > 0 || memo.trim().length > 0

  return (
    <div className="stack">
      <div className="card">
        <div className="homeHeader">
          <div>
            <h2>느낀 점</h2>
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
        {!auth?.currentUser ? (
          <div className="muted" style={{ marginTop: 8 }}>
            상단의 Google 로그인 후 사용 가능해.
          </div>
        ) : null}
      </div>

      <div className="twoCol">
        <div className="card">
          <h3>내 회고</h3>

          <div className="sectionTitle">오늘의 감정</div>
          <div className="chips">
            {EMOTIONS.map((t) => (
              <button
                key={t}
                className={`chip ${selected.includes(t) ? 'on' : ''}`}
                onClick={() => toggleEmotion(t)}
                type="button"
              >
                {t}
              </button>
            ))}
          </div>

          <label className="label" style={{ marginTop: 10 }}>
            오늘 잘한 것
            <textarea value={wentWell} onChange={(e) => setWentWell(e.target.value)} rows={3} />
          </label>

          <label className="label">
            오늘 못한 것
            <textarea value={wentWrong} onChange={(e) => setWentWrong(e.target.value)} rows={3} />
          </label>

          <label className="label">
            자유 회고 (마크다운은 다음 단계에서)
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={7} />
          </label>

          <div className="modalActions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <button className="btn" onClick={save} disabled={loading || !canSave}>
              저장
            </button>
          </div>
        </div>

        <div className="card">
          <h3>상대 회고</h3>
          {!partnerReflection?.reflection_id ? (
            <div className="muted">상대가 아직 회고를 작성하지 않았어.</div>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 10 }}>
                {partnerReflection.user_name} · 업데이트 {partnerReflection.updated_at ?? '-'}
              </div>

              <div className="sectionTitle">감정 태그</div>
              <div className="chips">
                {safeParseJsonArray(partnerReflection.emotion_tags).length === 0 ? (
                  <div className="muted">-</div>
                ) : (
                  safeParseJsonArray(partnerReflection.emotion_tags).map((t) => (
                    <span key={t} className="chip on">
                      {t}
                    </span>
                  ))
                )}
              </div>

              <div className="sectionTitle" style={{ marginTop: 10 }}>
                잘한 것 / 못한 것
              </div>
              <div className="box">
                <div className="boxRow">
                  <div className="boxKey">잘한 것</div>
                  <div className="boxVal">{partnerReflection.went_well || '-'}</div>
                </div>
                <div className="boxRow">
                  <div className="boxKey">못한 것</div>
                  <div className="boxVal">{partnerReflection.went_wrong || '-'}</div>
                </div>
              </div>

              <div className="sectionTitle" style={{ marginTop: 10 }}>
                메모
              </div>
              <div className="box">{partnerReflection.memo || '-'}</div>

              <div className="sectionTitle" style={{ marginTop: 10 }}>
                공감
              </div>
              <div className="reactions">
                {(['👍', '💪', '❤️'] as const).map((e) => (
                  <button
                    key={e}
                    className={`reactBtn ${myReactionEmoji === e ? 'on' : ''}`}
                    onClick={() => react(e)}
                    type="button"
                    disabled={loading}
                  >
                    {e} {countEmoji(reactionsForPartner, e)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function safeParseJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v) => typeof v === 'string')
  } catch {
    return []
  }
}

function countEmoji(rows: ReactionRow[], emoji: ReactionRow['emoji']): number {
  return rows.filter((r) => r.emoji === emoji).length
}
