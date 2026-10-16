import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { googleCdp } from './browser-routing.mjs'
export { googleSources, googleCdp } from './browser-routing.mjs'

let connection, starting, processHandle

export async function googleBrowser(dataDir) {
  if(connection?.isConnected())return connection.contexts()[0]
  if(starting)return starting
  starting=(async()=>{
    const profile=path.join(dataDir,'google-browser')
    await mkdir(profile,{recursive:true,mode:0o700})
    const available=await fetch(googleCdp+'/json/version',{signal:AbortSignal.timeout(1000)}).then(r=>r.ok).catch(()=>false)
    if(!available){
      // Launch the installed consumer Chrome binary with its default sandbox,
      // TLS, extensions and user-agent behavior. Do not use Chrome for Testing,
      // Playwright launch defaults, stealth flags or disabled security features.
      processHandle=spawn('/usr/bin/google-chrome-stable',[
        '--user-data-dir='+profile,'--remote-debugging-port=9223',
        '--remote-debugging-address=127.0.0.1','--window-size=1440,900',
        '--no-first-run','--no-default-browser-check','about:blank',
      ],{env:{...process.env,DISPLAY:':99'},stdio:'ignore'})
      let failed=false
      processHandle.once('error',()=>{failed=true})
      const deadline=Date.now()+20000
      let ready=false
      while(Date.now()<deadline && !failed && processHandle.exitCode===null){
        if(await fetch(googleCdp+'/json/version',{signal:AbortSignal.timeout(1000)}).then(r=>r.ok).catch(()=>false)){ready=true;break}
        await new Promise(resolve=>setTimeout(resolve,300))
      }
      if(!ready){processHandle.kill('SIGTERM');throw new Error('The standard Google Chrome browser could not start. Check the private computer browser installation.')}
    }
    connection=await chromium.connectOverCDP(googleCdp)
    return connection.contexts()[0]
  })()
  try{return await starting}finally{starting=null}
}
export async function closeGoogleBrowser(){
  if(connection?.isConnected()){
    const session=await connection.newBrowserCDPSession()
    await session.send('Browser.close').catch(()=>{})
    await connection.close().catch(()=>{})
  }
  connection=null;processHandle=null
}
