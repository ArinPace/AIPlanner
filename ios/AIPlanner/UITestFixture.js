// Loaded only by a DEBUG simulator UI-test launch against loopback, never Release.
(()=>{
 let signedIn=globalThis.__plannerFixtureSignedIn===true;
 localStorage.removeItem('ai-planner-token');
 if(signedIn)localStorage.setItem('ai-planner-token','fixture-session');
 const now=new Date().toISOString();
 let calendar={revision:1,events:[],tags:[{id:'school',name:'Classes',color:'#1a73e8'}],hiddenTagIds:[],zoom:1};
 if(globalThis.__plannerFixtureWidgets){calendar.revision=Date.now();const start=new Date(Date.now()-300000),end=new Date(Date.now()+1800000);if(globalThis.__plannerFixtureFreeTime){start.setTime(Date.now()+1800000);end.setTime(Date.now()+3600000)}calendar.events=[{id:'widget-test',title:'Widget current activity',start:start.toISOString(),end:end.toISOString(),description:'',allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null}}]}
 let files={revision:1,folders:[{id:'school-folder',parentId:null,name:'Subjects',color:'#1a73e8',labels:[],updatedAt:now}],documents:[],files:[{id:'todo',name:'To do',systemRole:'todo',format:'note',folderId:null,content:'- [ ] [urgency:80] Prepare for statistics quiz',updatedAt:now},{id:'work',name:'Work',format:'note',folderId:null,content:'- [ ] [urgency:85] Homework due Friday',updatedAt:now},{id:'note',name:'iPhone test note',format:'note',folderId:null,content:'Your notes stay in the same Planner account.',updatedAt:now}]};
 const main={id:'00000000-0000-4000-8000-000000000001',title:'Main Chat',is_main:true,pinned:true,updated_at:now};
 // Simulate a change saved by another device while this test app is away.
 if(globalThis.__plannerFixtureResumeSync)document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)return;
  const start=new Date(),end=new Date(start.getTime()+3600000);
  calendar={...calendar,revision:calendar.revision+1,events:[{id:'resume-sync',title:'Phone resume sync check',description:'Saved on another device',start:start.toISOString(),end:end.toISOString(),allDay:false,tagIds:[],scheduleType:'planned',recurrence:{frequency:'none',interval:1,until:null}}]};
 });
 if(globalThis.__plannerFixtureFocusZoom)document.addEventListener('DOMContentLoaded',()=>{
  const probe=document.createElement('output');probe.id='fixture-viewport-scale';probe.setAttribute('role','status');probe.style.cssText='position:fixed;top:0;left:0;z-index:10000;font-size:10px;pointer-events:none;background:white;color:black';document.body.append(probe);
  const update=()=>{probe.textContent='Viewport scale '+(window.visualViewport?.scale||1).toFixed(2)};
  update();window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);document.addEventListener('focusin',()=>setTimeout(update,350));document.addEventListener('focusout',()=>setTimeout(update,350));
 });
 const fetchReal=window.fetch.bind(window);
 window.fetch=async(input,options={})=>{
  const raw=typeof input==='string'?input:input.url;const url=new URL(raw,location.href);
  if(!url.pathname.startsWith('/api/'))return fetchReal(input,options);
  const path=url.pathname,method=options.method||'GET';let value={};
  if(path==='/api/session')value={username:signedIn?'arin':null};
  else if(path==='/api/auth/options')value={googleEnabled:true,pendingGoogle:false};
  else if(path==='/api/login'||path==='/api/register'){signedIn=true;value={username:'arin',token:'fixture-session'}}
  else if(path==='/api/logout'){signedIn=false;value={ok:true}}
  else if(path==='/api/calendar'){if(method==='PUT'){calendar={...JSON.parse(options.body),revision:calendar.revision+1};value={ok:true,revision:calendar.revision}}else value=calendar}
  else if(path==='/api/files'){if(method==='PUT'){files={...JSON.parse(options.body),revision:files.revision+1};value={ok:true,revision:files.revision}}else value=files}
  else if(path==='/api/calendar/google-sync')value={connected:true,reviewRequired:true,pending:true,error:null,identity:'fixture@example.com'};
  else if(path==='/api/calendar/export.json')value={format:'ai-planner-calendar',formatVersion:1,calendar};
  else if(path==='/api/calendar/staging.json')value={format:'ai-planner-calendar-stage',formatVersion:1,status:'draft',payload:{calendar}};
  else if(path==='/api/agent/vm/send'&&globalThis.__plannerFixtureWidgets){
   const request=JSON.parse(options.body),output=document.getElementById('fixture-widget-feedback')||document.createElement('output');
   output.id='fixture-widget-feedback';output.setAttribute('role','status');output.style.cssText='position:fixed;bottom:0;left:0;background:white;color:black;z-index:10000';
   if(globalThis.__plannerFixtureAtomicWidgetPlan&&!request.message.includes('finished this activity early')){
    const match=request.message.match(/widgetFeedback=(\{.*\}) to apply this occurrence/);
    if(match){
     const feedback=JSON.parse(match[1]),button=document.createElement('button');button.textContent='Publish reviewed fixture plan';button.style.cssText='position:fixed;bottom:36px;left:0;z-index:10000';
     button.onclick=()=>{calendar={...calendar,revision:calendar.revision+1,resolvedWidgetFeedbackIds:[feedback.id],events:calendar.events.map(e=>({...e,end:new Date(Date.now()+480000).toISOString()}))};button.remove();window.dispatchEvent(new Event('planner-calendar-refresh'))};document.body.append(button);
    }
   }
   output.textContent='Widget feedback received: '+(request.message.startsWith('Free-time request')?'free':request.message.includes('finished this activity early')?'done':'time');document.body.append(output);value={id:'fixture-accepted'};
  }
  else if(path==='/api/agent/vm')value={power:'offline',hosts:[],chats:[main],deletedChats:[],runs:[],settings:{ai_provider:'codex',sources:[],sites:{},schedule_enabled:false,schedule:{timezone:'America/New_York',times:[]}},accounts:[],google:{accounts:[],connected:false,configured:true,activeAccountId:null},queue:{active:null,queuedIds:[]},planning:{startedAt:now,ready:true,revision:1},provisioning:null,personalChatGptAvailable:true,hostedChatGptAvailable:false,recordings:false};
  else if(path.includes('/jobs'))value={jobs:[],hasMore:false};
  else if(path==='/api/planning')value={preferences:{intensity:20},tasks:[]};
  else value={items:[],chats:[main],jobs:[],hasMore:false};
  return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 };
})();
