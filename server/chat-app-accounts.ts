import {z} from 'zod'
import {db} from './cloud.js'
import {storage} from './mcp-auth.js'
export const gmailAccountSchema=z.object({email:z.string().email().max(254).transform(s=>s.toLowerCase()),readVerified:z.boolean(),writeTools:z.array(z.string().regex(/^[a-zA-Z0-9_.:-]{1,160}$/)).max(30)})
export async function readGmailAccounts(username:string){
 const rows=storage(await db().from('planner_chat_app_accounts').select('email,read_verified,write_tools,verified_at').eq('username',username).order('verified_at',{ascending:false}))
 return rows.map(row=>({email:row.email,provider:'chatgpt-gmail' as const,readVerified:row.read_verified,writeTools:row.write_tools,verifiedAt:row.verified_at}))
}
export async function reportGmailAccount(username:string,input:unknown){
 const value=gmailAccountSchema.parse(input)
 storage(await db().from('planner_chat_app_accounts').upsert({username,email:value.email,read_verified:value.readVerified,write_tools:[...new Set(value.writeTools)],verified_at:new Date().toISOString()},{onConflict:'username,email'}))
 return {saved:true,accounts:await readGmailAccounts(username)}
}

export async function observeGmailConnections(username:string,input:unknown){
 const emails=z.array(z.string().email().max(254)).max(10).parse(input)
 if(emails.length)storage(await db().from('planner_chat_app_accounts').upsert([...new Set(emails.map(email=>email.toLowerCase()))].map(email=>({username,email,read_verified:false,write_tools:[],verified_at:new Date().toISOString()})),{onConflict:'username,email',ignoreDuplicates:true}))
 return {accounts:await readGmailAccounts(username)}
}
