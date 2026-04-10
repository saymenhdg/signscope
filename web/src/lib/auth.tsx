import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { apiRequest, ApiError } from './api'
import type { AuthResponse, User } from './types'

const TOKEN_KEY = 'signspeak.auth.token'

type Credentials = {
  email: string
  password: string
}

type RegisterPayload = Credentials & {
  display_name: string
}

type AuthContextValue = {
  user: User | null
  token: string | null
  loading: boolean
  signIn: (payload: Credentials) => Promise<User>
  signUp: (payload: RegisterPayload) => Promise<User>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const payload = await apiRequest<User>('/api/auth/me', { token })
        if (!cancelled) {
          setUser(payload)
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) {
            window.localStorage.removeItem(TOKEN_KEY)
            setToken(null)
            setUser(null)
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [token])

  async function completeAuth(path: '/api/auth/login' | '/api/auth/register', payload: Credentials | RegisterPayload) {
    const response = await apiRequest<AuthResponse>(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    window.localStorage.setItem(TOKEN_KEY, response.token)
    setToken(response.token)
    setUser(response.user)
    return response.user
  }

  async function signIn(payload: Credentials) {
    return completeAuth('/api/auth/login', payload)
  }

  async function signUp(payload: RegisterPayload) {
    return completeAuth('/api/auth/register', payload)
  }

  async function signOut() {
    if (token) {
      try {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          token,
        })
      } catch {
        // Best-effort logout.
      }
    }
    window.localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [loading, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
