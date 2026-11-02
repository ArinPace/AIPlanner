import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const mode of ['duration','done','failure']){
  const page=await browser.newPage({viewport:{width:393,height:852}});
  await page.addInitScript({content:`globalThis.__plannerFixtureSignedIn=true;${fs.readFileSync(new URL('../ios/AIPlanner/UITestFixture.js',import.meta.url),'utf8')}`});
  await page.addInitScript(({mode})=>{
   window.feedbackSends=[];window.feedbackAcks=[];window.calendarWrites=[];window.widgetSnapshots=[];window.failSend=mode==='failure';
   const now=Date.now()/1000;
   window.pendingWidget={id:'test-'+mode,task:{id:'event@'+new Date(now*1000).toISOString(),title:'Test homework',start:now-300,end:now+1200,planningTaskId:'linked-homework'},remainingMinutes:mode==='duration'?30:0,done:mode==='done',reportedAt:now};
   window.widgetCalendar={revision:1,events:[{id:'event',title:'Test homework',start:new Date((now-300)*1000).toISOString(),end:new Date((now+1200)*1000).toISOString(),description:'',allDay:false,tagIds:[],scheduleType:'planned',recurrence:{frequency:'none',interval:1,until:null}}],tags:[],hiddenTagIds:[],zoom:1};
   window.webkit={messageHandlers:{plannerNative:{postMessage:async b=>{
    if(b.action==='widgetSchedule')window.widgetSnapshots.push(b.schedule);
    if(b.action==='taskFeedback')return window.pendingWidget;
    if(b.action==='ackTaskFeedback'){window.feedbackAcks.push(b);window.pendingWidget=null}
    return {ok:true};
   }}}};
   const fetch=window.fetch;
   window.fetch=async(input,options={})=>{
    if(new URL(String(input),location.href).pathname==='/api/calendar'){
     if(options.method==='PUT'){window.widgetCalendar=JSON.parse(options.body);window.widgetCalendar.revision++;window.calendarWrites.push(window.widgetCalendar);return new Response(JSON.stringify({ok:true,revision:window.widgetCalendar.revision}),{headers:{'Content-Type':'application/json'}})}
     return new Response(JSON.stringify(window.widgetCalendar),{headers:{'Content-Type':'application/json'}})
    }
    if(String(input).includes('/api/agent/vm/send')){
     window.feedbackSends.push(JSON.parse(options.body));
     return new Response(JSON.stringify(window.failSend?{error:'Test offline'}:{id:'accepted'}),{status:window.failSend?503:202,headers:{'Content-Type':'application/json'}})
    }
    return fetch(input,options)
   };
  },{mode});
  await page.goto(process.env.PLANNER_TEST_ORIGIN||'http://127.0.0.1:5174');
  if(mode==='failure'){
   await page.getByText(/Test offline/).waitFor();
   assert.equal(await page.evaluate(()=>feedbackSends.length),1);
   await page.waitForTimeout(2500);assert.equal(await page.evaluate(()=>feedbackSends.length),1);
   await page.reload();await page.getByText(/may already have been sent/).waitFor();
   assert.equal(await page.evaluate(()=>feedbackSends.length),0);
   await page.evaluate(()=>window.failSend=false);await page.getByRole('button',{name:'Retry',exact:true}).click();
  }
  await page.getByText('Sent to your agent',{exact:false}).waitFor();
  const result=await page.evaluate(()=>({sends:feedbackSends,acks:feedbackAcks,writes:calendarWrites,snapshots:widgetSnapshots}));
  assert.equal(result.writes.length,1);
  const target=result.writes[0].events[0].end;assert.match(result.sends[0].message,/already been saved/);
  assert.ok(result.snapshots.some(s=>mode==='duration'?s.events.some(e=>Math.abs(e.end-Date.parse(target)/1000)<1):true));
  assert.equal(result.sends.length,1);assert.equal(result.acks.length,1);assert.equal(result.sends[0].queue,true);
  assert.match(result.sends[0].message,/linked-homework/);
  assert.match(result.sends[0].message,mode==='done'?/finished this activity early/:mode==='duration'?/30 minutes remaining/:/0 minutes remaining/);
  if(mode==='duration')await page.screenshot({path:'/tmp/planner-widget-feedback-sent.png'});
  console.log(mode+' passed: Main Chat queue, correct occurrence/payload, acknowledge only after acceptance');
  await page.close();
 }
}finally{await browser.close()}
