import TaskItem from '@tiptap/extension-task-item'
import { urgencyColor } from './urgencyColor'

function urgency(value:unknown){
 const n=typeof value==='number'?value:typeof value==='string' && /^\d{1,2}$/.test(value)?Number(value):NaN
 return Number.isInteger(n) && n>=0 && n<=99?n:null
}
export const UrgencyTaskItem=TaskItem.extend({
 addKeyboardShortcuts(){
  return {...this.parent?.(),Enter:()=>{
   if(!this.editor.commands.splitListItem(this.name))return false
   const {$from}=this.editor.state.selection
   for(let depth=$from.depth;depth>0;depth--){
    if($from.node(depth).type.name!==this.name)continue
    const dom=this.editor.view.nodeDOM($from.before(depth))
    if(dom instanceof HTMLElement){
     const input=dom.querySelector<HTMLInputElement>('input.task-urgency')
     input?.focus();input?.select()
    }
    break
   }
   return true
  }}
 },
 addAttributes(){return {...this.parent?.(),urgency:{default:null,keepOnSplit:false,parseHTML:element=>urgency(element.getAttribute('data-urgency')),renderHTML:attrs=>attrs.urgency==null?{}:{'data-urgency':attrs.urgency}}}},
 parseMarkdown(token,helpers){
  const parsed=this.parent!(token,helpers)
  if(!parsed || Array.isArray(parsed))return parsed
  const first=parsed.content?.[0]?.content?.[0]
  const match=first?.type==='text' && first.text?.match(/^\[urgency:(\d{1,2})\]\s*/)
  if(match){parsed.attrs={...parsed.attrs,urgency:Number(match[1])};first.text=first.text!.slice(match[0].length);if(!first.text)parsed.content![0].content!.shift()}
  return parsed
 },
 renderMarkdown(node,helpers,context){
  const text=this.parent?.(node,helpers,context) || ''
  const n=urgency(node.attrs?.urgency)
  return n==null?text:text.replace(/^(- \[[ x]\] )/,`$1[urgency:${n}] `)
 },
 addNodeView(){
  const create=this.parent?.()
  if(!create)return null
  return props=>{
   const view=create(props),input=document.createElement('input')
   input.type='number';input.min='0';input.max='99';input.step='1';input.inputMode='numeric';input.className='task-urgency';input.placeholder='–';input.contentEditable='false'
   input.title='Urgency: 0–99. Higher numbers mean more urgent. Leave blank to clear.'
   const sync=(node:typeof props.node)=>{const n=urgency(node.attrs.urgency);if(input.value!==(n==null?'':String(n)))input.value=n==null?'':String(n);input.disabled=!props.editor.isEditable;input.setAttribute('aria-label','Urgency for '+(node.textContent.slice(0,100)||'checklist item'));input.style.backgroundColor='';input.style.borderColor='';input.style.color='';Object.assign(input.style,urgencyColor(n))}
   sync(props.node)
   view.dom.insertBefore(input,view.contentDOM || null)
   input.addEventListener('input',()=>{
    const position=props.getPos(),n=input.value===''?null:urgency(input.value)
    if(input.value!=='' && n==null){input.setCustomValidity('Enter a whole number from 0 to 99.');return}
    input.setCustomValidity('')
    if(typeof position!=='number' || !props.editor.isEditable)return
    const node=props.editor.state.doc.nodeAt(position)
    if(node)props.editor.view.dispatch(props.editor.state.tr.setNodeMarkup(position,undefined,{...node.attrs,urgency:n}))
   })
   input.addEventListener('blur',()=>{input.setCustomValidity('');const pos=props.getPos();if(typeof pos==='number'){const node=props.editor.state.doc.nodeAt(pos);if(node)sync(node)}})
   input.addEventListener('keydown',event=>{if(event.key==='Enter'){
    event.preventDefault();event.stopPropagation()
    if(!input.checkValidity()){input.reportValidity();return}
    const position=props.getPos()
    if(typeof position==='number')props.editor.commands.focus(position+2)
   }})
   const update=view.update,stop=view.stopEvent,ignore=view.ignoreMutation
   view.update=(node,...rest)=>{const accepted=update?.(node,...rest)??false;if(accepted)sync(node);return accepted}
   view.stopEvent=event=>event.target===input || (stop?.(event)??false)
   view.ignoreMutation=mutation=>mutation.target===input || (ignore?.(mutation)??false)
   return view
  }
 },
})
