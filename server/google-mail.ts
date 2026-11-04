import {ApiError,db} from './cloud.js'
import {storage} from './mcp-auth.js'
import {googleCalendarSession,googleCalendarStatus,GOOGLE_MAIL_READ_SCOPE} from './agent.js'
export async function readGoogleMail(username:string,args:{accountId:string;query?:string;pageToken?:string;messageId?:string}){
 const settings=storage(await db().from('planner_vm_settings').select('sources').eq('username',username).maybeSingle())
 if(!settings?.sources?.includes('gmail'))throw new ApiError(403,'Enable Gmail in Add sites before reading email.')
 const status=await googleCalendarStatus(username)
 if(!status.accounts.some(a=>a.id===args.accountId))throw new ApiError(404,'Google account not found.')
 const session=await googleCalendarSession(username,args.accountId)
 if(!String(session.tokens.scope||'').split(' ').includes(GOOGLE_MAIL_READ_SCOPE))throw new ApiError(403,'Use Connect email + calendar for this account and approve read-only email access.')
 const base='https://gmail.googleapis.com/gmail/v1/users/me/messages'
 const params=args.messageId?new URLSearchParams({format:'full'}):new URLSearchParams({maxResults:'20',q:args.query||'newer_than:14d',...(args.pageToken?{pageToken:args.pageToken}:{})})
 const response=await fetch(base+(args.messageId?'/'+encodeURIComponent(args.messageId):'')+'?'+params,{headers:{Authorization:'Bearer '+session.tokens.access_token},signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw new ApiError(response.status===401?401:502,'Could not read email from this Google account ('+response.status+'). Reconnect if needed.')
 const data=await response.json() as any
 const text=(part:any):string=>part?.mimeType==='text/plain'&&part.body?.data?Buffer.from(part.body.data,'base64url').toString('utf8'):(part?.parts||[]).map(text).join('\n')
 return {accountId:session.accountId,identity:session.identity,...(args.messageId?{message:{id:data.id,threadId:data.threadId,snippet:data.snippet,headers:(data.payload?.headers||[]).filter((h:any)=>['subject','from','to','date'].includes(String(h.name).toLowerCase())),text:text(data.payload).slice(0,40000),url:'https://mail.google.com/mail/u/?authuser='+encodeURIComponent(session.identity)+'#all/'+data.id}}:{messages:data.messages||[],nextPageToken:data.nextPageToken||null,hasMore:Boolean(data.nextPageToken)})}
}
