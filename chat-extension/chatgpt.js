(()=>{
 if(globalThis.__plannerChatRelayLoaded==='0.3.6')return
 globalThis.__plannerChatRelayLoaded='0.3.6'
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 const visible=node=>Boolean(node.getClientRects().length)
 const composer=()=>[...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].find(n=>visible(n)&&(n.getAttribute('aria-label')==='Work with ChatGPT'||(n.getAttribute('aria-label')==='New chat in Ai Planner'&&[...document.querySelectorAll('button[aria-pressed="true"]')].some(b=>b.innerText.trim()==='Work'))))
 const running=()=>[...document.querySelectorAll('button')].some(n=>visible(n)&&/^(Stop|Stop generating|Pause|Pause task|Stop task)$/i.test(n.getAttribute('aria-label')||n.innerText.trim()))
 const responses=()=>[...document.querySelectorAll('[data-markdown-text-style="assistant-message"], [data-message-author-role="assistant"]')].filter(visible)
 // Rendered innerText drops code fences and table structure. Planner's tool
 // protocol needs the fence, and user replies need their Markdown formatting.
 const responseText=root=>{
  const walk=node=>{
   if(node.nodeType===Node.TEXT_NODE)return node.textContent
   if(node.nodeType!==Node.ELEMENT_NODE)return ''
   const tag=node.tagName.toLowerCase()
   if(['button','svg','style','script'].includes(tag)||node.getAttribute('aria-hidden')==='true'||node.getAttribute('data-markdown-copy')==='exclude')return ''
   if(tag==='pre'||node.getAttribute('data-code-block')==='true'){
    const code=node.querySelector('code')||node,raw=code.textContent.trim()
    let language=code.className?.match?.(/language-([\w-]+)/)?.[1]||node.getAttribute('data-language')||''
    try{const data=JSON.parse(raw);if(typeof data.turn==='string'&&Array.isArray(data.calls))language='planner-tools'}catch{}
    return '\n\n```'+language+'\n'+raw+'\n```\n\n'
   }
   if(tag==='table'){
    const rows=[...node.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')].map(cell=>walk(cell).trim().replaceAll('|','\\|').replace(/\n+/g,' ')))
    if(!rows.length)return ''
    const line=row=>'| '+row.join(' | ')+' |'
    return '\n\n'+[line(rows[0]),line(rows[0].map(()=>'---')),...rows.slice(1).map(line)].join('\n')+'\n\n'
   }
   const text=[...node.childNodes].map(walk).join('')
   if(tag==='br')return '\n'
   if(tag==='strong'||tag==='b')return '**'+text+'**'
   if(tag==='em'||tag==='i')return '*'+text+'*'
   if(tag==='code')return '`'+text+'`'
   if(tag==='a'){const href=node.getAttribute('href');return href&&/^https?:/.test(href)?'['+text+']('+href+')':text}
   if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+text+'\n\n'
   if(tag==='li')return '\n'+(node.parentElement?.tagName==='OL'?Array.from(node.parentElement.children).indexOf(node)+1+'. ':'- ')+text.trim()+'\n'
   if(['p','div','section','ul','ol','blockquote'].includes(tag))return '\n'+text+'\n'
   return text
  }
  return walk(root).replace(/\n{3,}/g,'\n\n').trim()||root.innerText
 }
 let active=false,stopped=false,steering=false,lastInteraction=0
 const emit=value=>chrome.runtime.sendMessage(value).catch(()=>{})
 const buttons=()=>[...document.querySelectorAll('button,[role="menuitem"],[role="option"],a')].filter(visible)
 const label=n=>(n.getAttribute('aria-label')||n.innerText).trim()
 const nativeControl=action=>buttons().find(n=>!n.disabled&&(action==='pause'?/^(Pause|Pause task)$/i:action==='resume'?/^(Resume|Resume task|Continue task)$/i:/^(Stop|Stop generating|Stop task)$/i).test(label(n)))
 const fileCards=()=>{
  const found=new Map()
  for(const message of document.querySelectorAll('[data-chatgpt-selection-message-id]')){
   for(const preview of message.querySelectorAll('button[aria-label^="Open preview of "]')){
    const name=preview.getAttribute('aria-label').slice(16).trim(),row=preview.closest('[class~="group/resource-row"]'),button=row?.querySelector('button[aria-label="Download file"]')
    const key=message.getAttribute('data-chatgpt-selection-message-id')
    if(key&&name&&name.length<=300&&button&&!button.disabled)found.set(key+'::'+name,{id:key+'::'+name,name,button})
   }
  }
  return [...found.values()].slice(-20)
 }
 const attention=()=>{
  const controls=buttons().map(label)
  // Detect the form without ever reading credential field values.
  if([...document.querySelectorAll('input[type="password"]')].some(visible))return 'Secure sign-in is waiting in ChatGPT. Enter credentials there; this Planner task will continue afterward.'
  if(controls.some(text=>/^(Sign in|Sign in on web page|Take over to sign in)$/i.test(text)))return 'Website sign-in needed. Open ChatGPT and use its secure form or take over its cloud browser.'
  if(controls.some(text=>/^I.m done$/i.test(text)))return 'Finish signing in in ChatGPT’s cloud browser, then choose I’m done. This Planner task will continue.'
  if(controls.some(text=>/^(Approve|Approve once|Allow once|Allow access)$/i.test(text)))return 'ChatGPT needs your website approval. Open ChatGPT to continue.'
  return ''
 }
 const status=()=>({connected:Boolean(composer()),working:active||running(),hasDraft:[...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].some(n=>visible(n)&&n.innerText.trim()),canPause:Boolean(nativeControl('pause')),canResume:Boolean(nativeControl('resume')),canStop:Boolean(nativeControl('stop')),attention:attention(),downloads:fileCards().map(({id,name})=>({id,name}))})
 const signInWindow=()=>{
  if(document.getElementById('planner-return-control'))return {ok:true}
  const host=document.createElement('div');host.id='planner-return-control'
  host.style.cssText='position:fixed;right:12px;top:8px;z-index:2147483647'
  const root=host.attachShadow({mode:'closed'}),button=document.createElement('button')
  button.textContent='Return to AI Planner'
  button.style.cssText='font:14px system-ui;padding:8px 12px;border-radius:20px;border:1px solid #888;background:#fff;color:#111;cursor:pointer;box-shadow:0 2px 8px #0003'
  button.title='Returns to Planner without closing this ChatGPT task. Finish the native sign-in flow first.'
  button.onclick=async()=>{try{const result=await chrome.runtime.sendMessage({type:'planner-relay-v036-return-planner'});if(result?.error)button.textContent=result.error}catch{button.textContent='Open your Planner window to return'}}
  root.append(button);document.body.append(host);return {ok:true}
 }
 async function insert(message){
  const box=composer()
  if(!box)throw Error('Sign into ChatGPT and select Work in the separate tab.')
  if(box.innerText.trim())throw Error('The ChatGPT tab contains an unsent draft. Send or clear it there first.')
  box.focus();document.execCommand('insertText',false,message)
  // ProseMirror renders paragraph boundaries as extra blank lines in innerText.
  // Compare normalized line breaks, retaining all words and indentation.
  const normalize=text=>text.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/\n+/g,'\n').trim()
  if(normalize(box.innerText)!==normalize(message))throw Error('Could not enter the complete message. Check the ChatGPT draft before retrying.')
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
  input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))
  // Setting input.files proves only that the browser received the bytes, not
  // that ChatGPT accepted the upload. Require a rendered attachment for each.
  const attached=name=>[...document.querySelectorAll('[title],[aria-label],span,div,p')].some(n=>visible(n)&&!n.closest('[contenteditable="true"],[data-markdown-text-style="assistant-message"],[data-message-author-role]')&&(n.getAttribute('title')===name||n.getAttribute('aria-label')===name||(!n.children.length&&n.textContent.trim()===name)))
  for(let attempt=0;attempt<240;attempt++){
   if(items.every(item=>attached(item.name)))return
   await wait(250)
  }
  throw Error('ChatGPT did not confirm every attachment. The message was not sent. Open ChatGPT to review the upload before retrying.')
 }
 async function findButton(pattern,attempts=40){
  for(let i=0;i<attempts;i++){const node=buttons().find(n=>pattern.test(label(n)));if(node)return node;await wait(250)}
  throw Error('ChatGPT interface changed. Open its tab and complete the project selection there.')
 }
 async function project(){
  const choose=buttons().find(n=>label(n)==='Choose project')
  if(choose){
   choose.click()
   const option=await findButton(/^Ai Planner$/i,120)
   option.click()
   for(let i=0;i<40;i++){if(document.querySelector('[role="textbox"][aria-label="New chat in Ai Planner"]'))return;await wait(250)}
   throw Error('Could not verify Ai Planner project selection.')
  }
  if(document.querySelector('[role="textbox"][aria-label="New chat in Ai Planner"]'))return
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
  if(/^\/g\/g-p-[^/]+-ai-planner\/c\//i.test(location.pathname)||(/^\/g\/g-p-[^/]+\/c\//.test(location.pathname)&&buttons().some(n=>label(n)==='Ai Planner'||n.innerText.trim()==='Ai Planner')))return
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
  if(input?.type==='planner-relay-v036-download'){
   const file=fileCards().find(file=>file.id===input.fileId)
   if(!file){respond({error:'This file is not loaded in the connected ChatGPT conversation. Open ChatGPT and load its response, then try again.'});return}
   file.button.click();respond({ok:true});return
  }
  if(input?.type==='planner-relay-v036-control'){
   if(!['pause','resume','stop'].includes(input.action)){respond({error:'Unknown task control.'});return}
   const button=nativeControl(input.action)
   if(!button){respond({error:'ChatGPT does not currently expose '+input.action+'. Open its tab to control this task.'});return}
   if(input.action==='stop')stopped=true
   button.click();respond({ok:true,...status()});return
  }
  if(input?.type==='planner-relay-v036-steer'){
   if(!active&&!running()){respond({error:'No active ChatGPT task. Send this as a new message.'});return}
   if(typeof input.message!=='string'||!input.message.trim()||input.message.length>12000){respond({error:'Enter a follow-up of up to 12,000 characters.'});return}
   steering=true
   void(async()=>{try{await insert(input.message);(await sendButton()).click();lastInteraction=Date.now();respond({ok:true})}catch(error){respond({error:error.message})}finally{steering=false}})();return true
  }
  if(input?.type==='planner-relay-v036-move-chat'){
   if(active||running()){respond({error:'Wait for ChatGPT to finish before moving this chat.'});return}
   void moveToProject().then(()=>respond({connected:Boolean(composer()),project:'Ai Planner'})).catch(error=>respond({error:error.message}))
   return true
  }
  if(input?.type==='planner-relay-v036-new-chat'){
   if(active||running()){respond({error:'Wait for ChatGPT to finish before creating a chat.'});return}
   if([...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].some(n=>visible(n)&&n.innerText.trim())){respond({error:'The ChatGPT tab has an unsent draft. Send or clear it first.'});return}
   void(async()=>{try{if(!document.querySelector('[role="textbox"][aria-label="New chat in Ai Planner"]'))await findButton(/^(Choose project|New chat in Ai Planner|Ai Planner|Change project: Ai Planner|Add new project)$/i,160);await project();const fresh=buttons().find(n=>label(n)==='New chat in Ai Planner');if(fresh)fresh.click();await wait(1000);const work=buttons().find(n=>label(n)==='Work');if(work&&work.getAttribute('aria-pressed')!=='true')work.click();for(let i=0;i<30&&!composer();i++)await wait(200);if(!composer())throw Error('ChatGPT Work composer is unavailable.');respond({connected:true,project:'Ai Planner'})}catch(error){respond({error:error.message})}})()
   return true
  }
  if(input?.type==='planner-relay-v036-sign-in-window'){respond(signInWindow());return}
  if(input?.type==='planner-relay-v036-status'){respond(status());return}
  if(input?.type!=='planner-relay-v036-send')return
  if(active||running()){respond({accepted:false});void emit({type:'planner-relay-v036-finish',id:input.id,error:'ChatGPT is already working. Check the separate conversation before resending.'});return}
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
     const nodes=responses().filter(node=>!baseline.has(responseKey(node))),next=nodes.length?responseText(nodes.at(-1)):''
     if(next!==reply){reply=next;changedAt=Date.now()}
     if(Date.now()-lastUpdate>1500){await emit({type:'planner-relay-v036-progress',id:input.id,reply,attention:attention()});lastUpdate=Date.now()}
     if(stopped)throw Error('Stopped by the user. Changes already saved are preserved.')
     if(reply&&Date.now()-changedAt>4500&&Date.now()-lastInteraction>4500&&!steering&&!running()&&!nativeControl('resume')&&!attention())break
     await wait(1000)
    }
    await emit({type:'planner-relay-v036-finish',id:input.id,reply})
   }catch(error){await emit({type:'planner-relay-v036-finish',id:input.id,reply,error:String(error.message||'Relay failed.')})}
   finally{active=false}
  })()
 })
})()
