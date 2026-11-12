// Only public catalog metadata is forwarded; never provider configuration/auth.
export function modelCatalog(rows) {
 if(!Array.isArray(rows))return []
 return rows.filter(x=>x&&!x.hidden&&typeof x.model==='string'&&/^[a-zA-Z0-9._:/-]{1,120}$/.test(x.model)).slice(0,100).map(x=>({model:x.model,label:String(x.label||x.displayName||x.model).slice(0,160),efforts:[...new Set((x.efforts||x.supportedReasoningEfforts?.map(e=>e.reasoningEffort)||[]).filter(e=>['none','minimal','low','medium','high','xhigh','max','ultra'].includes(e)))],tiers:(x.tiers||x.serviceTiers||[]).filter(t=>t&&typeof t.id==='string'&&/^[a-z0-9_-]{1,40}$/.test(t.id)).slice(0,10).map(t=>({id:t.id,label:String(t.label||t.name||t.id).slice(0,80)}))}))
}
export function generationOptions(value,catalog) {
 const x=value||{};if(Object.keys(x).some(k=>!['model','effort','serviceTier','reset'].includes(k)))throw Error('Unknown model setting.')
 if(x.reset===true){if(Object.keys(x).some(k=>k!=='reset'))throw Error('Reset cannot include other model settings.');return {reset:true}}
 const result={};for(const k of ['model','effort','serviceTier']){if(x[k]!=null&&x[k]!==''){if(typeof x[k]!=='string')throw Error('Choose a supported model setting.');result[k]=x[k]}}
 if(!Object.keys(result).length)return result
 const selected=catalog.find(m=>m.model===result.model);if(!selected)throw Error('Choose an available model before changing thinking or speed.')
 if(result.effort&&!selected.efforts.includes(result.effort))throw Error('This model does not offer that thinking level.')
 if(result.serviceTier&&result.serviceTier!=='default'&&!selected.tiers.some(t=>t.id===result.serviceTier))throw Error('This model does not offer that speed.')
 return result
}
