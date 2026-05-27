import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { ScrollToTop } from './components/scroll-to-top'
import { useAuth } from './lib/auth'
import { DashboardPage } from './pages/DashboardPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { AdminTeachersPage } from './pages/AdminTeachersPage'
import { AdminClassesPage } from './pages/AdminClassesPage'
import { AuthPage } from './pages/AuthPage'
import { AlphabetLessonPage } from './pages/AlphabetLessonPage'
import { ClassroomPage } from './pages/ClassroomPage'
import { LandingPage } from './pages/LandingPage'
import { LearningHubPage } from './pages/LearningHubPage'
import { LearningTestPage } from './pages/LearningTestPage'
import { LivePage } from './pages/LivePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProgressPage } from './pages/ProgressPage'
import { ProfilePage } from './pages/ProfilePage'
import { TeacherDashboardPage } from './pages/TeacherDashboardPage'
import { TeacherMessagesPage } from './pages/TeacherMessagesPage'
import { TeacherSchedulePage } from './pages/TeacherSchedulePage'
import { TeacherSettingsPage } from './pages/TeacherSettingsPage'
import { TeachersPage } from './pages/TeachersPage'
import { StudentClassesPage } from './pages/StudentClassesPage'
import { WordLessonPage } from './pages/WordLessonPage'

function defaultAppPath(role: 'student' | 'teacher' | 'admin') {
  if (role === 'teacher') return '/app/teacher'
  if (role === 'admin') return '/app/admin'
  return '/app/dashboard'
}

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
    return <Navigate to={defaultAppPath(user.role)} replace />
  }
  return <>{children}</>
}

function TeacherOnlyRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate to="/teacher/login" replace />
  }

  if (user.role !== 'teacher') {
    return <Navigate to="/app/dashboard" replace />
  }

  return <Outlet />
}

function AdminOnlyRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== 'admin') {
    return <Navigate to={defaultAppPath(user.role)} replace />
  }

  return <Outlet />
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-on-background" role="status">
      <div className="flex items-center gap-3 rounded-full border border-outline-variant/20 bg-surface-container px-5 py-3">
        <LoaderCircle className="size-4 animate-spin text-secondary" aria-hidden="true" />
        <span className="text-sm text-on-surface-variant">Loading workspace…</span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
    <ScrollToTop />
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
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <AuthPage mode="forgot" />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicOnlyRoute>
            <AuthPage mode="reset" />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/teacher/login"
        element={
          <PublicOnlyRoute>
            <AuthPage mode="login" audience="teacher" />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/admin/login"
        element={
          <PublicOnlyRoute>
            <AuthPage mode="login" audience="admin" />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/teacher/register"
        element={
          <PublicOnlyRoute>
            <AuthPage mode="register" audience="teacher" />
          </PublicOnlyRoute>
        }
      />

      <Route path="/app" element={<ProtectedRoutes />}>
        <Route
          index
          element={
            <RoleRedirect />
          }
        />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="classes" element={<StudentClassesPage />} />
        <Route path="classes/:bookingId" element={<ClassroomPage />} />
        <Route path="learn" element={<LearningHubPage />} />
        <Route path="learn/alphabet" element={<AlphabetLessonPage />} />
        <Route path="learn/words" element={<WordLessonPage />} />
        <Route path="learn/test" element={<LearningTestPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="live" element={<LivePage />} />
        <Route path="upload" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="/app/teacher" element={<TeacherOnlyRoute />}>
        <Route index element={<TeacherDashboardPage />} />
        <Route path="schedule" element={<TeacherSchedulePage />} />
        <Route path="schedule/:bookingId" element={<ClassroomPage />} />
        <Route path="messages" element={<TeacherMessagesPage />} />
        <Route path="settings" element={<TeacherSettingsPage />} />
      </Route>
      <Route path="/app/admin" element={<AdminOnlyRoute />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="teachers" element={<AdminTeachersPage />} />
        <Route path="teachers/classes" element={<AdminClassesPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  )
}

function RoleRedirect() {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Navigate to={defaultAppPath(user.role)} replace />
}
