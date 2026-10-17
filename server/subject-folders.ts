import type { FilesState } from '../src/lib/files.js'

const categories = ['Syllabus and subject information','Assignments and deadlines','Readings and resources','Announcements and other updates']
export function subjectTitle(folder:{id:string;name:string}) {
  return folder.id.startsWith('agent-course-') && folder.name.toLowerCase().endsWith(' '+folder.id.slice(-6).toLowerCase())?folder.name.slice(0,-7):folder.name
}
export function refreshSubjectOverview(state: FilesState, folderId: string, now: string) {
  const folder=state.folders.find(f=>f.id===folderId)
  if(!folder)return
  const id='subject-overview-'+folderId
  const notes=state.files.filter(f=>f.folderId===folderId && !f.id.startsWith('subject-overview-'))
  const groups=categories.map(()=>[] as string[])
  for(const note of notes){
    const title=note.content.split('\n')[0].replace(/^#+\s*/,'') || note.name
    const kind=/syllabus|course overview|subject information/i.test(title)?0:/assignment|homework|deadline|quiz|exam|due|essay/i.test(title)?1:/reading|resource|lecture|slides|memo/i.test(title)?2:3
    const body=note.content.split('\n').slice(1).join('\n').trim()
    const excerpt=body.length>1800?body.slice(0,1800)+'\n\nContinued in '+note.name+'.\n'+body.split('\n').filter(line=>/^(Source:|Due:)/.test(line)).join('\n'):body
    groups[kind].push('### '+title+'\n\n'+excerpt)
  }
  for(const document of (state.documents || []).filter(d=>d.folderId===folderId))groups[2].push(document.kind==='link'?'['+document.name+']('+document.url+')':document.name+' (PDF in this folder)')
  const content='# '+subjectTitle(folder)+'\n\nUpdated: '+now+'\n\nThis living subject reference contains saved material. Each review reports inaccessible sources; an update does not mean every source was accessible.\n\n'+categories.map((name,i)=>'## '+name+'\n\n'+(groups[i].join('\n\n') || 'No verified material saved yet.')).join('\n\n')
  const existing=state.files.find(f=>f.id===id)
  // Preserve personally edited overviews and refresh a predictable companion.
  const targetId=existing && existing.content!==existing.agentSnapshot?id+'-latest':id
  const target=state.files.find(f=>f.id===targetId)
  if(target && target.content!==target.agentSnapshot)return
  const saved={id:targetId,folderId,name:targetId===id?'Subject overview':'Subject overview - latest sources',format:'note' as const,content,agentSnapshot:content,updatedAt:now}
  if(target)Object.assign(target,saved);else state.files.push(saved)
}
