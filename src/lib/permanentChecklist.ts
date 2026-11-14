import {SETTLE_CHECKLISTS} from './checklistSort'
import {Extension} from '@tiptap/core'
import {Plugin} from '@tiptap/pm/state'
/** Preserve the editor's trailing paragraph while guaranteeing a checkbox row. */
export const PermanentChecklist=Extension.create<{enabled:boolean}>({
 name:'permanentChecklist',addOptions(){return {enabled:false}},
 addProseMirrorPlugins(){if(!this.options.enabled)return [];return [new Plugin({appendTransaction(transactions,_old,state){
  if(!transactions.some(t=>t.docChanged||t.getMeta('ensure-checklist')||t.getMeta(SETTLE_CHECKLISTS)))return null
  const settle=transactions.some(t=>t.getMeta(SETTLE_CHECKLISTS))
  const active=document.activeElement?.closest('li[data-checked]')
  const blanks:{pos:number;node:typeof state.doc;index:number}[]=[];let total=0
  state.doc.descendants((node,pos)=>{if(node.type.name!=='taskItem')return;total++;if(node.childCount===1&&node.firstChild?.type.name==='paragraph'&&node.firstChild.content.size===0)blanks.push({pos,node,index:total-1})})
  const activeIndex=active?Array.from(active.closest('.apple-note-document')?.querySelectorAll('li[data-checked]')||[]).indexOf(active):-1
  const protectedBlank=blanks.find(({pos,node,index})=>index===activeIndex||state.selection.from>pos&&state.selection.to<pos+node.nodeSize&&Boolean(document.activeElement?.closest('.apple-note-document')))
  const remove=new Set(settle?blanks.filter(item=>item!==protectedBlank).map(item=>item.pos):[])
  if(remove.size===total&&blanks.length)remove.delete(blanks[0].pos)
  if(remove.size){
   const ranges:{from:number;to:number}[]=[]
   state.doc.descendants((node,pos)=>{
    if(node.type.name==='taskList'){
     let all=true;node.forEach((_child,offset)=>{if(!remove.has(pos+1+offset))all=false})
     if(all){ranges.push({from:pos,to:pos+node.nodeSize});return false}
    }
    if(node.type.name==='taskItem'&&remove.has(pos)){ranges.push({from:pos,to:pos+node.nodeSize});return false}
   })
   const tr=state.tr;for(const range of ranges.sort((a,b)=>b.from-a.from))tr.delete(range.from,range.to)
   return tr
  }
  const blocks:typeof state.doc[]=[];let hasItems=false
  state.doc.forEach(original=>{
   const node=original
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
