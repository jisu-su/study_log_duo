import { useEffect, useMemo, useState } from 'react'
import { apiFetch, getApiBaseUrl } from '../../api'
import { auth } from '../../firebase'

type ResourceRow = {
  id: string
  user_id: string
  user_name: string
  avatar_url: string | null
  type: 'link' | 'file' | 'memo'
  title: string
  url: string | null
  memo: string | null
  tags: string | null
  is_pinned: number
  og_image: string | null
  created_at: string
}

function parseTags(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v) => typeof v === 'string')
  } catch {
    return []
  }
}

export default function ResourcesPage() {
  const [rows, setRows] = useState<ResourceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | ResourceRow['type']>('all')
  const [date, setDate] = useState('') // YYYY-MM-DD

  const [newType, setNewType] = useState<ResourceRow['type']>('link')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [memo, setMemo] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const myUid = auth?.currentUser?.uid ?? null
  const apiBase = getApiBaseUrl() ?? ''

  async function refresh() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (type !== 'all') params.set('type', type)
      if (q.trim()) params.set('q', q.trim())
      if (date) params.set('date', date)
      const data = await apiFetch<{ rows: ResourceRow[] }>(`/api/resources?${params.toString()}`)
      setRows(data.rows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load resources')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, date])

  async function create() {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      if (newType === 'file') {
        if (!file) throw new Error('파일을 선택해줘.')
        const form = new FormData()
        form.set('file', file)
        form.set('title', title.trim())
        form.set('memo', memo.trim())
        form.set('tags', tags.trim())
        await apiFetch<{ row: ResourceRow }>('/api/resources', {
          method: 'POST',
          body: form,
        })
      } else {
        await apiFetch<{ row: ResourceRow }>('/api/resources', {
          method: 'POST',
          body: JSON.stringify({
            type: newType,
            title: title.trim(),
            url: newType === 'link' ? url.trim() : null,
            memo: memo.trim() || null,
            tags: tags.trim() || null,
          }),
        })
      }

      setTitle('')
      setUrl('')
      setMemo('')
      setTags('')
      setFile(null)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create')
    } finally {
      setLoading(false)
    }
  }

  async function togglePin(r: ResourceRow) {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/resources/${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPinned: r.is_pinned ? 0 : 1 }),
      })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to pin')
    } finally {
      setLoading(false)
    }
  }

  async function remove(r: ResourceRow) {
    if (!auth?.currentUser) return
    setLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/resources/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete')
    } finally {
      setLoading(false)
    }
  }

  const canCreate = useMemo(() => {
    if (newType === 'link') return url.trim().startsWith('http') && (title.trim().length > 0 || url.trim().length > 0)
    if (newType === 'memo') return title.trim().length > 0
    if (newType === 'file') return Boolean(file)
    return false
  }, [newType, title, url, file])

  return (
    <div className="stack">
      <div className="card">
        <div className="homeHeader">
          <div>
            <h2>자료 공유</h2>
            <div className="muted">링크/파일/메모를 공유하고 핀 고정할 수 있어.</div>
          </div>
          <div className="actions">
            <input
              className="textInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색(제목/메모/URL)"
            />
            <button className="btnSecondary" onClick={() => refresh()} disabled={loading}>
              검색
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

      <div className="card">
        <h3>추가</h3>
        <div className="row" style={{ gridTemplateColumns: '200px 1fr' }}>
          <label className="label">
            타입
            <select value={newType} onChange={(e) => setNewType(e.target.value as any)}>
              <option value="link">링크</option>
              <option value="file">파일</option>
              <option value="memo">메모</option>
            </select>
          </label>
          <label className="label">
            태그(쉼표로 구분)
            <input className="textInput" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
        </div>

        <label className="label" style={{ marginTop: 10 }}>
          제목
          <input
            className="textInput"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder={newType === 'file' ? '(비우면 파일명)' : '예: React 자료'}
          />
        </label>

        {newType === 'link' ? (
          <label className="label" style={{ marginTop: 10 }}>
            URL
            <input
              className="textInput"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
        ) : null}

        {newType === 'file' ? (
          <label className="label" style={{ marginTop: 10 }}>
            파일(최대 10MB)
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}

        <label className="label" style={{ marginTop: 10 }}>
          메모(선택)
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={4} />
        </label>

        <div className="modalActions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          <button className="btn" onClick={create} disabled={loading || !canCreate}>
            추가
          </button>
        </div>
      </div>

      <div className="card">
        <div className="homeHeader">
          <h3>목록</h3>
          <div className="actions">
            <select value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="all">전체</option>
              <option value="link">링크</option>
              <option value="file">파일</option>
              <option value="memo">메모</option>
            </select>
            <input
              className="textInput"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className="btnSecondary" onClick={() => setDate('')} disabled={loading}>
              날짜 해제
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="muted">아직 공유된 자료가 없어.</div>
        ) : (
          <div className="list" style={{ marginTop: 10 }}>
            {rows.map((r) => (
              <div key={r.id} className="resourceRow">
                <div className="resourceMain">
                  <div className="resourceTitle">
                    {r.is_pinned ? <span className="pin">PIN</span> : null}
                    <span className="pill">{r.type}</span>
                    <span className="content">{r.title}</span>
                  </div>
                  <div className="muted">
                    {r.user_name} · {r.created_at}
                  </div>
                  {r.type === 'link' && r.url ? (
                    <div className="resourceLink">
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.url}
                      </a>
                    </div>
                  ) : null}
                  {r.type === 'file' ? (
                    <div className="resourceLink">
                      <a
                        href={`${apiBase}/api/resources/${encodeURIComponent(r.id)}/file`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        다운로드
                      </a>
                    </div>
                  ) : null}
                  {r.memo ? <div className="box">{r.memo}</div> : null}
                  {parseTags(r.tags).length ? (
                    <div className="chips">
                      {parseTags(r.tags).map((t) => (
                        <span key={t} className="chip on">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="resourceActions">
                  <button className="btnSecondary" onClick={() => togglePin(r)} disabled={loading}>
                    {r.is_pinned ? '핀 해제' : '핀'}
                  </button>
                  {r.user_id === myUid ? (
                    <button className="btnSecondary" onClick={() => remove(r)} disabled={loading}>
                      삭제
                    </button>
                  ) : (
                    <div className="muted">읽기 전용</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
