import {chromium} from 'playwright'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {workerRequest} from './worker-request.mjs'

const dataDir=process.env.PLANNER_DATA_DIR||'/var/lib/planner'
const config=JSON.parse(await readFile(path.join(dataDir,'worker.json'),'utf8'))
const target=JSON.parse(await readFile(path.join(dataDir,'chat-web-conversation.json'),'utf8'))
const url=new URL(target.url)
if(url.origin!=='https://chatgpt.com'||!/^\/c\/[a-z0-9-]+$/i.test(url.pathname)||url.search||url.hash)throw Error('Choose the isolated ChatGPT conversation URL.')
const sentDir=path.join(dataDir,'chat-web-sent');await mkdir(sentDir,{recursive:true,mode:0o700})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const api=(action,value)=>workerRequest(config.origin,config.token,'chat-web/'+action,value)
let connection
async function run(job){
 let reply=''
 try{
  if(!connection?.isConnected())connection=await chromium.connectOverCDP('http://127.0.0.1:9223')
  // Reuse only the explicitly configured test conversation. Never select Main Chat.
  const context=connection.contexts()[0]
  let page=context.pages().find(p=>p.url()===url.href)
  if(!page){page=await context.newPage();await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000})}
  const composer=page.getByRole('textbox',{name:'Work with ChatGPT',exact:true})
  if(await composer.count()!==1)throw Error('Open the isolated ChatGPT conversation in Work mode. Sign in if requested.')
  const running=()=>page.getByRole('button',{name:/^(?:Stop|Stop generating|Pause|Stop task)$/i}).filter({visible:true}).count()
  if(await running())throw Error('ChatGPT is already working in the experiment conversation. Wait before sending another message.')
  const responses=page.locator('[data-markdown-text-style="assistant-message"]:visible, [data-message-author-role="assistant"]:visible')
  const baseline=await responses.count()
  await composer.fill(job.message)
  // Write intent before clicking; an uncertain send must never be retried automatically.
  await writeFile(path.join(sentDir,job.id),'dispatching',{flag:'wx',mode:0o600})
  await page.getByRole('button',{name:'Send',exact:true}).click()
  let stableSince=0,lastProgress=0
  while(true){
   const count=await responses.count()
   const next=count>baseline?await responses.nth(count-1).innerText():''
   if(next!==reply){reply=next;stableSince=Date.now()}
   if(Date.now()-lastProgress>15000){await api('progress',{id:job.id,lease:job.lease,reply});lastProgress=Date.now()}
   if(reply&&Date.now()-stableSince>4500&&!await running())break
   if(await composer.count()!==1)throw Error('ChatGPT needs attention. Open the experiment conversation before resending.')
   await wait(1500)
  }
  await api('finish',{id:job.id,lease:job.lease,reply})
 }catch(error){
  await api('finish',{id:job.id,lease:job.lease,reply,error:error.code==='EEXIST'?'This message may already have been sent. Check ChatGPT before resending.':String(error.message||'The browser relay failed.').slice(0,1000)}).catch(()=>{})
 }
}
while(true){
 try{const {job}=await api('claim',{});if(job){await run(job);continue}}
 catch{ /* Leave the existing Agent worker untouched when the experiment is offline. */ }
 await wait(10000)
}
