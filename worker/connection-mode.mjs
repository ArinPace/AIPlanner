export function connectionMode(intent, signedIn) {
  return !signedIn || intent==='connect' ? 'connect' : intent==='manage' ? 'manage' : 'open'
}
export function shouldConfirm(mode, initialIdentity, identity) {
  return mode!=='manage' || Boolean(identity && identity!==initialIdentity)
}
