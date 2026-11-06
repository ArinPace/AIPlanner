import test from 'node:test'
import assert from 'node:assert/strict'
import {browserToolApprovals} from './tool-approvals.mjs'
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
