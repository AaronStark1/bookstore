import { useCallback, useState } from 'react'
import { api } from '../api/client'
import type { AuthSession } from '../types'

const STORAGE_KEY = 'bo:session'

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (typeof parsed.token === 'string' && parsed.user && typeof parsed.user.email === 'string') {
      return parsed as AuthSession
    }
  } catch {
    /* corrupt or unavailable storage — treat as signed out */
  }
  return null
}

function writeSession(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable — the session lives for this page only */
  }
}

/** Collector session backed by POST /api/login and POST /api/register. */
export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(readSession)

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password)
    const next: AuthSession = {
      token: res.token,
      user: {
        username: res.existingUser.username,
        email: res.existingUser.email,
        role: res.existingUser.role,
        profile: res.existingUser.profile,
        bio: res.existingUser.bio,
      },
    }
    writeSession(next)
    setSession(next)
    return next
  }, [])

  const register = useCallback(async (username: string, email: string, password: string) => {
    await api.register(username, email, password)
  }, [])

  const logout = useCallback(() => {
    writeSession(null)
    setSession(null)
  }, [])

  return { session, login, register, logout }
}
