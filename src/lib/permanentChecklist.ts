import {Extension} from '@tiptap/core'
import {Plugin} from '@tiptap/pm/state'
/** Preserve the editor's trailing paragraph while guaranteeing a checkbox row. */
export const PermanentChecklist=Extension.create<{enabled:boolean}>({
 name:'permanentChecklist',addOptions(){return {enabled:false}},
 addProseMirrorPlugins(){if(!this.options.enabled)return [];return [new Plugin({appendTransaction(transactions,_old,state){
  if(!transactions.some(t=>t.docChanged||t.getMeta('ensure-checklist')))return null
  const blocks:typeof state.doc[]=[];let hasItems=false
  state.doc.forEach(node=>{
   if(node.type.name==='taskList'){hasItems=true;blocks.push(node)}
   else if(node.isTextblock&&node.textContent.trim()){hasItems=true;blocks.push(state.schema.nodes.taskList.create(null,state.schema.nodes.taskItem.create(null,state.schema.nodes.paragraph.create(null,node.content))))}
   else blocks.push(node)
  })
  if(!hasItems)blocks.unshift(state.schema.nodes.taskList.create(null,state.schema.nodes.taskItem.create(null,state.schema.nodes.paragraph.create())))
  const doc=state.schema.nodes.doc.create(null,blocks)
  if(doc.eq(state.doc))return null
  return state.tr.replaceWith(0,state.doc.content.size,doc.content)
 }})]}
})
