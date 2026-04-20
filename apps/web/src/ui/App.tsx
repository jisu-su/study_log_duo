import { NavLink, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import PlanPage from './pages/PlanPage'
import ReflectionPage from './pages/ReflectionPage'
import ResourcesPage from './pages/ResourcesPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
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
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/reflection" element={<ReflectionPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

