import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
 const page=await browser.newPage()
 await page.goto('http://127.0.0.1:5174')
 const result=await page.evaluate(async()=>{
  const replica=await import('/src/lib/localReplica.ts'),api=await import('/src/lib/api.ts')
  const calls=[]
  window.webkit={messageHandlers:{plannerNative:{postMessage:async item=>{calls.push(item);return {ok:true}}}}}
  const calendar=revision=>({revision,events:[],tags:[],hiddenTagIds:[],zoom:1})
  replica.activateReplica('account_a');const old=replica.replicaContext()
  await replica.saveReplica('calendar',calendar(999),old)
  replica.activateReplica(null);const loggedOut=await replica.readReplica()
  replica.activateReplica('account_b');const current=replica.replicaContext()
  await replica.saveReplica('calendar',calendar(1),current)
  await replica.saveReplica('calendar',calendar(1000),old)
  const switched=await replica.readReplica()
  api.setToken('old-session')
  let finish
  const response=new Promise(resolve=>{finish=resolve})
  const fetch=window.fetch;window.fetch=async()=>response
  const inflight=api.loadCalendar().then(()=>false,error=>error.message.includes('account changed'))
  api.setToken('new-session')
  finish(new Response(JSON.stringify(calendar(2000)),{headers:{'Content-Type':'application/json'}}))
  const rejected=await inflight
  window.fetch=fetch
  const after=await replica.readReplica()
  return {loggedOut,switched,rejected,after,accounts:calls.filter(c=>c.action==='localReplicaAccount').map(c=>c.account),widgetAccounts:calls.filter(c=>c.action==='widgetSchedule').map(c=>c.account)}
 })
 assert.equal(result.loggedOut.account,null);assert.deepEqual(result.loggedOut.parts,[])
 assert.equal(result.switched.account,'account_b');assert.equal(result.switched.parts[0].data.revision,1)
 assert.equal(result.rejected,true);assert.equal(result.after.parts[0].data.revision,1)
 assert.deepEqual(result.accounts,['account_a',null,'account_b'])
 assert.deepEqual(result.widgetAccounts,['account_a','account_b'])
 console.log('Account replica checks passed: logout clears data, switching accepts the new lower revision, stale account writes/responses are rejected, widget snapshots carry account identity.')
}finally{await browser.close()}
