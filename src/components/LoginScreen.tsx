import { useState, type FormEvent } from 'react'
import { login, register, setToken } from '../lib/api'
import { CalendarMark } from './Icons'

type LoginScreenProps = {
  onSignedIn: (username: string) => void
}

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = mode === 'login' ? await login(username, password) : await register(username, password)
      setToken(result.token)
      onSignedIn(result.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <CalendarMark size={40} />
          <div>
            <h1>AI Planner</h1>
            <p>Sign in to save your calendar and files on this computer.</p>
          </div>
        </div>

        <div className="login-switch" role="tablist" aria-label="Account mode">
          <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
          <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')}>
            Create account
          </button>
        </div>

        <label className="field">
          <span>Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="yourname"
            minLength={3}
            maxLength={24}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
            minLength={mode === 'login' ? 4 : 8}
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="primary-btn login-submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <p className="login-hint">
          Your calendar and files are saved privately to your account.
        </p>
      </form>
    </div>
  )
}
