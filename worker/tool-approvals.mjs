// Importing authorized source bytes into the user's Files is part of collection,
// including unattended reviews; it does not grant interactive website writes.
export function browserToolApprovals(interactive=false){
 const tools=['browser_import_pdf',...(interactive?['browser_navigate','browser_action','browser_tabs','browser_snapshot','browser_screenshot','browser_view_image','browser_read']:[])]
 return Object.fromEntries(tools.map(name=>['mcp_servers.browser.tools.'+name+'.approval_mode','approve']))
}

// These account-scoped internal operations are authorized parts of Planner reviews.
// Keep external Google writes and browser actions outside this allowlist.
export function plannerToolApprovals(){
 const tools=['planner_calendar_stage_prepare','planner_calendar_stage_edit','planner_calendar_stage_publish','planner_whoop_review_report','planner_source_report','planner_save_folder','planner_save_note','planner_save_text_file','planner_save_link','planner_update_item','planner_bulk_update_items','planner_file_upload_start','planner_file_upload_finish','planner_pdf_upload_start','planner_pdf_upload_finish','planner_memory_write','planner_link_event_checklist']
 return Object.fromEntries(tools.map(name=>['mcp_servers.planner.tools.'+name+'.approval_mode','approve']))
}
