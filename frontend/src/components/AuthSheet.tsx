import { useState, type FormEvent } from 'react'
import { SideSheet } from './SideSheet'

interface AuthSheetProps {
  onLogin: (email: string, password: string) => Promise<unknown>
  onRegister: (username: string, email: string, password: string) => Promise<unknown>
  onClosed: () => void
}

type Mode = 'login' | 'register'

/** [LOGIN] — collector sign-in / registration against POST /api/login and /api/register. */
export function AuthSheet({ onLogin, onRegister, onClosed }: AuthSheetProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const submit = async (e: FormEvent, close: () => void) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'register') {
        await onRegister(username.trim(), email.trim(), password)
        setMode('login')
        setPassword('')
        setMessage({ text: 'Registration recorded. Sign in to continue.', error: false })
      } else {
        await onLogin(email.trim(), password)
        close()
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'The request could not be completed.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setMessage(null)
  }

  return (
    <SideSheet label="Collector Account" variant="auth" onClosed={onClosed}>
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)}>
          <h2 className="sheet-title">{mode === 'login' ? 'Sign in' : 'Register'}</h2>
          <div className="form-tabs label" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>
              New collector
            </button>
          </div>

          {mode === 'register' && (
            <label className="form-field">
              <span className="label">Name</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label className="form-field">
            <span className="label">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="form-field">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          <p className={message?.error ? 'form-message is-error' : 'form-message'} role={message?.error ? 'alert' : 'status'}>
            {message?.text}
          </p>

          <button type="submit" className="btn-acquire" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      )}
    </SideSheet>
  )
}
