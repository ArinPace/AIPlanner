import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,mkdir,symlink,rm,realpath,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {chromium} from 'playwright'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {InteractiveBrowser,registerBrowserControl,publicBrowserUrl,enabledBrowserUrl,workspaceFile} from './browser-control.mjs'
import {browserQueue} from './browser-queue.mjs'
const sources={whoop:'https://app.whoop.com/',gmail:'https://mail.google.com/'}
test('browser actions allow enabled write routes while rejecting unrelated direct/local/credential URLs',()=>{
 for(const pathname of ['settings','submit','delete','logout'])assert.equal(enabledBrowserUrl('https://app.whoop.com/'+pathname,['whoop'],sources),'https://app.whoop.com/'+pathname)
 for(const url of ['file:///etc/passwd','http://127.0.0.1','https://127.0.0.1/','https://localhost/','https://169.254.169.254/','https://user:secret@app.whoop.com/','https://app.whoop.com.evil.test/'])assert.throws(()=>enabledBrowserUrl(url,['whoop'],sources))
 assert.throws(()=>enabledBrowserUrl(sources.gmail,['whoop'],sources))
 assert.throws(()=>publicBrowserUrl('https://[::1]/'))
})
test('upload confinement handles traversal and symlinks',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'planner-upload-'))
 try{await mkdir(path.join(root,'work'));await writeFile(path.join(root,'outside'),'private');await writeFile(path.join(root,'work','ok.csv'),'one,two');await symlink(path.join(root,'outside'),path.join(root,'work','link'))
 assert.equal(await workspaceFile(path.join(root,'work'),'ok.csv'),await realpath(path.join(root,'work','ok.csv')))
 for(const name of ['../outside','link'])await assert.rejects(()=>workspaceFile(path.join(root,'work'),name),/working folder/)
 }finally{await rm(root,{recursive:true,force:true})}
})
test('real Chromium MCP flow keeps tabs, clicks Sleep, hovers canvas, captures pixels, edits and submits, uploads/downloads',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'planner-browser-control-'))
 const context=await chromium.launchPersistentContext(path.join(directory,'profile'),{headless:true,executablePath:process.env.PLANNER_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--remote-debugging-port=0'],acceptDownloads:true,viewport:{width:1000,height:700}})
 // The fixture controller must not auto-dismiss dialogs before the CDP client handles them.
 context.on('page',page=>page.on('dialog',()=>{}));for(const page of context.pages())page.on('dialog',()=>{})
 const port=(await readFile(path.join(directory,'profile','DevToolsActivePort'),'utf8')).split('\n')[0]
 const fixture=`<!doctype html><title>WHOOP interaction fixture</title><body><h1>Historical day</h1><button onclick="document.querySelector('#sleep').hidden=false">Sleep</button><section id="sleep" hidden><h2>Sleep details</h2><p>October 21: 11:13 PM–7:02 AM; actual sleep 7h 09m</p><canvas aria-label="Sleep chart" width="400" height="100" onmousemove="document.querySelector('#tip').textContent='Wake 7:02 AM'"></canvas><p id="tip"></p></section><label>Message<textarea aria-label="Message"></textarea></label><button onclick="document.querySelector('#sent').textContent=document.querySelector('textarea').value">Send</button><p id="sent"></p><select aria-label="Day" onchange="document.querySelector('h1').textContent=this.value"><option>October 21</option><option>November 3</option></select><input type="password" value="fixture-secret"><input type="file" aria-label="Attach file" onchange="document.querySelector('#attachment').textContent=this.files[0].name"><p id="attachment"></p><a href="/download">Download CSV</a><a href="https://docs.example.test/resource" target="_blank">Linked resource</a><button onclick="confirm('Delete fixture?')&&(document.querySelector('#confirm').textContent='confirmed')">Confirm action</button><p id="confirm"></p><iframe src="/frame" title="course frame"></iframe><div style="height:1500px">End</div></body>`
 await context.route('**/*',route=>{
  const u=new URL(route.request().url())
  if(u.pathname==='/download')return route.fulfill({headers:{'content-type':'text/csv','content-disposition':'attachment; filename="sleep.csv"'},body:'date,sleep\n2026-10-21,429'})
  if(u.pathname==='/panel')return route.fulfill({contentType:'text/html',body:'<main style="height:350px;overflow-y:auto" aria-label="App content"><h1>Panel top</h1><div style="height:800px">Chart</div><p>Panel end</p></main><script>document.querySelector("main").scrollTop=37</script>'})
  if(u.pathname==='/frame')return route.fulfill({contentType:'text/html',body:'<button onclick="this.textContent=\'Frame clicked\'">Frame button</button>'})
  if(u.hostname==='docs.example.test')return route.fulfill({contentType:'text/html',body:'<h1>Actual linked external document</h1>'})
  return route.fulfill({contentType:'text/html',body:fixture})
 })
 const server=new McpServer({name:'browser-control-test',version:'1'})
 const calls=[]
 registerBrowserControl(server,{queued:browserQueue(),enabled:['whoop'],sources,connect:async(route)=>{calls.push(route);return chromium.connectOverCDP('http://127.0.0.1:'+port)},workspace:directory})
 const client=new Client({name:'test-client',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair()
 await server.connect(a);await client.connect(b)
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert(!r.isError,JSON.stringify(r));return r.content[0].type==='text'?JSON.parse(r.content[0].text):r}
 const find=(state,name)=>state.frames.flatMap(f=>f.elements).find(e=>e.name===name)?.ref
 try{
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['browser_action','browser_navigate','browser_screenshot','browser_snapshot','browser_tabs'].sort())
  assert.equal(tools.tools.find(t=>t.name==='browser_action').annotations.readOnlyHint,false)
  let state=await call('browser_navigate',{url:sources.whoop}),tabId=state.tabId
  assert(!JSON.stringify(state).includes('fixture-secret'))
  state=await call('browser_action',{tabId,action:'click',ref:find(state,'Sleep')});assert(state.frames[0].text.includes('actual sleep 7h 09m'))
  const stale=find(state,'Sleep')
  state=await call('browser_action',{tabId,action:'hover',ref:find(state,'Sleep chart')});assert(state.frames[0].text.includes('Wake 7:02 AM'))
  const bad=await client.callTool({name:'browser_action',arguments:{tabId,action:'click',ref:stale}});assert(bad.isError);assert.match(bad.content[0].text,/Stale/)
  const screenshot=await client.callTool({name:'browser_screenshot',arguments:{tabId}});assert.equal(screenshot.content[1].type,'image');assert.equal(Buffer.from(screenshot.content[1].data,'base64').subarray(1,4).toString(),'PNG')
  state=await call('browser_snapshot',{tabId});state=await call('browser_action',{tabId,action:'fill',ref:find(state,'Message'),text:'Requested fixture message'});state=await call('browser_action',{tabId,action:'click',ref:find(state,'Send')});assert(state.frames[0].text.includes('Requested fixture message'))
  state=await call('browser_action',{tabId,action:'select',ref:find(state,'Day'),values:['November 3']});assert(state.frames[0].text.startsWith('November 3'))
  state=await call('browser_action',{tabId,action:'click',ref:find(state,'Frame button')});assert(state.frames.some(f=>f.text.includes('Frame clicked')))
  await writeFile(path.join(directory,'fixture.csv'),'one,two')
  state=await call('browser_action',{tabId,action:'upload',ref:find(state,'Attach file'),files:['fixture.csv']});assert(state.frames[0].text.includes('fixture.csv'))
  state=await call('browser_action',{tabId,action:'click',ref:find(state,'Download CSV'),waitForDownload:true});assert.equal(state.download.name,'sleep.csv')
  state=await call('browser_action',{tabId,action:'click',ref:find(state,'Confirm action'),accept:true});assert(state.frames[0].text.includes('confirmed'))
  state=await call('browser_action',{tabId,action:'click',ref:find(state,'Linked resource')});assert.equal(state.openedTabs.length,1)
  const linked=await call('browser_snapshot',{tabId:state.openedTabs[0].tabId});assert(linked.frames[0].text.includes('Actual linked external document'))
  const tabs=await call('browser_tabs',{});assert.equal(tabs.tabs.length,2)
  const external=await call('browser_navigate',{url:'https://docs.example.test/resource'});assert(external.frames[0].text.includes('Actual linked external document'));assert(calls.every(url=>url.startsWith('https://app.whoop.com')))
  assert.equal((await call('browser_screenshot',{tabId,fullPage:true})).fullPage,true)
  state=await call('browser_navigate',{url:'https://app.whoop.com/panel',tabId});assert(state.frames.flatMap(f=>f.elements).some(e=>e.scroll?.top===37))
  const tiles=await client.callTool({name:'browser_screenshot',arguments:{tabId,fullPage:true}});assert(!tiles.isError);const tileMeta=JSON.parse(tiles.content[0].text);assert.equal(tileMeta.captureMode,'scroll-container-tiles');assert.equal(tileMeta.truncated,false);assert(tiles.content.filter(c=>c.type==='image').length>=3)
  state=await call('browser_snapshot',{tabId});assert(state.frames.flatMap(f=>f.elements).some(e=>e.scroll?.top===37))
 }finally{await client.close();await server.close();await context.close();await rm(directory,{recursive:true,force:true})}
})
