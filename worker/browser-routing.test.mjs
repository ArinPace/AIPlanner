import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { browserEndpoint, stableProfile, loginUsesStableProfile } from './browser-routing.mjs'
import { sources } from './browser-sources.mjs'
import { siteLaunches, rememberBrowserProfile } from './site-launches.mjs'
import { readableUrl } from './browser-access.mjs'

test('every current connection and a future registered source use regular Chrome for sign-in and reads',()=>{
  for(const [source,url] of Object.entries(sources)){
    assert.equal(loginUsesStableProfile(source,'connect',{[source]:'legacy'}),true,source)
    assert.equal(loginUsesStableProfile(source,'manage',{[source]:'legacy'}),true,source)
    assert.equal(stableProfile(source),true,source)
    assert.equal(browserEndpoint(url),'http://127.0.0.1:9223',source)
    assert.equal(browserEndpoint(url,{[source]:'stable'}),'http://127.0.0.1:9223',source)
  }
  const future={...sources,forum:'https://forum.example.org/'}
  assert.equal(loginUsesStableProfile('forum','connect'),true)
  assert.equal(browserEndpoint('https://forum.example.org/threads/1',{},future),'http://127.0.0.1:9223')
  assert.throws(()=>browserEndpoint('https://x.com.evil.example/'))
  assert.equal(browserEndpoint('https://sis.portal.nyu.edu/psp/ihprod/EMPLOYEE/EMPL/h/'),'http://127.0.0.1:9223')
  assert.throws(()=>readableUrl('https://calendar.google.com/calendar/u/1/r',['slack'],sources))
})

test('existing sessions stay in their retained profile until reconnect; forced regular profiles cannot regress',()=>{
  for(const source of ['brightspace','gradescope','gmail','drive','slack','instagram']){
    const profiles={[source]:'legacy'}
    assert.equal(loginUsesStableProfile(source,'open',profiles),false)
    assert.equal(browserEndpoint(sources[source],profiles),'http://127.0.0.1:9222')
    assert.equal(browserEndpoint(sources[source],{[source]:'stable'}),'http://127.0.0.1:9223')
  }
  for(const source of ['calendar','x'])assert.equal(stableProfile(source,{[source]:'legacy'}),true)
  for(const url of ['https://x.com/home','https://www.x.com/i/flow/login','https://twitter.com/home'])assert.equal(browserEndpoint(url),'http://127.0.0.1:9223')
})

test('profile migration preserves sessions and account choices without moving cookies; all reconnects persist',async()=>{
  const old=await mkdtemp(path.join(os.tmpdir(),'planner-existing-')),fresh=await mkdtemp(path.join(os.tmpdir(),'planner-new-'))
  try{
    await mkdir(path.join(old,'browser','Default'),{recursive:true})
    const cookieMarker=path.join(old,'browser','Default','Cookies')
    await writeFile(cookieMarker,'test marker, not actual cookies')
    await writeFile(path.join(old,'site-launches.json'),JSON.stringify({gmail:'https://mail.google.com/mail/u/2/',browserProfiles:{drive:'stable'}}))
    const migrated=await siteLaunches(old)
    assert.equal(migrated.browserProfileVersion,1)
    assert.equal(migrated.browserProfiles.gmail,'legacy');assert.equal(migrated.browserProfiles.slack,'legacy');assert.equal(migrated.browserProfiles.drive,'stable')
    assert.equal(stableProfile('albert',migrated.browserProfiles),true)
    assert.equal(stableProfile('whatsapp',migrated.browserProfiles),true)
    assert.equal(migrated.gmail,'https://mail.google.com/mail/u/2/')
    for(const source of Object.keys(sources)){
      await rememberBrowserProfile(old,source)
      const saved=await siteLaunches(old)
      assert.equal(saved.browserProfiles[source],'stable')
      assert.equal(browserEndpoint(sources[source],saved.browserProfiles),'http://127.0.0.1:9223')
    }
    assert.equal(await readFile(cookieMarker,'utf8'),'test marker, not actual cookies')
    const newProfile=await siteLaunches(fresh)
    assert.deepEqual(newProfile.browserProfiles,{})
    assert.ok(Object.keys(sources).every(source=>stableProfile(source,newProfile.browserProfiles)))
    assert.equal(stableProfile('future-site',migrated.browserProfiles),true)
    await assert.rejects(()=>rememberBrowserProfile(old,'unknown'),/supported/)
  }finally{
    // These absolute temporary directories were returned by mkdtemp above.
    await rm(old,{recursive:true,force:true});await rm(fresh,{recursive:true,force:true})
  }
})
