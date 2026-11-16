import {albertHosts} from './browser-sources.mjs'
const normalize=value=>String(value||'').replace(/\s+/g,' ').trim().toLowerCase()
export function availability(value,config){
 const text=normalize(value),open=config.openValues.map(normalize).includes(text),closed=config.closedValues.map(normalize).includes(text)
 return open&&!closed?'open':closed&&!open?'closed':'unknown'
}
function allowed(url){try{const u=new URL(url);return u.protocol==='https:'&&albertHosts.has(u.hostname)&&!u.username&&!u.password}catch{return false}}
async function unique(page,selector){
 const until=Date.now()+8000
 do{
  const found=[]
  for(const frame of page.frames()){if(!allowed(frame.url()))continue;const locator=frame.locator(selector).filter({visible:true}),count=await locator.count();if(count===1)found.push(locator);else if(count>1)throw Error('The monitor selector matches multiple visible elements.')}
  if(found.length===1)return found[0]
  if(found.length>1)throw Error('The monitor selector matches multiple frames.')
  await page.waitForTimeout(250)
 }while(Date.now()<until)
 throw Error('The monitored Albert element is unavailable or ambiguous.')
}
export async function checkAlbertWatch(context,watch){
 const c=watch.config,page=await context.newPage()
 async function verify(){if(!allowed(page.url())||await page.locator('input[type=password]:visible').count())throw Error('Albert needs sign-in or the page changed. No class availability was inferred.')}
 try{
  if(!allowed(watch.url))throw Error('Use an HTTPS Albert class search URL.')
  await page.goto(watch.url,{waitUntil:'domcontentloaded',timeout:30000});await verify()
  for(const step of c.steps){
   const locator=await unique(page,step.selector)
   if(step.action==='click'){
    const label=normalize((await locator.innerText().catch(()=>''))||await locator.getAttribute('aria-label')||await locator.getAttribute('value')||await locator.getAttribute('title'))
    if(!label||/enroll|register|\badd\b|drop|swap|payment|purchase|finish|submit/.test(label)||!/search|detail|back|return|next|previous|expand|collapse|course|term|semester|browse|filter|\bok\b|continue|view|advanced|basic|show|find/.test(label))throw Error('Monitor actions must be read-only class search/navigation.')
    await locator.click({timeout:10000})
   }else{
    const type=normalize(await locator.getAttribute('type')),name=normalize((await locator.getAttribute('name'))+' '+(await locator.getAttribute('id')))
    if(['password','hidden'].includes(type)||/password|passwd|otp|credential|username/.test(name))throw Error('The monitor cannot enter sign-in information.')
    if(step.action==='fill')await locator.fill(step.value||'',{timeout:10000});else if(step.action==='select')await locator.selectOption(step.value||'',{timeout:10000});else throw Error('Unsupported monitor action.')
   }
   await page.waitForTimeout(500);await verify()
  }
  const row=await unique(page,c.rowSelector)
  await row.waitFor({state:'visible',timeout:10000})
  const identity=normalize(await row.innerText())
  const expected=normalize(c.identityText).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  if(!new RegExp('(?:^|\\W)'+expected+'(?:$|\\W)').test(identity))throw Error('The displayed class does not match the configured class identity.')
  const cell=row.locator(c.statusSelector).filter({visible:true})
  if(await cell.count()!==1)throw Error('The class availability cell is unavailable or ambiguous.')
  const icons=cell.locator('img[alt]')
  const text=(await cell.innerText())||(await icons.count()===1?await icons.getAttribute('alt'):'')||await cell.getAttribute('alt')||await cell.getAttribute('aria-label')||await cell.getAttribute('title')||''
  const status=availability(text,c)
  return {status,detail:status==='unknown'?'Class availability was not an exact recognized status.':c.identityText+': '+text.trim()}
 }catch(error){return {status:'unknown',detail:String(error.message||'Albert check unavailable').slice(0,1000)}}
 finally{await page.close()}
}
export async function runAlbertMonitor({api,dataDir}){
 const {watch}=await api('albert-watch',{action:'claim'})
 if(!watch)return
 let result,connection
 try{
  const [{chromium},{browser,googleBrowser},{siteLaunches},{browserEndpoint}]=await Promise.all([import('playwright'),import('./browser.mjs'),import('./site-launches.mjs'),import('./browser-routing.mjs')])
  const saved=await siteLaunches(dataDir),endpoint=browserEndpoint(watch.url,saved.browserProfiles)
  if(new URL(endpoint).port==='9223')await googleBrowser(dataDir);else await browser(dataDir)
  connection=await chromium.connectOverCDP(endpoint)
  result=await checkAlbertWatch(connection.contexts()[0],watch)
 }catch{result={status:'unknown',detail:'The existing Albert browser could not be opened. Reconnect Albert; no availability was inferred.'}}
 finally{await connection?.close()}
 await api('albert-watch',{action:'report',id:watch.id,lease:watch.lease,...result})
}
