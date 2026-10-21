export interface DeviceChat{id:string;title:string;is_main:boolean;pinned:boolean;archived:boolean;deleted_at:string|null;chatgpt_url:string|null;updated_at:string}
export interface DeviceJob{id:string;chat_id:string|null;message:string;reply:string;status:string;error:string|null;created_at:string;finished_at:string|null}
export interface DeviceCall{id:string;name:string;arguments:Record<string,unknown>}
export function relayCalls(reply:string,turn:string):DeviceCall[]|null{
 const blocks=[...reply.matchAll(/```planner-tools\s*\n([\s\S]*?)```/g)]
 if(!blocks.length)return null
 if(blocks.length!==1||reply.slice(blocks[0].index!+blocks[0][0].length).trim())throw Error('ChatGPT returned an ambiguous tool request. Open its tab to review it.')
 const parsed=JSON.parse(blocks[0][1])
 if(parsed.turn!==turn)throw Error('Tool request does not belong to the current response. No tools were run.')
 if(!Array.isArray(parsed.calls)||!parsed.calls.length||parsed.calls.length>8)throw Error('ChatGPT must request between one and eight tools per batch.')
 const ids=new Set<string>()
 for(const call of parsed.calls){
  if(typeof call.id!=='string'||!call.id||call.id.length>80||ids.has(call.id)||typeof call.name!=='string'||!/^(planner_|google_calendar_|relay_(list|describe)_tools$)/.test(call.name)||!call.arguments||typeof call.arguments!=='object'||Array.isArray(call.arguments))throw Error('Invalid or duplicate Planner tool request. No tools were run.')
  ids.add(call.id)
 }
 return parsed.calls
}
export function relayVisible(reply:string){return reply.replace(/```planner-tools\b[\s\S]*?(?:```|$)/g,'').trim()}
export function relayTurnPrompt(message:string,turn:string){return message+'\n\nDevice relay response ID: '+turn+'. If calling tools, include "turn":"'+turn+'" beside "calls" in your planner-tools JSON block. Otherwise respond normally.'}
