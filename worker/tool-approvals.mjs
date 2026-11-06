// Importing authorized source bytes into the user's Files is part of collection,
// including unattended reviews; it does not grant interactive website writes.
export function browserToolApprovals(interactive=false){
 const tools=['browser_import_pdf',...(interactive?['browser_navigate','browser_action','browser_tabs','browser_snapshot','browser_screenshot','browser_view_image','browser_read']:[])]
 return Object.fromEntries(tools.map(name=>['mcp_servers.browser.tools.'+name+'.approval_mode','approve']))
}
