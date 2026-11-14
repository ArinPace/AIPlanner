import test from 'node:test'
import assert from 'node:assert/strict'
import {browserToolApprovals,plannerToolApprovals} from './tool-approvals.mjs'
test('authorized PDF collection is approved even without interactive browser control',()=>{
 const config=browserToolApprovals(false)
 assert.equal(config['mcp_servers.browser.tools.browser_import_pdf.approval_mode'],'approve')
 assert.equal(Object.keys(config).length,1)
 assert.equal(config['mcp_servers.browser.tools.browser_action.approval_mode'],undefined)
 assert.equal(config['mcp_servers.browser.tools.browser_read_whatsapp_chat.approval_mode'],undefined)
})
test('interactive browser grants retain their explicit tool allowlist',()=>{
 const config=browserToolApprovals(true)
 for(const name of ['browser_import_pdf','browser_action','browser_read'])assert.equal(config['mcp_servers.browser.tools.'+name+'.approval_mode'],'approve')
 assert.equal(config['mcp_servers.browser.default_tools_approval_mode'],undefined)
})

test('scheduled internal review writes are approved without approving external writes',()=>{
 const config=plannerToolApprovals()
 for(const tool of ['planner_calendar_stage_prepare','planner_calendar_stage_edit','planner_calendar_stage_publish','planner_whoop_review_report','planner_save_note'])assert.equal(config['mcp_servers.planner.tools.'+tool+'.approval_mode'],'approve')
 assert.equal(config['mcp_servers.planner.tools.google_calendar_save_event.approval_mode'],undefined)
 assert.equal(config['mcp_servers.planner.default_tools_approval_mode'],undefined)
})
