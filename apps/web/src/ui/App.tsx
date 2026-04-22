import { NavLink, Route, Routes } from 'react-router-dom'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import HomePage from './pages/HomePage'
import PlanPage from './pages/PlanPage'
import ReflectionPage from './pages/ReflectionPage'
import ResourcesPage from './pages/ResourcesPage'
import SettingsPage from './pages/SettingsPage'
import { apiFetch, type MeUser } from '../api'
import { auth, googleProvider, isFirebaseConfigured } from '../firebase'
import Modal from './shared/Modal'

export default function App() {
  const [me, setMe] = useState<MeUser | null>(null)
  const [meError, setMeError] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, async (user) => {
      setMeError(null)
      setMe(null)
      if (!user) return
      try {
        const data = await apiFetch<{ user: MeUser }>('/api/me')
        setMe(data.user)
      } catch (e: any) {
        setMeError(e?.message ?? 'Failed to load /api/me')
      }
    })
  }, [])

  const needsNickname = Boolean(auth?.currentUser && me && (me.name_locked ?? 0) === 0)
  const nicknameValue = nickname.trim()
  const nicknameValidLength = nicknameValue.length >= 2 && nicknameValue.length <= 12
  const nicknameValidChars = /^[0-9A-Za-z\u3131-\u318E\uAC00-\uD7A3]+$/.test(nicknameValue)
  const nicknameValid = nicknameValidLength && nicknameValidChars

  async function saveNickname() {
    const value = nicknameValue
    if (!nicknameValid) return
    setSavingNickname(true)
    setMeError(null)
    try {
      const data = await apiFetch<{ user: MeUser }>('/api/me/nickname', {
        method: 'POST',
        body: JSON.stringify({ nickname: value }),
      })
      setMe(data.user)
    } catch (e: any) {
      setMeError(e?.message ?? 'Failed to save nickname')
    } finally {
      setSavingNickname(false)
    }
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">studuo</div>
        <nav className="nav">
          <NavLink to="/" end>
            홈
          </NavLink>
          <NavLink to="/plan">플랜</NavLink>
          <NavLink to="/reflection">느낀 점</NavLink>
          <NavLink to="/resources">자료</NavLink>
          <NavLink to="/settings">설정</NavLink>
        </nav>
        <div className="topAuth">
          {auth?.currentUser ? (
            <button
              className="btnSecondary"
              onClick={() => (auth ? signOut(auth) : null)}
            >
              로그아웃
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => (auth ? signInWithPopup(auth, googleProvider) : null)}
              disabled={!auth}
              title={!auth ? 'Firebase 환경변수가 필요합니다.' : undefined}
            >
              Google 로그인
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {!isFirebaseConfigured() ? (
          <div className="card">
            <h2>설정 필요</h2>
            <p className="muted">
              Firebase 웹앱 환경변수(`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
              `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`)가 비어있어서 앱을 실행할 수 없어.
            </p>
          </div>
        ) : null}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/reflection" element={<ReflectionPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <Modal open={needsNickname} title="닉네임 설정" onClose={() => {}}>
        <div className="form">
          <div className="muted">
            첫 로그인 1회만 설정 가능!! 신중하게 레츠고 (2~12자)
          </div>
          <label className="label">
            닉네임
            <input
              className="textInput"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={12}
              placeholder="예: 개발마스터"
            />
          </label>
          {!nicknameValidChars && nicknameValue.length > 0 ? (
            <div className="hint">한글/영문/숫자만 입력 가능해.</div>
          ) : null}
          {meError ? <div className="error">{meError}</div> : null}
          <div className="modalActions">
            <button
              className="btn"
              onClick={saveNickname}
              disabled={savingNickname || !nicknameValid}
            >
              저장
            </button>
          </div>
        </div>
      </Modal>

      {meError && !needsNickname ? (
        <div className="toastError">{meError}</div>
      ) : null}
    </div>
  )
}
