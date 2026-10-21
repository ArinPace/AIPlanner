const plannerOrigin='https://aiplanner-ten.vercel.app'
const validChat=url=>{try{return new URL(url).origin==='https://chatgpt.com'}catch{return false}}
async function target(plannerTab){
 const key='chatTab:'+plannerTab,urlKey='chatUrl:'+plannerTab,entry=await chrome.storage.session.get([key,urlKey]),id=entry[key]
 if(typeof id!=='number')return null
 try{const tab=await chrome.tabs.get(id);return validChat(tab.url)&&(!entry[urlKey]||entry[urlKey]===tab.url)?tab:null}catch{return null}
}
chrome.runtime.onConnect.addListener(port=>{
 if(port.name!=='planner-chat-relay'||!port.sender?.tab||new URL(port.sender.url).origin!==plannerOrigin){port.disconnect();return}
 const plannerTab=port.sender.tab.id
 const reply=value=>{try{port.postMessage(value)}catch{/* Planner was closed; never resend the request. */}}
 port.onMessage.addListener(async message=>{
  try{
   if(message.type==='connect'){
    let tab=await target(plannerTab)
    if(!tab){tab=await chrome.tabs.create({url:'https://chatgpt.com/',active:true});await chrome.storage.session.set({['chatTab:'+plannerTab]:tab.id});await chrome.storage.session.remove('chatUrl:'+plannerTab)}
    else await chrome.tabs.update(tab.id,{active:true})
    reply({type:'ready',installed:true,connected:false});return
   }
   const tab=await target(plannerTab)
   if(message.type==='send'){
    if(!tab)throw Error('Connect a ChatGPT tab first.')
    const bound=(await chrome.storage.session.get('chatUrl:'+plannerTab))['chatUrl:'+plannerTab]
    if(!bound&&new URL(tab.url).pathname!=='/')throw Error('Start a new blank Work conversation in the separate ChatGPT tab. Existing chats are not used by this experiment.')
    if(typeof message.id!=='string'||typeof message.message!=='string'||message.message.length>12000)throw Error('Invalid message.')
    const sentKey='sent:'+plannerTab+':'+message.id
    if((await chrome.storage.session.get(sentKey))[sentKey])throw Error('This message may already have been sent. Check ChatGPT before resending.')
    await chrome.storage.session.set({[sentKey]:true})
    await chrome.tabs.sendMessage(tab.id,{type:'planner-relay-send',id:message.id,message:message.message})
    return
   }
   if(['hello','status'].includes(message.type)){
    let status={connected:false}
    if(tab)status=await chrome.tabs.sendMessage(tab.id,{type:'planner-relay-status'}).catch(()=>status)
    reply({type:'ready',installed:true,...status})
    const saved=(await chrome.storage.session.get('outcome:'+plannerTab))['outcome:'+plannerTab]
    if(saved)reply(saved)
   }
  }catch(error){reply({type:'error',id:message.id,error:String(error.message||'Browser relay unavailable.')})}
 })
 const listener=(message,sender)=>{
  if(!['planner-relay-progress','planner-relay-finish'].includes(message?.type)||!validChat(sender.url))return
  void target(plannerTab).then(tab=>{
   if(sender.tab?.id!==tab?.id)return
   if(/^\/c\/[a-z0-9-]+$/i.test(new URL(tab.url).pathname))void chrome.storage.session.set({['chatUrl:'+plannerTab]:tab.url})
   const output={type:message.type==='planner-relay-finish'?'finish':'progress',id:message.id,reply:message.reply,error:message.error}
   if(output.type==='finish')void chrome.storage.session.set({['outcome:'+plannerTab]:output})
   reply(output)
  })
 }
 chrome.runtime.onMessage.addListener(listener)
 port.onDisconnect.addListener(()=>chrome.runtime.onMessage.removeListener(listener))
})
