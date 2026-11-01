import {isIPhoneApp,nativeRequest} from '../lib/platform'
import { useEffect, useState, type FormEvent } from 'react'
import { login, register, setToken, authOptions, startGoogleLogin, finishGoogleLogin, linkGoogleLogin, createGoogleLogin, type GoogleLoginResult } from '../lib/api'
import { CalendarMark } from './Icons'

export function LoginScreen({onSignedIn}:{onSignedIn:(username:string)=>void}) {
  const [mode,setMode]=useState<'login'|'register'>('login')
  const [username,setUsername]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [googleEnabled,setGoogleEnabled]=useState(false)
  const [pending,setPending]=useState<{email:string;existingAccount:boolean}|null>(null)
  function accept(result:GoogleLoginResult){
    if(result.pending){setPending(result);return}
    setToken(result.token);onSignedIn(result.username)
  }
  useEffect(()=>{
    let active=true
    const status=new URLSearchParams(location.search).get('google_login')
    if(status){
      const url=new URL(location.href);url.searchParams.delete('google_login');history.replaceState(null,'',url)
    }
    if(status==='failed'||status==='cancelled')setError(status==='cancelled'?'Google sign-in was cancelled.':'Google sign-in could not finish. Please try again.')
    void authOptions().then(async options=>{
      if(!active)return
      setGoogleEnabled(options.googleEnabled)
      if(status==='success'||options.pendingGoogle){
        setBusy(true)
        try {const result=await finishGoogleLogin();if(active)accept(result)}
        catch(err){if(active)setError(err instanceof Error?err.message:'Could not sign in.')}
        finally{if(active)setBusy(false)}
      }
    }).catch(()=>{})
    return ()=>{active=false}
  // This initialization follows the OAuth return once per screen mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  async function run(action:()=>Promise<GoogleLoginResult>){
    setError('');setBusy(true)
    try{accept(await action())}catch(err){setError(err instanceof Error?err.message:'Could not sign in.')}finally{setBusy(false)}
  }
  async function submit(event:FormEvent){
    event.preventDefault()
    await run(()=>pending?linkGoogleLogin(username,password):mode==='login'?login(username,password):register(username,password,email))
  }
  return <div className="login-screen"><form className="login-card" onSubmit={submit}>
    <div className="login-brand"><CalendarMark size={40}/><div><h1>AI Planner</h1><p>Sign in to save your calendar and files to your account.</p></div></div>
    {pending ? <><p>Continue as {pending.email}. Link your existing account using its password to keep your calendar and files.</p>
      {!pending.existingAccount&&<button type="button" className="secondary-btn login-submit" disabled={busy} onClick={()=>void run(createGoogleLogin)}>Create a new account with Google</button>}
    </> : <>
      {googleEnabled&&<button type="button" className="secondary-btn login-submit" disabled={busy} onClick={async()=>{
        setError('');setBusy(true)
        try{if(isIPhoneApp()){await nativeRequest({action:'googleSignIn'});location.assign('/?google_login=success')}else{const result=await startGoogleLogin();location.assign(result.url)}}catch(err){setError(err instanceof Error?err.message:'Could not open Google sign-in.');setBusy(false)}
      }}>Continue with Google</button>}
      <div className="login-switch" role="tablist" aria-label="Account mode">
        <button type="button" role="tab" aria-selected={mode==='login'} className={mode==='login'?'is-active':''} onClick={()=>setMode('login')}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode==='register'} className={mode==='register'?'is-active':''} onClick={()=>setMode('register')}>Create account</button>
      </div>
    </>}
    {mode==='register'&&!pending&&<label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required/></label>}
    <label className="field"><span>{mode==='register'&&!pending?'Username':'Username or email'}</span><input type="text" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} maxLength={mode==='register'&&!pending?24:254} required/></label>
    <label className="field"><span>Password</span><input type="password" autoComplete={mode==='register'&&!pending?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={mode==='register'&&!pending?8:1} maxLength={256} required/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="primary-btn login-submit" disabled={busy}>{busy?'Please wait…':pending?'Link existing account':mode==='login'?'Sign in':'Create account'}</button>
    {pending&&<button type="button" className="secondary-btn" disabled={busy} onClick={()=>{setPending(null);setError('')}}>Back to sign in</button>}
    <p className="login-hint">Your calendar and files are saved privately to your account.</p>
  </form></div>
}
