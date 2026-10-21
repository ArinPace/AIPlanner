import { Fragment } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'

export const SORT_CHECKLISTS = 'sort-checklists-by-urgency'
export function checklistSortPlugin() {
 let editorFocused = () => false
 let editable = () => true
 return new Plugin({
  view: view => {
   let destroyed = false
   editorFocused = () => view.hasFocus()
   editable = () => view.editable
   const onBlur = () => queueMicrotask(() => {
    if (!destroyed && !view.dom.contains(document.activeElement)) view.dispatch(view.state.tr.setMeta(SORT_CHECKLISTS, true))
   })
   view.dom.addEventListener('focusout', onBlur)
   queueMicrotask(() => { if (!destroyed) view.dispatch(view.state.tr.setMeta(SORT_CHECKLISTS, true)) })
   return { destroy: () => { destroyed = true; view.dom.removeEventListener('focusout', onBlur) } }
  },
  appendTransaction(transactions, _old, state) {
   if (!editable()) return null
   if (!transactions.some(tr => tr.docChanged || tr.getMeta(SORT_CHECKLISTS))) return null
   // Finish entering both digits before moving the task out from under the input.
   if (document.activeElement?.classList.contains('task-urgency')) return null
   if (editorFocused() && !transactions.some(tr => tr.getMeta(SORT_CHECKLISTS))) return null
   const tr = state.tr
   // Blank paragraphs can split one visual checklist into multiple taskList nodes.
   // Join only these adjacent sections; headings and nonempty text stay boundaries.
   const blocks: {node: typeof state.doc; pos: number}[] = []
   state.doc.forEach((node,pos) => blocks.push({node,pos}))
   for (let index = blocks.length - 1; index >= 0; index--) {
    if (blocks[index].node.type.name !== 'taskList') continue
    let first = index
    while (first > 0) {
     let previous = first - 1
     while (previous >= 0 && blocks[previous].node.type.name === 'paragraph' && blocks[previous].node.childCount === 0) previous--
     if (previous < 0 || blocks[previous].node.type.name !== 'taskList') break
     first = previous
    }
    if (first === index) continue
    const items: {node: typeof state.doc; start: number}[] = []
    for (let i = first; i <= index; i++) if (blocks[i].node.type.name === 'taskList') {
     blocks[i].node.forEach((node,offset) => items.push({node,start:blocks[i].pos + 1 + offset}))
    }
    const from = tr.mapping.map(blocks[first].pos)
    const to = tr.mapping.map(blocks[index].pos + blocks[index].node.nodeSize)
    let offset = 0
    let anchor: number | null = null, head: number | null = null
    for (const item of items) {
     const oldStart = tr.mapping.map(item.start)
     if (tr.selection.anchor >= oldStart && tr.selection.anchor < oldStart + item.node.nodeSize) anchor = from + 1 + offset + tr.selection.anchor - oldStart
     if (tr.selection.head >= oldStart && tr.selection.head < oldStart + item.node.nodeSize) head = from + 1 + offset + tr.selection.head - oldStart
     offset += item.node.nodeSize
    }
    const wasText = tr.selection instanceof TextSelection
    tr.replaceWith(from,to,blocks[first].node.copy(Fragment.fromArray(items.map(item=>item.node))))
    if (wasText && anchor !== null && head !== null) tr.setSelection(TextSelection.create(tr.doc,anchor,head))
    index = first
   }
   const positions: number[] = []
   tr.doc.descendants((node, pos) => { if (node.type.name === 'taskList') positions.push(pos) })
   const mappingStart = tr.mapping.maps.length
   for (const originalPos of positions.reverse()) {
    const pos = tr.mapping.slice(mappingStart).map(originalPos)
    const list = tr.doc.nodeAt(pos)
    if (!list) continue
    const items: { node: typeof list; offset: number }[] = []
    list.forEach((node, offset) => items.push({node, offset}))
    const sorted = [...items].sort((a,b) => Number(Boolean(a.node.attrs.checked))-Number(Boolean(b.node.attrs.checked)) || (b.node.attrs.urgency ?? -1) - (a.node.attrs.urgency ?? -1))
    if (sorted.every((item, index) => item === items[index])) continue
    // Leave a newly inserted blank task in place until its text has been entered.
    if (items.some(item => !item.node.textContent.trim() && tr.selection.from > pos + item.offset && tr.selection.from < pos + item.offset + item.node.nodeSize + 1)) continue
    const selection = tr.selection
    function movedPosition(position: number) {
     let offset = 0
     for (const item of sorted) {
      const start = pos + 1 + item.offset
      if (position >= start && position < start + item.node.nodeSize) return pos + 1 + offset + position - start
      offset += item.node.nodeSize
     }
     return null
    }
    const anchor = movedPosition(selection.anchor), head = movedPosition(selection.head)
    tr.replaceWith(pos + 1, pos + list.nodeSize - 1, Fragment.fromArray(sorted.map(item => item.node)))
    if (selection instanceof TextSelection && anchor !== null && head !== null) tr.setSelection(TextSelection.create(tr.doc, anchor, head))
   }
   return tr.docChanged ? tr : null
  },
 })
}
