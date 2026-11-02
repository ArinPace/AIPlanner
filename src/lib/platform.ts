type NativeMessage={action:string;[key:string]:unknown}
declare global {interface Window {plannerNativeScreenTime?:boolean;webkit?:{messageHandlers?:{plannerNative?:{postMessage:(message:NativeMessage)=>Promise<unknown>}}}}}
export function isIPhoneApp(){return Boolean(window.webkit?.messageHandlers?.plannerNative)}
export function supportsScreenTime(){return isIPhoneApp() && window.plannerNativeScreenTime === true}
export async function nativeRequest<T=unknown>(message:NativeMessage):Promise<T>{
 const bridge=window.webkit?.messageHandlers?.plannerNative
 if(!bridge)throw new Error('This action requires the iPhone app.')
 try{return await bridge.postMessage(message) as T}
 catch(error){
  // Older installed app builds return Apple's cancellation as a rejected error.
  const text=error instanceof Error?error.message:String(error)
  if(['googleSignIn','googleConnection'].includes(message.action)&&/com\.apple\.AuthenticationServices\.WebAuthenticationSession[\s\S]*\berror\s+1\b/i.test(text))return {cancelled:true} as T
  throw error
 }
}
