// Loaded only by a DEBUG simulator UI-test launch against loopback, never Release.
(()=>{
 let signedIn=globalThis.__plannerFixtureSignedIn===true;
 localStorage.removeItem('ai-planner-token');
 if(signedIn)localStorage.setItem('ai-planner-token','fixture-session');
 const now=new Date().toISOString();
 let calendar={revision:1,events:[],tags:[{id:'school',name:'Classes',color:'#1a73e8'}],hiddenTagIds:[],zoom:1};
 if(globalThis.__plannerFixtureWidgets){calendar.revision=Date.now();const start=new Date(Date.now()-300000),end=new Date(Date.now()+1800000);if(globalThis.__plannerFixtureFreeTime){start.setTime(Date.now()+1800000);end.setTime(Date.now()+3600000)}calendar.events=[{id:'widget-test',title:'Widget current activity',start:start.toISOString(),end:end.toISOString(),description:'',allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null}}]}
 if(globalThis.__plannerFixtureTaskFocus){calendar.events[0].end=new Date(Date.now()+45000).toISOString()}
 if(globalThis.__plannerFixtureTaskFocusFuture){calendar.events[0].start=new Date(Date.now()+40000).toISOString();calendar.events[0].end=new Date(Date.now()+70000).toISOString()}
 if(globalThis.__plannerFixtureNextWidgetTask){const start=new Date(Date.now()+1800000),end=new Date(start.getTime()+900000);calendar.events.push({id:'widget-next',title:'Widget next activity',start:start.toISOString(),end:end.toISOString(),description:'',allDay:false,tagIds:[],color:'#db4437',recurrence:{frequency:'none',interval:1,until:null}})}
 let notificationSettings={enabled:false,switches:true,advance:true,longTaskMinutes:30,minutes:[5]};
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
  const layout=document.createElement('output');layout.setAttribute('role','status');layout.style.cssText='position:fixed;top:14px;left:0;z-index:10000;font-size:9px;pointer-events:none;background:white';document.body.append(layout);
  const update=()=>{
   probe.textContent='Viewport scale '+(window.visualViewport?.scale||1).toFixed(2);
   const form=document.querySelector('.modal-backdrop:not([inert]) .event-modal'),v=window.visualViewport;
   const host=form||document.body;if(probe.parentNode!==host){host.append(probe,layout)}
   if(!form||!v){layout.textContent='No event editor';return}
   const r=form.getBoundingClientRect();
   const fits=r.left>=v.offsetLeft-1&&r.right<=v.offsetLeft+v.width+1&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1&&form.scrollWidth<=form.clientWidth+1;
   layout.textContent=fits?'Event editor fits viewport':`Event editor overflow: ${Math.round(r.left)},${Math.round(r.right)},${Math.round(r.bottom)} / ${Math.round(v.width)},${Math.round(v.height)}`;
  };
  update();window.visualViewport?.addEventListener('resize',()=>setTimeout(update,50));window.visualViewport?.addEventListener('scroll',()=>setTimeout(update,50));document.addEventListener('focusin',()=>setTimeout(update,350));document.addEventListener('focusout',()=>setTimeout(update,350));
 });
 if(globalThis.__plannerFixtureBlankToken){
  document.addEventListener('DOMContentLoaded',()=>{const button=document.createElement('button');button.textContent='Simulate blank page';button.style.cssText='position:fixed;bottom:0;right:0;z-index:10000';button.onclick=()=>{document.getElementById('root')?.replaceChildren();button.remove()};document.body.append(button)});
 }
 if(globalThis.__plannerFixtureNotifications)document.addEventListener('DOMContentLoaded',()=>{
  const output=document.createElement('output');output.setAttribute('role','status');output.style.cssText='position:fixed;top:180px;left:0;background:white;color:black;z-index:10000';document.body.append(output);
  for(const mode of ['switch','advance']){
   const button=document.createElement('button');button.textContent='Test '+mode+' notification';button.style.cssText='position:fixed;top:'+(mode==='switch'?100:140)+'px;left:0;background:white;color:black;z-index:10000';document.body.append(button);
   button.onclick=async()=>{try{
    const bridge=window.webkit.messageHandlers.plannerNative;
    await bridge.postMessage({action:'taskNotificationPermission'});
    const now=Date.now()/1000,end=now+(mode==='switch'?8:68);
    notificationSettings={enabled:true,switches:mode==='switch',advance:mode==='advance',longTaskMinutes:1,minutes:[1]};
    calendar={...calendar,revision:calendar.revision+1,events:[{id:'notification-test',title:'Notification sample homework',description:'',start:new Date((now-120)*1000).toISOString(),end:new Date(end*1000).toISOString(),allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null}},...(mode==='switch'?[{id:'notification-next',title:'Notification next activity',description:'',start:new Date(end*1000).toISOString(),end:new Date((end+120)*1000).toISOString(),allDay:false,tagIds:[],recurrence:{frequency:'none',interval:1,until:null}}]:[])]};
    window.dispatchEvent(new Event('planner-calendar-refresh'));
    window.dispatchEvent(new CustomEvent('planner-task-notifications-changed',{detail:notificationSettings}));
    await bridge.postMessage({action:'taskNotificationSettings',account:'planner_test',settings:notificationSettings});
    await bridge.postMessage({action:'widgetSchedule',account:'planner_test',schedule:{version:1,generatedAt:now,validUntil:now+1000,events:calendar.events.map(e=>({id:e.id,title:e.title,start:Date.parse(e.start)/1000,end:Date.parse(e.end)/1000}))}});
    const status=await bridge.postMessage({action:'taskNotificationStatus'});output.textContent='Scheduled '+mode+' notifications: '+status.scheduledCount;
   }catch(e){output.textContent='Notification test failed: '+e}}
  }
 });
 let sourceIssues=globalThis.__plannerFixtureSourceAlerts?[{id:'fixture-source-1',source:'brightspace',title:'Brightspace',message:'School source needs reconnection.'}]:[];
 if(globalThis.__plannerFixtureResetSourceAlerts){localStorage.removeItem('planner-dismissed-source-issues:planner_test');localStorage.removeItem('fixture-notifications')}
 if(globalThis.__plannerFixtureSourceAlerts)document.addEventListener('DOMContentLoaded',()=>{
  for(const [name,id] of [['Recover source',null],['Disconnect source again','fixture-source-2']]){
   const button=document.createElement('button');button.textContent=name;button.style.cssText='position:fixed;bottom:'+(id?80:120)+'px;right:0;background:white;color:black;z-index:10000';
   button.onclick=()=>{sourceIssues=id?[{id,source:'brightspace',title:'Brightspace',message:'School source needs reconnection.'}]:[];window.dispatchEvent(new Event('focus'))};document.body.append(button);
  }
 });
 const tutorChats=globalThis.__plannerFixtureTutor?['Statistics','Computer Science','Commerce and Culture'].map((title,index)=>({id:'00000000-0000-4000-8000-00000000020'+index,title,tutor_subject_id:'subject-'+index,archived:false,pinned:false,updated_at:now})):[];
 const subscriptionMessages=[]; const subscriptionFiles=new Map(); globalThis.__plannerRelayFixtureFiles=subscriptionFiles;
 const subscriptionMain={id:'00000000-0000-4000-8000-000000000101',title:'Main Chat',is_main:true,pinned:true,archived:false,deleted_at:null,created_at:now,updated_at:now};
 let subscriptionChats=[subscriptionMain];
 const fetchReal=window.fetch.bind(window);
 window.fetch=async(input,options={})=>{
  const raw=typeof input==='string'?input:input.url;const url=new URL(raw,location.href);
  if(!url.pathname.startsWith('/api/'))return fetchReal(input,options);
  const path=url.pathname,method=options.method||'GET';let value={};
  if(path.startsWith('/api/test-relay-files/')){const row=subscriptionFiles.get(path.split('/').pop());if(method==='PUT'){row.bytes=new Uint8Array(await options.body.arrayBuffer());return new Response('{}',{status:200})}return new Response(row.bytes,{headers:{'Content-Type':row.mime}})}
  else if(path==='/api/session')value={username:signedIn?'planner_test':null};
  else if(path==='/api/auth/options')value={googleEnabled:true,pendingGoogle:false};
  else if(path==='/api/login'||path==='/api/register'){signedIn=true;value={username:'planner_test',token:'fixture-session'}}
  else if(path==='/api/logout'){signedIn=false;value={ok:true}}
  else if(path==='/api/calendar/display-settings'){value=JSON.parse(localStorage.getItem('fixture-calendar-display')||'{"week":false,"month":false}');if(method==='PATCH'){Object.assign(value,JSON.parse(options.body));localStorage.setItem('fixture-calendar-display',JSON.stringify(value))}}
  else if(path==='/api/subscription-chat'){
   if(method==='POST'){
    const input=JSON.parse(options.body);
    if(input.action==='file_start'){const id=crypto.randomUUID();subscriptionFiles.set(id,{...input,id});value={id,url:location.origin+'/api/test-relay-files/'+id}}
    else if(input.action==='file_finish'){const row=subscriptionFiles.get(input.id);value={id:row.id,name:row.name,mime:row.mime,size:row.size}}
    else if(input.action==='file_download'){const row=subscriptionFiles.get(input.id);value={url:location.origin+'/api/test-relay-files/'+row.id,name:row.name}}
    else if(input.action==='create'){value={id:crypto.randomUUID(),title:input.title||'New chat',is_main:false,pinned:false,archived:false,deleted_at:null,created_at:now,updated_at:now};subscriptionChats.push(value)}
    else if(input.action==='relay_save'){if(!subscriptionMessages.some(m=>m.id===input.turnId)){subscriptionMessages.push({id:input.turnId,chat_id:input.chatId,role:'user',content:input.prompt,created_at:new Date().toISOString()},{id:crypto.randomUUID(),chat_id:input.chatId,role:'assistant',content:input.reply,created_at:new Date().toISOString()})}value={ok:true}}
    else if(input.action==='update'){const row=subscriptionChats.find(c=>c.id===input.id);Object.assign(row,input,...(input.deleted===undefined?[]:[{deleted_at:input.deleted?now:null}]));value=row}
    else return new Response(JSON.stringify({error:'ChatGPT subscription sign-in is not configured yet.'}),{status:409,headers:{'Content-Type':'application/json'}});
   }else value={chat:subscriptionChats.find(c=>c.id===url.searchParams.get('chat'))||subscriptionMain,chats:subscriptionChats,messages:subscriptionMessages.filter(m=>m.chat_id===(url.searchParams.get('chat')||subscriptionMain.id)),hasOlder:false,sources:[],google:{accounts:[],connected:false,activeAccountId:null},connection:{provider:'chatgpt-subscription',connected:false,state:'setup_required',message:'ChatGPT subscription sign-in is not configured yet.'}};
  }
  else if(path==='/api/agent/instructions')value={content:'',revision:0,updatedAt:now};
  else if(path==='/api/agent/notifications'){const stored=JSON.parse(localStorage.getItem('fixture-notifications')||'null')||[{id:'fixture-source',title:'Brightspace',message:'Reconnect this source.',kind:'source',active:true,checked:false,created_at:new Date().toISOString()}];if(method==='PATCH'){const input=JSON.parse(options.body);stored.forEach(item=>{if(item.id===input.id)item.checked=input.checked});localStorage.setItem('fixture-notifications',JSON.stringify(stored));value={ok:true}}else {if(globalThis.__plannerFixtureSourceAlerts){for(const issue of sourceIssues)if(!stored.some(item=>item.id===issue.id))stored.push({...issue,kind:'source',checked:false,created_at:new Date().toISOString()});stored.forEach(item=>{item.active=sourceIssues.some(issue=>issue.id===item.id)});localStorage.setItem('fixture-notifications',JSON.stringify(stored))}value={items:stored}}}
  else if(path==='/api/calendar/google-accounts')value={connected:true,activeAccountId:'fixture-google',accounts:[{id:'fixture-google',identity:'arin@example.com',connected:true,canEdit:true,readEnabled:true}]}
  else if(path==='/api/sources/status')value={issues:sourceIssues,checkedAt:new Date().toISOString()};
  else if(path==='/api/notifications'){if(method==='PUT')notificationSettings=JSON.parse(options.body);value=notificationSettings}
  else if(path==='/api/calendar'){if(method==='PUT'){calendar={...JSON.parse(options.body),revision:calendar.revision+1};value={ok:true,revision:calendar.revision}}else value=calendar}
  else if(path==='/api/files'){if(method==='PUT'||method==='PATCH'){const patch=JSON.parse(options.body);if(method==='PATCH'){const removed=new Set(patch.removeIds||[]);for(const section of ['files','folders','documents']){const replacements=new Map((patch.upserts?.[section]||[]).map(item=>[item.id,item]));files[section]=(files[section]||[]).filter(item=>!removed.has(item.id)).map(item=>{const next=replacements.get(item.id)||item;replacements.delete(item.id);return next});files[section].push(...replacements.values())}}else files=patch;files={...files,revision:files.revision+1};value={ok:true,revision:files.revision}}else value=files}
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
  else if(path==='/api/agent/subject-rollover')value={nextAt:'2026-12-23T14:00:00Z',basis:'After the final exam period',sources:['https://bulletins.nyu.edu/nyu/academic-calendar/'],needsNextDate:false,revision:1};
  else if(path==='/api/agent/vm/chats/tutor')value={enabled:true,count:tutorChats.length};
  else if(path==='/api/agent/vm/main')value={chat:main,jobs:[],hasMore:false};
  else if(path==='/api/agent/vm')value={power:'offline',hosts:[],chats:[main,...tutorChats],deletedChats:[],runs:[],settings:{tutor_enabled:Boolean(globalThis.__plannerFixtureTutor),ai_provider:'codex',sources:[],sites:{},schedule_enabled:false,schedule:{timezone:'America/New_York',times:[]}},accounts:[],google:{accounts:[],connected:false,configured:true,activeAccountId:null},queue:{active:null,queuedIds:[]},planning:{startedAt:now,ready:true,revision:1},provisioning:null,personalChatGptAvailable:true,hostedChatGptAvailable:false,recordings:false};
  else if(path.includes('/jobs'))value={jobs:[],hasMore:false};
  else if(path==='/api/planning')value={preferences:{intensity:20},tasks:[]};
  else value={items:[],chats:[main],jobs:[],hasMore:false};
  return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 };
})();
