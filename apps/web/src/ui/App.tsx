import { NavLink, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import HomePage from './pages/HomePage'
import PlanPage from './pages/PlanPage'
import ReflectionPage from './pages/ReflectionPage'
import ResourcesPage from './pages/ResourcesPage'
import SettingsPage from './pages/SettingsPage'
import { apiFetch, getApiBaseUrl, type MeUser } from '../api'
import { auth, googleProvider, isFirebaseConfigured } from '../firebase'
import Modal from './shared/Modal'

export default function App() {
  const [me, setMe] = useState<MeUser | null>(null)
  const [meError, setMeError] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)

  useEffect(() => {
    if (!auth) {
      setAuthReady(true)
      return
    }
    return onAuthStateChanged(auth, async (user) => {
      setAuthReady(true)
      setAuthUser(user)
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

  const needsNickname = Boolean(authUser && me && (me.name_locked ?? 0) === 0)
  const canUseApp = Boolean(authUser && me && !needsNickname)
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
        <div className="brand">duoingsu</div>
        {canUseApp ? (
          <nav className="nav">
            <NavLink to="/" end>
              홈
            </NavLink>
            <NavLink to="/plan">플랜</NavLink>
            <NavLink to="/reflection">느낀 점</NavLink>
            <NavLink to="/resources">자료</NavLink>
            <NavLink to="/settings">설정</NavLink>
          </nav>
        ) : null}
        <div className="topAuth">
          {authUser ? (
            <>
              {me ? <span className="userBadge">{me.name}</span> : null}
              <button
                className="btnSecondary"
                onClick={() => (auth ? signOut(auth) : null)}
              >
                로그아웃
              </button>
            </>
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
        {!getApiBaseUrl() ? (
          <div className="card">
            <h2>설정 필요</h2>
            <p className="muted">
              Pages 환경변수 `VITE_API_BASE_URL`이 비어있어서 API 호출이 Pages로 가고,
              결과가 `Not Implemented`로 보일 수 있습니다.
            </p>
          </div>
        ) : null}
        {!isFirebaseConfigured() ? (
          <div className="card">
            <h2>설정 필요</h2>
            <p className="muted">
              Firebase 웹앱 환경변수(`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
              `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`)가 비어있어서 앱을 실행할 수 없습니다.
            </p>
          </div>
        ) : null}
        {!authReady ? (
          <div className="publicHome">
            <div className="publicPanel">
              <h1>duoingsu</h1>
              <p>둘만의 스터디 기록 공간을 불러오는 중입니다.</p>
            </div>
          </div>
        ) : !authUser ? (
          <div className="publicHome">
            <div className="publicPanel">
              <h1>duoingsu</h1>
              <p>허용된 사람만 사용할 수 있는 비공개 스터디 로그입니다.</p>
              <button
                className="btn"
                onClick={() => (auth ? signInWithPopup(auth, googleProvider) : null)}
                disabled={!auth}
              >
                Google 로그인
              </button>
            </div>
          </div>
        ) : meError && !me ? (
          <div className="publicHome">
            <div className="publicPanel">
              <h1>접근할 수 없습니다.</h1>
              <p>허용된 계정으로 로그인했는지 확인해주세요.</p>
              <button
                className="btnSecondary"
                onClick={() => (auth ? signOut(auth) : null)}
              >
                로그아웃
              </button>
            </div>
          </div>
        ) : canUseApp ? (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/reflection" element={<ReflectionPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        ) : null}
      </main>

      <Modal open={needsNickname} title="닉네임 설정" onClose={() => {}}>
        <div className="form">
          <div className="muted">
            첫 로그인 시 1회만 설정 가능! 신중하게 만들기 (2~12자)
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
