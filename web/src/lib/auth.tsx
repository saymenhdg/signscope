import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { API_BASE, apiRequest } from './api'
import type { AuthProvidersResponse, AuthResponse, AuthProviderOption, User } from './types'

type Credentials = {
  email: string
  password: string
}

type RegisterPayload = Credentials & {
  display_name: string
}

type AuthContextValue = {
  user: User | null
  loading: boolean
  providers: AuthProviderOption[]
  signIn: (payload: Credentials) => Promise<User>
  signUp: (payload: RegisterPayload) => Promise<User>
  signOut: () => Promise<void>
  restoreSession: () => Promise<User | null>
  signInWithProvider: (providerId: string, nextPath?: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [providers, setProviders] = useState<AuthProviderOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrapAuth() {
      try {
        const [providerResult, sessionResult] = await Promise.allSettled([
          apiRequest<AuthProvidersResponse>('/api/auth/providers'),
          apiRequest<User>('/api/auth/me'),
        ])

        if (cancelled) {
          return
        }

        if (providerResult.status === 'fulfilled') {
          setProviders(providerResult.value.providers)
        }

        if (sessionResult.status === 'fulfilled') {
          setUser(sessionResult.value)
        } else {
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void bootstrapAuth()

    return () => {
      cancelled = true
    }
  }, [])

  async function restoreSession() {
    try {
      const payload = await apiRequest<User>('/api/auth/me')
      setUser(payload)
      return payload
    } catch {
      setUser(null)
      return null
    }
  }

  async function completeAuth(path: '/api/auth/login' | '/api/auth/register', payload: Credentials | RegisterPayload) {
    const response = await apiRequest<AuthResponse>(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
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
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
      })
    } catch {
      // Best-effort logout.
    }
    setUser(null)
  }

  function signInWithProvider(providerId: string, nextPath = '/app/dashboard') {
    const encodedNext = encodeURIComponent(nextPath)
    window.location.assign(`${API_BASE}/api/auth/oauth/${providerId}/start?next=${encodedNext}`)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      providers,
      signIn,
      signUp,
      signOut,
      restoreSession,
      signInWithProvider,
    }),
    [loading, providers, user],
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

