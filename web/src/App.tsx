import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { useAuth } from './lib/auth'
import { DashboardPage } from './pages/DashboardPage'
import { AuthPage } from './pages/AuthPage'
import { AlphabetLessonPage } from './pages/AlphabetLessonPage'
import { LandingPage } from './pages/LandingPage'
import { LearningHubPage } from './pages/LearningHubPage'
import { LearningTestPage } from './pages/LearningTestPage'
import { LivePage } from './pages/LivePage'
import { ProgressPage } from './pages/ProgressPage'
import { ProfilePage } from './pages/ProfilePage'
import { UploadPage } from './pages/UploadPage'
import { WordLessonPage } from './pages/WordLessonPage'

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return <Outlet />
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <LoadingScreen />
  }
  if (user) {
    return <Navigate to="/app/dashboard" replace />
  }
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-on-background">
      <div className="flex items-center gap-3 rounded-full border border-outline-variant/20 bg-surface-container px-5 py-3">
        <LoaderCircle className="size-4 animate-spin text-secondary" />
        <span className="text-sm text-on-surface-variant">Loading workspace...</span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <AuthPage mode="login" />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <AuthPage mode="register" />
          </PublicOnlyRoute>
        }
      />

      <Route path="/app" element={<ProtectedRoutes />}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="learn" element={<LearningHubPage />} />
        <Route path="learn/alphabet" element={<AlphabetLessonPage />} />
        <Route path="learn/words" element={<WordLessonPage />} />
        <Route path="learn/test" element={<LearningTestPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
