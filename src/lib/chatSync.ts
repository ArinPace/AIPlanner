export type ChatMirror={title:string;archived:boolean;deleted:boolean}
export type ChatMirrorPlan={push:Partial<ChatMirror>;pull:Partial<ChatMirror>;conflicts:(keyof ChatMirror)[]}
// Only compare positive observations of a mapped conversation. A missing sidebar
// row is never evidence of deletion (history is paginated and archives are hidden).
export function planChatMirror(local:ChatMirror,remote:ChatMirror,base:ChatMirror|null,prefer?:'planner'|'chatgpt'):ChatMirrorPlan{
 const push:Partial<ChatMirror>={},pull:Partial<ChatMirror>={},conflicts:(keyof ChatMirror)[]=[]
 for(const key of ['title','archived','deleted'] as const){
  if(local[key]===remote[key])continue
  if(!base){Object.assign(push,{[key]:local[key]});continue}
  const changedHere=local[key]!==base[key],changedThere=remote[key]!==base[key]
  if(changedHere&&changedThere){if(prefer==='planner')Object.assign(push,{[key]:local[key]});else if(prefer==='chatgpt')Object.assign(pull,{[key]:remote[key]});else conflicts.push(key)}
  else if(changedHere)Object.assign(push,{[key]:local[key]})
  else if(changedThere)Object.assign(pull,{[key]:remote[key]})
 }
 // ChatGPT deletion is permanent; it can never be reversed by restoring Planner.
 if(remote.deleted&&!local.deleted&&base?.deleted){if(prefer==='chatgpt'){delete push.deleted;pull.deleted=true}else conflicts.push('deleted')}
 return {push,pull,conflicts:[...new Set(conflicts)]}
}
