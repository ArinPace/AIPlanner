import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import {zipSync,strToU8} from 'fflate'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'planner-file-bundle-'));fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'dir')
fs.writeFileSync(path.join(dir,'bundle.mjs'),ts.transpileModule(fs.readFileSync('src/lib/relayFileBundle.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText)
const {unpackRelayBundle}=await import(pathToFileURL(path.join(dir,'bundle.mjs')).href)
const turn='a1111111-1111-4111-8111-111111111111',entries={},files=[]
for(const [ext,mime] of Object.entries({docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'})){
 const name='verification.'+ext,bytes=fs.readFileSync('ios/AIPlannerUITests/Fixtures/Relay/'+name);entries['files/'+name]=bytes;files.push({path:'files/'+name,name,mime,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
}
const wrap=manifest=>({name:'planner-relay-files.zip',mime:'application/zip',size:1,data:'data:application/zip;base64,'+Buffer.from(zipSync({...entries,'planner-relay-manifest.json':strToU8(JSON.stringify(manifest))})).toString('base64')})
const manifest={format:'planner-relay-files/v1',turn,files};const result=await unpackRelayBundle(wrap(manifest),turn)
assert.equal(result.length,3);for(const file of result)assert.deepEqual(Buffer.from(file.data.split(',')[1],'base64'),entries['files/'+file.name])
await assert.rejects(()=>unpackRelayBundle(wrap(manifest),'wrong-turn'),/another response/)
await assert.rejects(()=>unpackRelayBundle(wrap({...manifest,files:files.map((f,i)=>i?f:{...f,sha256:'0'.repeat(64)})}),turn),/checksum/)
await assert.rejects(()=>unpackRelayBundle(wrap({...manifest,files:[{...files[0],path:'../escape'}]}),turn),/metadata/)
await assert.rejects(()=>unpackRelayBundle(wrap({...manifest,files:[{...files[0],size:26*1024*1024}]}),turn),/metadata/)
assert.equal(await unpackRelayBundle(wrap({...manifest,format:'ordinary-user-archive'}),turn),null)
console.log('File bundle: DOCX/XLSX/PPTX bytes retained; wrong turn, tampering, unsafe path and oversized entries rejected; ordinary ZIP remains intact.')
fs.rmSync(dir,{recursive:true,force:true})
