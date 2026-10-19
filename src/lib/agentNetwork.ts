export async function agentNetworkRequest<T>(path: string, options: RequestInit = {}, token:string|null=null): Promise<T> {
  const reading=!options.method||options.method.toUpperCase()==='GET'
  for(let attempt=0;attempt<(reading?3:1);attempt++){
    try{
      const response=await fetch(`/api/agent/${path}`,{...options,...(reading&&!options.signal?{signal:AbortSignal.timeout(30000)}:{}),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token??''}`,...options.headers}})
      const data=await response.json().catch(()=>({})) as {error?:string}
      if(!response.ok){if(reading&&attempt<2&&[408,429,500,502,503,504].includes(response.status)){await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));continue}throw Object.assign(new Error(reading&&[408,429,500,502,503,504].includes(response.status)?'Could not reach the agent. Reconnecting automatically.':data.error||'Could not reach the agent. Reconnecting automatically.'),{status:response.status})}
      return data as T
    }catch(error){if(reading&&attempt<2&&error instanceof Error&&['TypeError','TimeoutError','AbortError'].includes(error.name)&&!options.signal?.aborted){await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));continue}if(reading&&error instanceof Error&&['TypeError','TimeoutError','AbortError'].includes(error.name)&&!options.signal?.aborted)throw new Error('Could not reach the agent. Reconnecting automatically.');throw error}
  }
  throw new Error('Could not reach the agent. Reconnecting automatically.')
}
