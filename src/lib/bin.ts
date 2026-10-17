export function binDaysLeft(expiresAt:string|number,now=Date.now()) {
  const expiry=typeof expiresAt==='number'?expiresAt:Date.parse(expiresAt)
  return Number.isFinite(expiry)?Math.max(0,Math.min(30,Math.ceil((expiry-now)/86400000))):0
}
