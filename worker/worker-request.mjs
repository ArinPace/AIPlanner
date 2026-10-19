export function transientConnectionError(error){
 return [408,429,500,502,503,504].includes(error?.status)||['TimeoutError','AbortError','TypeError'].includes(error?.name)||/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(error?.message||'')
}
export async function workerRequest(origin,token,action,value={},options={}){
 const send=options.fetch||fetch,wait=options.wait||(ms=>new Promise(resolve=>setTimeout(resolve,ms)))
 const attempts=['config','progress','finish'].includes(action)?3:1
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const response=await send(new URL('/api/agent/vm/worker/'+action,origin),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(action==='progress'?15000:25000)})
   if(!response.ok){const error=new Error(response.status===409?'The run was cancelled or its lease expired.':'The planner connection is unavailable.');error.status=response.status;throw error}
   return await response.json()
  }catch(error){if(attempt===attempts-1||!transientConnectionError(error))throw error;await wait(500*2**attempt)}
 }
}
