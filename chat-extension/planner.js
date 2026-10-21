(()=>{
 const origin='https://aiplanner-ten.vercel.app'
 if(location.origin!==origin)return
 let port
 function connect(){
  if(port)return port
  port=chrome.runtime.connect({name:'planner-chat-relay'})
  port.onMessage.addListener(message=>window.postMessage({source:'planner-device-relay',...message},origin))
  port.onDisconnect.addListener(()=>{port=null;window.postMessage({source:'planner-device-relay',type:'disconnected'},origin)})
  return port
 }
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==origin||event.data?.source!=='planner-chat-tab')return
  const {type,id,message,tabId,url,action,attachments,chatId}=event.data
  if(!['hello','connect','status','send','list-tabs','select-tab','new-chat','open-chat','control','steer','hide-chat'].includes(type))return
  if(['send','steer'].includes(type)&&(typeof id!=='string'||typeof message!=='string'||!message.trim()||message.length>180000))return
  try{connect().postMessage({type,id,message,tabId,url,action,attachments,chatId})}catch{port=null;window.postMessage({source:'planner-device-relay',type:'disconnected'},origin)}
 })
})()
