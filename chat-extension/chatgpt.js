(()=>{
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 const visible=node=>Boolean(node.getClientRects().length)
 const composer=()=>[...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].find(n=>visible(n)&&n.getAttribute('aria-label')==='Work with ChatGPT')
 const running=()=>[...document.querySelectorAll('button')].some(n=>visible(n)&&/^(Stop|Stop generating|Pause|Stop task)$/i.test(n.getAttribute('aria-label')||n.innerText.trim()))
 const responses=()=>[...document.querySelectorAll('[data-markdown-text-style="assistant-message"], [data-message-author-role="assistant"]')].filter(visible)
 let active=false
 const emit=value=>chrome.runtime.sendMessage(value).catch(()=>{})
 chrome.runtime.onMessage.addListener((input,_sender,respond)=>{
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
    const baseline=responses().length
    // Normal DOM editing only; no account cookies, tokens or private endpoints.
    box.focus();document.execCommand('insertText',false,input.message)
    if(box.innerText.trim()!==input.message.trim())throw Error('Could not enter the complete message. Check the ChatGPT draft before retrying.')
    await wait(150)
    const send=[...document.querySelectorAll('button')].find(n=>visible(n)&&n.getAttribute('aria-label')==='Send'&&!n.disabled)
    if(!send)throw Error('ChatGPT Send is unavailable. Check the separate tab.')
    send.click()
    let changedAt=Date.now(),lastUpdate=0
    while(true){
     const nodes=responses(),next=nodes.length>baseline?nodes.at(-1).innerText:''
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
