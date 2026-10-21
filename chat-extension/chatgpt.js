(()=>{
 if(globalThis.__plannerChatRelayLoaded)return
 globalThis.__plannerChatRelayLoaded=true
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 const visible=node=>Boolean(node.getClientRects().length)
 const composer=()=>[...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].find(n=>visible(n)&&(n.getAttribute('aria-label')==='Work with ChatGPT'||(n.getAttribute('aria-label')==='New chat in Ai Planner'&&[...document.querySelectorAll('button[aria-pressed="true"]')].some(b=>b.innerText.trim()==='Work'))))
 const running=()=>[...document.querySelectorAll('button')].some(n=>visible(n)&&/^(Stop|Stop generating|Pause|Stop task)$/i.test(n.getAttribute('aria-label')||n.innerText.trim()))
 const responses=()=>[...document.querySelectorAll('[data-markdown-text-style="assistant-message"], [data-message-author-role="assistant"]')].filter(visible)
 let active=false
 const emit=value=>chrome.runtime.sendMessage(value).catch(()=>{})
 const buttons=()=>[...document.querySelectorAll('button,[role="menuitem"],a')].filter(visible)
 const label=n=>(n.getAttribute('aria-label')||n.innerText).trim()
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
  if(input?.type==='planner-relay-move-chat'){
   if(active||running()){respond({error:'Wait for ChatGPT to finish before moving this chat.'});return}
   void moveToProject().then(()=>respond({connected:Boolean(composer()),project:'Ai Planner'})).catch(error=>respond({error:error.message}))
   return true
  }
  if(input?.type==='planner-relay-new-chat'){
   if(active||running()){respond({error:'Wait for ChatGPT to finish before creating a chat.'});return}
   if(composer()?.innerText.trim()){respond({error:'The ChatGPT tab has an unsent draft. Send or clear it first.'});return}
   void(async()=>{try{await project();(await findButton(/^New chat in Ai Planner$/i)).click();await wait(1000);const work=buttons().find(n=>label(n)==='Work');if(work)work.click();for(let i=0;i<30&&!composer();i++)await wait(200);respond({connected:Boolean(composer()),project:'Ai Planner'})}catch(error){respond({error:error.message})}})()
   return true
  }
  if(input?.type==='planner-relay-status'){respond({connected:Boolean(composer()),working:active||running()});return}
  if(input?.type!=='planner-relay-send')return
  if(active||running()){respond({accepted:false});void emit({type:'planner-relay-finish',id:input.id,error:'ChatGPT is already working. Check the separate conversation before resending.'});return}
  if(typeof input.message!=='string'||!input.message.trim()||input.message.length>12000)return
  active=true;respond({accepted:true})
  void(async()=>{
   let reply=''
   try{
    const box=composer()
    if(!box)throw Error('Sign into ChatGPT and select Work in the separate tab, then return to Planner.')
    if(box.innerText.trim())throw Error('The ChatGPT tab contains an unsent draft. Send or clear it there first.')
    const responseKey=node=>node.closest('[data-chatgpt-selection-message-id]')?.getAttribute('data-chatgpt-selection-message-id')||node.closest('[data-message-id]')?.getAttribute('data-message-id')||node
    const baseline=new Set(responses().map(responseKey))
    // Normal DOM editing only; no account cookies, tokens or private endpoints.
    box.focus();document.execCommand('insertText',false,input.message)
    if(box.innerText.trim()!==input.message.trim())throw Error('Could not enter the complete message. Check the ChatGPT draft before retrying.')
    await wait(150)
    const send=[...document.querySelectorAll('button')].find(n=>visible(n)&&n.getAttribute('aria-label')==='Send'&&!n.disabled)
    if(!send)throw Error('ChatGPT Send is unavailable. Check the separate tab.')
    send.click()
    let changedAt=Date.now(),lastUpdate=0
    while(true){
     const nodes=responses().filter(node=>!baseline.has(responseKey(node))),next=nodes.length?nodes.at(-1).innerText:''
     if(next!==reply){reply=next;changedAt=Date.now()}
     if(Date.now()-lastUpdate>1500){await emit({type:'planner-relay-progress',id:input.id,reply});lastUpdate=Date.now()}
     if(reply&&Date.now()-changedAt>4500&&!running())break
     if(!composer())throw Error('ChatGPT needs attention. Open its tab before resending.')
     await wait(1000)
    }
    await emit({type:'planner-relay-finish',id:input.id,reply})
   }catch(error){await emit({type:'planner-relay-finish',id:input.id,reply,error:String(error.message||'Relay failed.')})}
   finally{active=false}
  })()
 })
})()
