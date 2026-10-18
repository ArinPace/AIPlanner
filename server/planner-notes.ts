import type {PlannerTextFile} from '../src/lib/files.js'

export type NotePatch=Partial<Omit<PlannerTextFile,'format'>> & {format?:'note'|'text'}
export function patchPlannerNote(old:PlannerTextFile,patch:NotePatch):PlannerTextFile {
  if(old.systemRole&&patch.format==='text')throw new Error('Goals and To do must remain permanent Notes; edit their contents instead.')
  const {format,...fields}=patch
  const next={...old,...Object.fromEntries(Object.entries(fields).filter(([,value])=>value!==undefined))} as PlannerTextFile
  if(format==='note')next.format='note'
  if(format==='text')delete next.format
  if(patch.content!==undefined && patch.content!==old.content){
    delete next.richText;delete next.richTextSource
    if(next.format==='note' && patch.tags===undefined)next.tags=[...new Set([...next.content.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{1,40})/gu)].map(match=>match[1]))].slice(0,20)
  }
  if(next.format==='note'){
    if(patch.richText!==undefined){next.richText=patch.richText;next.richTextSource=next.content}
  }else{
    delete next.richText;delete next.richTextSource;delete next.pinned;delete next.tags
  }
  return next
}
