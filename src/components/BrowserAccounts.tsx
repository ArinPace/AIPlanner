import { useState } from 'react'
import type { BrowserAccount } from '../lib/vm'

export function BrowserAccounts({ accounts, busy, connected, onOpen, onEdit }: { accounts: BrowserAccount[]; busy: boolean; connected: boolean; onOpen: () => void; onEdit: (id: string, action: 'rename' | 'remove', label?: string) => void }) {
  const [editing,setEditing]=useState<string|null>(null)
  const [label,setLabel]=useState('')
  return <details className="connection-accounts"><summary>Accounts ({accounts.length})</summary>
    <p>One active browser session per site. Use the website’s account menu to add or switch accounts. Previous accounts may need sign-in again.</p>
    {!accounts.length && <p>No saved accounts{connected ? '. Verify connections to identify the saved browser session.' : '.'}</p>}
    {accounts.map(account=><div className="connection-account" key={account.id}>
      <strong>{account.label || account.identity || 'Private browser session'}</strong>
      {account.label && account.identity && <small>{account.identity}</small>}
      <small>{account.active && connected ? 'Active browser session' : 'Previously used — reconnect to use'} · Last verified {new Date(account.verified_at).toLocaleString()}</small>
      {!account.identity && <small>Account identity unavailable. You can add a label.</small>}
      {editing===account.id ? <form onSubmit={e=>{e.preventDefault();onEdit(account.id,'rename',label);setEditing(null)}}><label>Account label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={200} required /></label><button disabled={busy}>Save label</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></form> : <div className="assistant-settings-actions">
        <button type="button" disabled={busy} onClick={onOpen}>{account.active && connected ? 'Manage / switch' : 'Reconnect'}</button>
        <button type="button" disabled={busy} onClick={()=>{setEditing(account.id);setLabel(account.label || account.identity || '')}}>Rename</button>
        <button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove this account from the planner? Removing the active session also disables this site. To sign out of the website itself, use its account menu.'))onEdit(account.id,'remove')}}>Remove</button>
      </div>}
    </div>)}
    <button type="button" disabled={busy} onClick={onOpen}>Add / switch account</button>
  </details>
}
