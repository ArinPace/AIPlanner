import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ApiError, db } from './cloud.js'
import { storage } from './mcp-auth.js'
import type { CalendarEvent, StoredState } from '../src/types.js'
import {eventType} from '../src/lib/eventType.js'
import {normalizeEventFolders,validateEventFolders} from '../src/lib/eventFolders.js'
import { descendantIds, folderPath, type FilesState } from '../src/lib/files.js'

export const datetime = z.string().max(100).refine(v => /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v)), 'Use an ISO datetime with timezone.')
const recurrence = z.object({frequency:z.enum(['none','daily','weekly','monthly','yearly']),interval:z.number().int().min(1).max(1000),until:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()})
export const eventPatch = {
  id:z.string().min(1).max(100).optional(), revision:z.number().int().nonnegative(),
  title:z.string().trim().min(1).max(300).optional(),description:z.string().max(20000).optional(),
  start:datetime.optional(),end:datetime.optional(),allDay:z.boolean().optional(),reminder:z.boolean().optional(),
  tagIds:z.array(z.string().min(1).max(100)).max(100).optional(),recurrence:recurrence.optional(),
  urgency:z.number().int().min(0).max(99).nullable().optional(),
  planningLocked:z.boolean().optional(),
  scheduleType:z.enum(['fixed','planned']).optional(),
  eventKind:z.literal('folder').nullable().optional(),folderId:z.string().min(1).max(100).nullable().optional(),
  activityType:z.enum(['break','buffer']).optional(),bufferForEventId:z.string().min(1).max(100).optional(),
}
type EventPatch = z.infer<z.ZodObject<typeof eventPatch>>
export async function calendarRow(username:string):Promise<{state:StoredState;revision:number}> {
  return storage(await db().from('planner_calendars').select('state,revision').eq('username',username).single())
}
export async function saveEvent(username:string,args:EventPatch) {
  const row=await calendarRow(username)
  if(row.revision!==args.revision)throw new ApiError(409,'Read the latest calendar revision before saving.')
  const old=args.id ? row.state.events.find(e=>e.id===args.id) : undefined
  if(args.id && !old)throw new ApiError(404,'Event not found. Omit id to create a new event.')
  const {revision:_revision,id:_id,planningLocked,activityType,bufferForEventId,...patch}=args
  const event={description:'',allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null},...old,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined)),id:old?.id || randomUUID()} as CalendarEvent
  if(planningLocked!==undefined){if(!old?.planning)throw new ApiError(400,'Only planner-created blocks have a planning lock.');event.planning={...old.planning,locked:planningLocked}}
  if(activityType){
   if(old&&old.planning?.kind!=='break'&&old.planning?.kind!=='buffer')throw new ApiError(400,'Do not reclassify an existing commitment as a disposable break. Create a separate buffer instead.')
   event.planning={kind:activityType,locked:old?.planning?.locked||false,...(bufferForEventId?{bufferForEventId}:{})}
  }
  if(bufferForEventId){
   if(event.planning?.kind!=='buffer'||bufferForEventId===event.id||!row.state.events.some(e=>e.id===bufferForEventId))throw new ApiError(400,'Choose an existing main activity for a separate buffer event.')
   event.planning={...event.planning,bufferForEventId}
  }
  event.scheduleType=args.scheduleType||eventType(old||event,row.state.tags)
  if(event.reminder && !event.allDay && event.start)event.end=new Date(Date.parse(event.start)+1).toISOString()
  if(!event.title || !event.start || !event.end)throw new ApiError(400,'New events require title, start and end with explicit timezone offsets.')
  if(Date.parse(event.end)<Date.parse(event.start))throw new ApiError(400,'Event end must follow its start.')
  if(event.tagIds.some(id=>!row.state.tags.some(t=>t.id===id)))throw new ApiError(400,'Choose tag IDs returned by planner_calendar_read.')
  if(event.recurrence.until && (!Number.isFinite(Date.parse(event.recurrence.until)) || event.recurrence.until<event.start.slice(0,10)))throw new ApiError(400,'Recurrence end must be a valid date on or after the event start.')
  if(old)Object.assign(old,event);else row.state.events.push(event)
  row.state.events=normalizeEventFolders(row.state.events)
  validateEventFolders(row.state.events)
  const rows=storage(await db().from('planner_calendars').update({state:row.state,revision:row.revision+1,updated_at:new Date().toISOString()}).eq('username',username).eq('revision',row.revision).select('revision'))
  if(!rows.length)throw new ApiError(409,'Calendar changed. Read it before retrying.')
  return {saved:true,eventId:event.id,event:row.state.events.find(item=>item.id===event.id)!,revision:rows[0].revision}
}

export function searchFiles(state:FilesState,args:{query?:string;folderId?:string;offset?:number;limit?:number}) {
  if(args.folderId && !state.folders.some(f=>f.id===args.folderId))throw new ApiError(404,'Folder not found.')
  const included=args.folderId ? descendantIds(state.folders,args.folderId) : null
  const query=(args.query || '').trim().toLowerCase(),offset=args.offset || 0,limit=args.limit || 50
  const path=(id:string|null)=>folderPath(state.folders,id).map(f=>f.name).join(' / ')
  const items=[
    ...state.folders.filter(f=>!included || included.has(f.id)).map(f=>({...f,kind:'folder',path:path(f.id),search:[f.name,...f.labels,path(f.id)].join(' ')})),
    ...state.files.filter(f=>!included || included.has(f.folderId ?? '')).map(({content,richText:_richText,richTextSource:_richTextSource,...f})=>({...f,kind:f.format==='note'?'note':'text',path:path(f.folderId),search:f.name+' '+content+' '+(f.tags||[]).join(' ')+' '+path(f.folderId)})),
    ...(state.documents || []).filter(f=>!included || included.has(f.folderId ?? '')).map(f=>({...f,path:path(f.folderId),search:f.name+' '+(f.url || '')+' '+path(f.folderId)})),
  ].filter(f=>f.search.toLowerCase().includes(query)).map(({search:_search,...item})=>item)
  return {items:items.slice(offset,offset+limit),total:items.length,offset,hasMore:offset+limit<items.length,searches:'Folder paths/labels, note contents, link URLs and PDF filenames. Read PDFs individually for their contents.'}
}

export async function readPdf(username:string,id:string,pageStart:number,pageCount:number) {
  const upload=storage(await db().from('planner_uploads').select('storage_path,status').eq('username',username).eq('id',id).maybeSingle())
  if(!upload || upload.status!=='complete' || upload.storage_path!==`${username}/${id}.pdf`)throw new ApiError(404,'PDF not available in this account.')
  const download=await db().storage.from('planner-pdfs').download(upload.storage_path)
  if(download.error || !download.data)throw new ApiError(503,'Could not read the saved PDF.')
  const blob=download.data
  if(blob.size>25*1024*1024)throw new ApiError(413,'PDF exceeds the supported size.')
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Import explicitly so serverless tracing includes the parser worker as well.
  const worker=await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ;(globalThis as typeof globalThis & {pdfjsWorker?:unknown}).pdfjsWorker=worker
  const task=getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true})
  try {
    const pdf=await task.promise
    if(pageStart>pdf.numPages)throw new ApiError(400,'Page is beyond the end of this PDF.')
    const pages=[];let remaining=80000
    for(let n=pageStart;n<=Math.min(pdf.numPages,pageStart+pageCount-1);n++) {
      const page=await pdf.getPage(n),content=await page.getTextContent()
      const full=content.items.map(item=>'str' in item ? item.str+('hasEOL' in item && item.hasEOL?'\n':' ') : '').join('')
      const text=full.slice(0,remaining);remaining-=text.length
      pages.push({page:n,text,truncated:text.length<full.length})
      if(!remaining)break
    }
    return {pageCount:pdf.numPages,pages,nextPage:pages.at(-1)!.page<pdf.numPages?pages.at(-1)!.page+1:null,needsVisualReview:pages.some(p=>!p.text.trim()),notice:'Extracted text can omit diagrams or scanned content. Do not claim to have read images or unread pages.'}
  } finally {await task.destroy()}
}
