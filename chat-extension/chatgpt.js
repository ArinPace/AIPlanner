(()=>{
 if(globalThis.__plannerChatRelayLoaded)return
 globalThis.__plannerChatRelayLoaded=true
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 const visible=node=>Boolean(node.getClientRects().length)
 const composer=()=>[...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].find(n=>visible(n)&&(n.getAttribute('aria-label')==='Work with ChatGPT'||(n.getAttribute('aria-label')==='New chat in Ai Planner'&&[...document.querySelectorAll('button[aria-pressed="true"]')].some(b=>b.innerText.trim()==='Work'))))
 const running=()=>[...document.querySelectorAll('button')].some(n=>visible(n)&&/^(Stop|Stop generating|Pause|Pause task|Stop task)$/i.test(n.getAttribute('aria-label')||n.innerText.trim()))
 const responses=()=>[...document.querySelectorAll('[data-markdown-text-style="assistant-message"], [data-message-author-role="assistant"]')].filter(visible)
 let active=false,stopped=false,steering=false,lastInteraction=0
 const emit=value=>chrome.runtime.sendMessage(value).catch(()=>{})
 const buttons=()=>[...document.querySelectorAll('button,[role="menuitem"],a')].filter(visible)
 const label=n=>(n.getAttribute('aria-label')||n.innerText).trim()
 const nativeControl=action=>buttons().find(n=>!n.disabled&&(action==='pause'?/^(Pause|Pause task)$/i:action==='resume'?/^(Resume|Resume task|Continue task)$/i:/^(Stop|Stop generating|Stop task)$/i).test(label(n)))
 const attention=()=>buttons().some(n=>/^(Sign in|Sign in on web page|Approve|Approve once|Allow once|Allow access|I.m done)$/i.test(label(n)))?'ChatGPT needs website approval or secure sign-in. Open its tab to continue.':''
 const status=()=>({connected:Boolean(composer()),working:active||running(),hasDraft:[...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].some(n=>visible(n)&&n.innerText.trim()),canPause:Boolean(nativeControl('pause')),canResume:Boolean(nativeControl('resume')),canStop:Boolean(nativeControl('stop')),attention:attention()})
 async function insert(message){
  const box=composer()
  if(!box)throw Error('Sign into ChatGPT and select Work in the separate tab.')
  if(box.innerText.trim())throw Error('The ChatGPT tab contains an unsent draft. Send or clear it there first.')
  box.focus();document.execCommand('insertText',false,message)
  if(box.innerText.trim()!==message.trim())throw Error('Could not enter the complete message. Check the ChatGPT draft before retrying.')
 }
 async function sendButton(){
  for(let i=0;i<160;i++){const button=buttons().find(n=>/^(Send|Send message|Send follow-up)$/i.test(label(n))&&!n.disabled&&n.getAttribute('aria-disabled')!=='true');if(button)return button;await wait(250)}
  throw Error('ChatGPT Send is unavailable. Open its tab to finish uploading or review the draft.')
 }
 async function attach(items){
  if(!items?.length)return
  if(!Array.isArray(items)||items.length>4)throw Error('Choose up to four attachments.')
  const input=document.querySelector('input[type="file"][aria-label="Attach files"]')||[...document.querySelectorAll('input[type="file"]')].find(n=>n.multiple)
  if(!input)throw Error('ChatGPT file attachment control is unavailable. Open its tab to attach the files.')
  const transfer=new DataTransfer();let total=0
  for(const item of items){
   if(typeof item.name!=='string'||typeof item.data!=='string'||!/^data:(?:image\/(?:png|jpeg|webp)|application\/pdf|text\/plain)(?:;[^,]*)?;base64,/i.test(item.data))throw Error('Unsupported attachment format.')
   const split=item.data.indexOf(','),bytes=Uint8Array.from(atob(item.data.slice(split+1)),c=>c.charCodeAt(0));total+=bytes.length
   if(total>8*1024*1024)throw Error('Prepared attachments exceed 8 MB.')
   transfer.items.add(new File([bytes],item.name,{type:item.data.slice(5,item.data.indexOf(';'))}))
  }
  input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await wait(1000)
 }
 async function findButton(pattern){
  for(let i=0;i<40;i++){const node=buttons().find(n=>pattern.test(label(n)));if(node)return node;await wait(250)}
  throw Error('ChatGPT interface changed. Open its tab and complete the project selection there.')
 }
 async function project(){
  const expand=buttons().find(n=>label(n)==='Expand Ai Planner')
  if(expand){expand.click();await wait(400)}
  const existing=buttons().find(n=>label(n)==='New chat in Ai Planner')
  if(existing){existing.click();await wait(800);return}
  let entry=buttons().find(n=>label(n)==='Ai Planner')
  if(!entry){
   (await findButton(/^Add new project$/i)).click()
   let field
   for(let i=0;i<30&&!field;i++){field=[...document.querySelectorAll('[role="dialog"] input,input[placeholder*="project" i]')].find(visible);if(!field)await wait(200)}
   if(!field)throw Error('Open ChatGPT and create a project named Ai Planner, then retry.')
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
   setter.call(field,'Ai Planner');field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}))
   ;(await findButton(/^Create project$/i)).click()
   await wait(1200)
  }else entry.click()
  await wait(800)
 }
 async function moveToProject(){
  if(/^\/g\/g-p-[^/]+\/c\//.test(location.pathname)&&buttons().some(n=>label(n)==='Ai Planner'))return
  const current=document.querySelector('a[aria-current="page"][href*="/c/"]')
  if(!current)throw Error('Open the conversation sidebar in ChatGPT, then choose this tab again.')
  const row=current.closest('[role="group"]'),menu=row?.querySelector('button[aria-label="Chat actions"]')
  if(!menu)throw Error('ChatGPT conversation menu is unavailable.')
  menu.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse',ctrlKey:false}))
  const move=await findButton(/^Move to project$/i)
  move.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse'}));move.click()
  for(let i=0;i<40;i++){const choice=[...document.querySelectorAll('[role="menuitem"]')].find(n=>visible(n)&&label(n)==='Ai Planner');if(choice){choice.click();for(let j=0;j<40;j++){if(/^\/g\/g-p-[^/]+\/c\//.test(location.pathname))return;await wait(250)}throw Error('Could not verify the conversation moved into Ai Planner. Check ChatGPT before retrying.')}await wait(250)}
  throw Error('Ai Planner was not found in the project menu. Create it with New chat in Ai Planner first.')
 }
 chrome.runtime.onMessage.addListener((input,_sender,respond)=>{
  if(input?.type==='planner-relay-control'){
   if(!['pause','resume','stop'].includes(input.action)){respond({error:'Unknown task control.'});return}
   const button=nativeControl(input.action)
   if(!button){respond({error:'ChatGPT does not currently expose '+input.action+'. Open its tab to control this task.'});return}
   if(input.action==='stop')stopped=true
   button.click();respond({ok:true,...status()});return
  }
  if(input?.type==='planner-relay-steer'){
   if(!active&&!running()){respond({error:'No active ChatGPT task. Send this as a new message.'});return}
   if(typeof input.message!=='string'||!input.message.trim()||input.message.length>12000){respond({error:'Enter a follow-up of up to 12,000 characters.'});return}
   steering=true
   void(async()=>{try{await insert(input.message);(await sendButton()).click();lastInteraction=Date.now();respond({ok:true})}catch(error){respond({error:error.message})}finally{steering=false}})();return true
  }
  if(input?.type==='planner-relay-move-chat'){
   if(active||running()){respond({error:'Wait for ChatGPT to finish before moving this chat.'});return}
   void moveToProject().then(()=>respond({connected:Boolean(composer()),project:'Ai Planner'})).catch(error=>respond({error:error.message}))
   return true
  }
  if(input?.type==='planner-relay-new-chat'){
   if(active||running()){respond({error:'Wait for ChatGPT to finish before creating a chat.'});return}
   if([...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].some(n=>visible(n)&&n.innerText.trim())){respond({error:'The ChatGPT tab has an unsent draft. Send or clear it first.'});return}
   void(async()=>{try{await project();(await findButton(/^New chat in Ai Planner$/i)).click();await wait(1000);const work=buttons().find(n=>label(n)==='Work');if(work)work.click();for(let i=0;i<30&&!composer();i++)await wait(200);respond({connected:Boolean(composer()),project:'Ai Planner'})}catch(error){respond({error:error.message})}})()
   return true
  }
  if(input?.type==='planner-relay-status'){respond(status());return}
  if(input?.type!=='planner-relay-send')return
  if(active||running()){respond({accepted:false});void emit({type:'planner-relay-finish',id:input.id,error:'ChatGPT is already working. Check the separate conversation before resending.'});return}
  if(typeof input.message!=='string'||!input.message.trim()||input.message.length>180000)return
  active=true;stopped=false;lastInteraction=Date.now();respond({accepted:true})
  void(async()=>{
   let reply=''
   try{
    const responseKey=node=>node.closest('[data-chatgpt-selection-message-id]')?.getAttribute('data-chatgpt-selection-message-id')||node.closest('[data-message-id]')?.getAttribute('data-message-id')||node
    const baseline=new Set(responses().map(responseKey))
    // Normal DOM editing only; no account cookies, tokens or private endpoints.
    await insert(input.message)
    await attach(input.attachments)
    const send=await sendButton()
    send.click()
    let changedAt=Date.now(),lastUpdate=0
    while(true){
     const nodes=responses().filter(node=>!baseline.has(responseKey(node))),next=nodes.length?nodes.at(-1).innerText:''
     if(next!==reply){reply=next;changedAt=Date.now()}
     if(Date.now()-lastUpdate>1500){await emit({type:'planner-relay-progress',id:input.id,reply,attention:attention()});lastUpdate=Date.now()}
     if(stopped)throw Error('Stopped by the user. Changes already saved are preserved.')
     if(reply&&Date.now()-changedAt>4500&&Date.now()-lastInteraction>4500&&!steering&&!running()&&!nativeControl('resume')&&!attention())break
     await wait(1000)
    }
    await emit({type:'planner-relay-finish',id:input.id,reply})
   }catch(error){await emit({type:'planner-relay-finish',id:input.id,reply,error:String(error.message||'Relay failed.')})}
   finally{active=false}
  })()
 })
})()
