import test from 'node:test'
import assert from 'node:assert/strict'
import { browserRuntimeEnv } from './browser-runtime-env.mjs'

test('browser tool subprocesses receive browser installation/display/data paths without unrelated credentials',()=>{
  const result=browserRuntimeEnv('/var/lib/planner',{PLAYWRIGHT_BROWSERS_PATH:'/installed/browsers',DISPLAY:':99',OPENAI_API_KEY:'never-forward'})
  assert.deepEqual(result,{PLANNER_DATA_DIR:'/var/lib/planner',PLAYWRIGHT_BROWSERS_PATH:'/installed/browsers',DISPLAY:':99'})
  assert.equal(browserRuntimeEnv('/var/lib/planner',{}).PLAYWRIGHT_BROWSERS_PATH.replaceAll('\\','/'),'/var/lib/planner/browsers')
})
