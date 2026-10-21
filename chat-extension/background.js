const plannerOrigin='https://aiplanner-ten.vercel.app'
const validChat=url=>{try{return new URL(url).origin==='https://chatgpt.com'}catch{return false}}
const chatLocation=url=>{const u=new URL(url);return u.origin+u.pathname}
const chatIdentity=url=>{const path=new URL(url).pathname;return path.match(/\/c\/([a-z0-9-]+)/i)?.[1]||path.replace(/(\/g\/g-p-[a-f0-9]{32})[^/]+/i,'$1')}
async function pageStatus(tab){
 try{return await chrome.tabs.sendMessage(tab.id,{type:'planner-relay-v035-status'})}
 catch{
  // Existing tabs may predate installation. Inject only into the selected ChatGPT tab.
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['chatgpt.js']})
  return chrome.tabs.sendMessage(tab.id,{type:'planner-relay-v035-status'})
 }
}
async function target(plannerTab){
 const key='chatTab:'+plannerTab,urlKey='chatUrl:'+plannerTab,entry=await chrome.storage.session.get([key,urlKey]),id=entry[key]
 if(typeof id!=='number')return null
 try{const tab=await chrome.tabs.get(id);return validChat(tab.url)&&(!entry[urlKey]||chatIdentity(entry[urlKey])===chatIdentity(tab.url))?tab:null}catch{return null}
}
const ports=new Map()
const opening=new Set()
async function projectStart(){
 const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'})
 for(const tab of tabs){const match=new URL(tab.url).pathname.match(/^\/g\/(g-p-[a-f0-9]{32}-ai-planner)\/(?:project|c\/)/i);if(match){const url='https://chatgpt.com/g/'+match[1]+'/project';await chrome.storage.local.set({plannerProjectUrl:url});return url}}
 const saved=(await chrome.storage.local.get('plannerProjectUrl')).plannerProjectUrl
 if(typeof saved==='string'&&/^https:\/\/chatgpt\.com\/g\/g-p-[a-f0-9]{32}-ai-planner\/project$/i.test(saved))return saved
 return 'https://chatgpt.com/'
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(!['planner-relay-v035-progress','planner-relay-v035-finish'].includes(message?.type)||!validChat(sender.url)||!sender.tab)return
 void(async()=>{
  const saved=await chrome.storage.session.get(null),tab=await chrome.tabs.get(sender.tab.id)
  for(const [key,id] of Object.entries(saved)){
   if(!key.startsWith('chatTab:')||id!==sender.tab.id)continue
   const plannerTab=Number(key.slice(8)),url=chatLocation(tab.url)
   if(/^\/(?:g\/[^/]+\/)?c\/[a-z0-9-]+$/i.test(new URL(url).pathname))await chrome.storage.session.set({['chatUrl:'+plannerTab]:url})
   const output={type:message.type==='planner-relay-v035-finish'?'finish':'progress',id:message.id,reply:message.reply,error:message.error,url,attention:message.attention}
   if(output.type==='finish')await chrome.storage.session.set({['outcome:'+plannerTab]:output})
   for(const port of ports.get(plannerTab)||[])try{port.postMessage(output)}catch{}
  }
  respond({ok:true})
 })().catch(()=>respond({ok:false}))
 return true
})
chrome.runtime.onConnect.addListener(port=>{
 if(port.name!=='planner-chat-relay'||!port.sender?.tab||new URL(port.sender.url).origin!==plannerOrigin){port.disconnect();return}
 const plannerTab=port.sender.tab.id
 if(!ports.has(plannerTab))ports.set(plannerTab,new Set())
 ports.get(plannerTab).add(port)
 const reply=value=>{try{port.postMessage(value)}catch{/* Planner was closed; never resend the request. */}}
 port.onMessage.addListener(async message=>{
  try{
   if(message.type==='open-chat'){
    if(!validChat(message.url)||!/^\/g\/g-p-[^/]+\/c\/[a-z0-9-]+\/?$/i.test(new URL(message.url).pathname))throw Error('Choose a saved Planner project conversation.')
    let tab=await target(plannerTab)
    if(tab){const status=await pageStatus(tab);if(status.working)throw Error('Wait for the current ChatGPT task to finish.');if(status.hasDraft)throw Error('Send or clear the ChatGPT draft before switching.');tab=await chrome.tabs.update(tab.id,{url:message.url})}
    else tab=await chrome.tabs.create({url:message.url,active:false})
    await chrome.storage.session.set({['chatTab:'+plannerTab]:tab.id,['chatUrl:'+plannerTab]:chatLocation(message.url),['plannerChat:'+plannerTab]:message.chatId||null})
    await chrome.storage.session.remove('outcome:'+plannerTab)
    reply({type:'ready',installed:true,connected:false,chatId:message.chatId,url:message.url,reason:'Opening the saved ChatGPT conversation. Check connection when it finishes loading.'});return
   }
   if(message.type==='new-chat'){
    if(opening.has(plannerTab))throw Error('ChatGPT is still opening this conversation. Wait until it is connected.')
    opening.add(plannerTab)
    try{
    const start=await projectStart()
    let tab=await target(plannerTab)
    if(tab){const status=await pageStatus(tab);if(status.working)throw Error('Wait for the current ChatGPT task to finish.');if(status.hasDraft)throw Error('Send or clear the ChatGPT draft before creating a chat.');await chrome.storage.session.remove('chatUrl:'+plannerTab);tab=await chrome.tabs.update(tab.id,{url:start});await new Promise(resolve=>setTimeout(resolve,1000))}
    if(!tab){tab=await chrome.tabs.create({url:start,active:false});await chrome.storage.session.set({['chatTab:'+plannerTab]:tab.id});await chrome.storage.session.remove('chatUrl:'+plannerTab)}
    for(let attempt=0;attempt<30;attempt++){
     try{await pageStatus(await chrome.tabs.get(tab.id));break}catch(error){if(attempt===29)throw error;await new Promise(resolve=>setTimeout(resolve,300))}
    }
    const result=await chrome.tabs.sendMessage(tab.id,{type:'planner-relay-v035-new-chat'})
    if(result.error)throw Error(result.error)
    tab=await chrome.tabs.get(tab.id)
    await chrome.storage.session.set({['chatUrl:'+plannerTab]:chatLocation(tab.url)})
    await chrome.storage.session.set({['plannerChat:'+plannerTab]:message.chatId||null})
    await chrome.storage.session.remove('outcome:'+plannerTab)
    reply({type:'ready',installed:true,...result,chatId:message.chatId,url:chatLocation(tab.url),reason:'New chat ready in Ai Planner.'});return
    }finally{opening.delete(plannerTab)}
   }
   if(message.type==='list-tabs'){
    const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'})
    reply({type:'tabs',tabs:tabs.filter(tab=>validChat(tab.url)).map(tab=>({id:tab.id,title:tab.title||'ChatGPT',url:chatLocation(tab.url)}))});return
   }
   if(message.type==='select-tab'){
    if(!Number.isInteger(message.tabId))throw Error('Choose a ChatGPT tab.')
    const selected=await chrome.tabs.get(message.tabId)
    if(!validChat(selected.url))throw Error('Only a ChatGPT tab can be connected.')
    const bound=new URL(selected.url).pathname==='/'?null:chatLocation(selected.url)
    await chrome.storage.session.set({['chatTab:'+plannerTab]:selected.id})
    if(bound)await chrome.storage.session.set({['chatUrl:'+plannerTab]:bound})
    else await chrome.storage.session.remove('chatUrl:'+plannerTab)
    await chrome.storage.session.remove('outcome:'+plannerTab)
    const status=await pageStatus(selected)
    if(/\/(?:g\/[^/]+\/)?c\//.test(new URL(selected.url).pathname)){
     const moved=await chrome.tabs.sendMessage(selected.id,{type:'planner-relay-v035-move-chat'})
     if(moved.error)throw Error(moved.error)
     const updated=await chrome.tabs.get(selected.id)
     await chrome.storage.session.set({['chatUrl:'+plannerTab]:chatLocation(updated.url)})
    }
    await chrome.storage.session.set({['plannerChat:'+plannerTab]:message.chatId||null})
    reply({type:'ready',installed:true,connected:status.connected===true,chatId:message.chatId,url:chatLocation((await chrome.tabs.get(selected.id)).url),selectedTitle:selected.title||'ChatGPT',reason:status.connected?'Existing ChatGPT Work tab connected in Ai Planner.':'Selected tab is linked. Sign in and select Work there, then check again.'});return
   }
   if(message.type==='connect'){
    let tab=await target(plannerTab)
    if(!tab){tab=await chrome.tabs.create({url:'https://chatgpt.com/',active:true});await chrome.storage.session.set({['chatTab:'+plannerTab]:tab.id});await chrome.storage.session.remove('chatUrl:'+plannerTab)}
    else {await chrome.windows.update(tab.windowId,{state:'normal',focused:true});await chrome.tabs.update(tab.id,{active:true})}
    reply({type:'ready',installed:true,connected:false,reason:'A separate ChatGPT tab is open. Sign in and select Work there, then return to Planner.'});return
   }
   let tab=await target(plannerTab)
   if(message.type==='download'){
    if(!tab||typeof message.fileId!=='string'||message.fileId.length>700)throw Error('Choose a file in the connected ChatGPT conversation.')
    await pageStatus(tab)
    const result=await chrome.tabs.sendMessage(tab.id,{type:'planner-relay-v035-download',fileId:message.fileId})
    if(result.error)throw Error(result.error)
    reply({type:'controlled',action:'download'});return
   }
   if(message.type==='hide-chat'){
    if(!tab)throw Error('Connect a ChatGPT tab first.')
    await chrome.tabs.update(tab.id,{autoDiscardable:false})
    const window=await chrome.windows.get(tab.windowId,{populate:true})
    if(window.type==='popup'&&window.tabs?.length===1)await chrome.windows.update(window.id,{state:'minimized'})
    else {const parked=await chrome.windows.create({tabId:tab.id,type:'popup',focused:false});await chrome.windows.update(parked.id,{state:'minimized'})}
    reply({type:'controlled',action:'hide-chat'});return
   }
   if(['control','steer'].includes(message.type)){
    if(!tab)throw Error('Connect the ChatGPT tab first.')
    await pageStatus(tab)
    const result=await chrome.tabs.sendMessage(tab.id,{type:message.type==='control'?'planner-relay-v035-control':'planner-relay-v035-steer',action:message.action,id:message.id,message:message.message})
    if(result.error)throw Error(result.error)
    reply({type:'controlled',id:message.id,action:message.type==='steer'?'steer':message.action,...result});return
   }
   if(message.type==='send'){
    if(opening.has(plannerTab))throw Error('ChatGPT is still opening this conversation. Wait until it is connected, then send again.')
    if(!tab)throw Error('Connect a ChatGPT tab first.')
    const mapped=(await chrome.storage.session.get('plannerChat:'+plannerTab))['plannerChat:'+plannerTab]
    if(mapped&&message.chatId&&mapped!==message.chatId)throw Error('Open this chat from the chat list before sending. The connected ChatGPT tab belongs to another Planner chat.')
    if(message.chatId)await chrome.storage.session.set({['plannerChat:'+plannerTab]:message.chatId})
    const bound=(await chrome.storage.session.get('chatUrl:'+plannerTab))['chatUrl:'+plannerTab]
   if(!bound&&new URL(tab.url).pathname!=='/')throw Error('Choose Use existing tab to explicitly connect this conversation before sending.')
    if(typeof message.id!=='string'||typeof message.message!=='string'||message.message.length>180000)throw Error('Invalid message.')
    await pageStatus(tab)
    if(!/^\/g\/g-p-[^/]+\/(?:project|c\/)/.test(new URL(tab.url).pathname)){
     const preparation=await chrome.tabs.sendMessage(tab.id,{type:/\/c\//.test(new URL(tab.url).pathname)?'planner-relay-v035-move-chat':'planner-relay-v035-new-chat'})
     if(preparation.error)throw Error(preparation.error)
     tab=await chrome.tabs.get(tab.id)
     await chrome.storage.session.set({['chatUrl:'+plannerTab]:chatLocation(tab.url)})
    }
    const sentKey='sent:'+plannerTab+':'+message.id
    if((await chrome.storage.session.get(sentKey))[sentKey])throw Error('This message may already have been sent. Check ChatGPT before resending.')
    await chrome.storage.session.set({[sentKey]:true})
    await chrome.tabs.sendMessage(tab.id,{type:'planner-relay-v035-send',id:message.id,message:message.message,attachments:message.attachments})
    return
   }
   if(['hello','status'].includes(message.type)){
    if(opening.has(plannerTab)){reply({type:'ready',installed:true,extensionVersion:chrome.runtime.getManifest().version,connected:false,reason:'Opening ChatGPT in Ai Planner. Wait for project setup to finish.'});return}
    let status={connected:false}
    if(tab)status=await pageStatus(tab).catch(()=>({connected:false,reason:'The selected ChatGPT tab needs to be reloaded. Reload it, select Work and check again.'}))
    else status.reason='Extension detected. Choose Use existing tab, or Connect ChatGPT tab to open a new one.'
    const chatId=(await chrome.storage.session.get('plannerChat:'+plannerTab))['plannerChat:'+plannerTab]
    reply({type:'ready',installed:true,extensionVersion:chrome.runtime.getManifest().version,chatId,url:tab?chatLocation(tab.url):null,...status})
    const saved=(await chrome.storage.session.get('outcome:'+plannerTab))['outcome:'+plannerTab]
    if(saved)reply(saved)
   }
  }catch(error){reply({type:'error',id:message.id,error:String(error.message||'Browser relay unavailable.')})}
 })
 port.onDisconnect.addListener(()=>{const set=ports.get(plannerTab);set?.delete(port);if(!set?.size)ports.delete(plannerTab)})
})
