import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'

// Some runtime versions retain the original developer message on resume.
// Append current app-owned instructions through the supported history API when
// they change. Never put user messages or webpage/tool output in this role.
export async function refreshRuntimeInstructions(rpc,{threadId,instructions,dataDir,resumed}){
 const hash=value=>createHash('sha256').update(value).digest('hex')
 const filename=path.join(dataDir,'instructions-'+hash(threadId)+'.sha256'),digest=hash(instructions)
 if(await readFile(filename,'utf8').catch(()=>'')===digest)return
 if(resumed)await rpc.request('thread/inject_items',{threadId,items:[{type:'message',role:'developer',content:[{type:'input_text',text:instructions}]}]})
 await writeFile(filename,digest,{mode:0o600})
}
