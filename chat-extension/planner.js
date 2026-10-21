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
  const {type,id,message,tabId}=event.data
  if(!['hello','connect','status','send','list-tabs','select-tab','new-chat'].includes(type))return
  if(type==='send'&&(typeof id!=='string'||typeof message!=='string'||!message.trim()||message.length>12000))return
  try{connect().postMessage({type,id,message,tabId})}catch{port=null;window.postMessage({source:'planner-device-relay',type:'disconnected'},origin)}
 })
})()
