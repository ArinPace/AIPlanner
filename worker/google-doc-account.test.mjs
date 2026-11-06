import test from 'node:test'
import assert from 'node:assert/strict'
import {readGoogleDocument} from './google-doc-reader.mjs'
test('document export retains account from source URL and query takes precedence',async()=>{
 const urls=[],context={request:{get:async url=>{urls.push(url);return {ok:()=>true,status:()=>200,headers:()=>({'content-type':'text/plain'}),body:async()=>Buffer.from('Actual source body'),dispose:async()=>{}}}}}
 await readGoogleDocument(context,'https://docs.google.com/document/u/1/d/doc123/edit')
 assert.equal(new URL(urls[0]).searchParams.get('authuser'),'1')
 await readGoogleDocument(context,'https://docs.google.com/document/u/1/d/doc123/edit?authuser=school@example.com')
 assert.equal(new URL(urls[1]).searchParams.get('authuser'),'school@example.com')
})
