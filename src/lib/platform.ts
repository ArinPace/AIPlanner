type NativeMessage={action:string;[key:string]:unknown}
declare global {interface Window {webkit?:{messageHandlers?:{plannerNative?:{postMessage:(message:NativeMessage)=>Promise<unknown>}}}}}
export function isIPhoneApp(){return Boolean(window.webkit?.messageHandlers?.plannerNative)}
export async function nativeRequest<T=unknown>(message:NativeMessage):Promise<T>{
 const bridge=window.webkit?.messageHandlers?.plannerNative
 if(!bridge)throw new Error('This action requires the iPhone app.')
 return await bridge.postMessage(message) as T
}
