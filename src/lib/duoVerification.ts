/** Duo approval happens in Duo Mobile; it does not need a browser takeover sheet. */
export function isDuoVerification(text:string){return /\bduo\b/i.test(text)&&/push|approv|verif|authenticat|timed out|try again/i.test(text)}
