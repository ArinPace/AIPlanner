import {useEffect,useRef,useState,type ReactNode} from 'react'
import {EditorContent,useEditor} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {Markdown} from '@tiptap/markdown'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import {TableKit} from '@tiptap/extension-table'
import Highlight from '@tiptap/extension-highlight'
import {TextStyleKit} from '@tiptap/extension-text-style'
import {NoteIcon} from './NoteIcons'

export function NoteEditor({value,richText,richTextSource,onChange,onNew,onDelete,onShare,onPin,pinned,onSearch,onMore,header,disabled=false}:{value:string;richText?:string;richTextSource?:string;onChange:(value:string,richText:string)=>void;onNew:()=>void;onDelete:()=>void;onShare:()=>void;onPin:()=>void;pinned:boolean;onSearch:()=>void;onMore:()=>void;disabled?:boolean;header?:ReactNode}){
 const [menu,setMenu]=useState<'format'|'media'|'table'|null>(null),[attachment,setAttachment]=useState<'link'|'image'|null>(null),[url,setUrl]=useState('')
 const toolbar=useRef<HTMLDivElement>(null)
 const lastEmitted=useRef(value)
 const changeRef=useRef(onChange);useEffect(()=>{changeRef.current=onChange},[onChange])
 let initial:object|string=value,contentType:'json'|'markdown'='markdown'
 if(richText && richTextSource===value)try{initial=JSON.parse(richText);contentType='json'}catch{/* Older notes remain readable as Markdown. */}
 const editor=useEditor({extensions:[StarterKit.configure({link:{openOnClick:false,HTMLAttributes:{rel:'noopener noreferrer',target:'_blank'}}}),Markdown,TaskList,TaskItem.configure({nested:true}),Image.configure({allowBase64:false,HTMLAttributes:{referrerpolicy:'no-referrer'}}),TableKit.configure({table:{resizable:true}}),Highlight.configure({multicolor:true}),TextStyleKit],content:initial,contentType,editable:!disabled,shouldRerenderOnTransaction:true,editorProps:{attributes:{role:'textbox','aria-label':'Note content','aria-multiline':'true',class:'apple-note-document'}},onUpdate:({editor})=>{const markdown=editor.getMarkdown();lastEmitted.current=markdown;changeRef.current(markdown,JSON.stringify(editor.getJSON()))}})
 useEffect(()=>{if(editor && value!==lastEmitted.current && editor.getMarkdown()!==value && !editor.isFocused){let next:object|string=value;let type:'json'|'markdown'='markdown';if(richText&&richTextSource===value)try{next=JSON.parse(richText);type='json'}catch{};editor.commands.setContent(next,{contentType:type,emitUpdate:false});lastEmitted.current=value}},[editor,value,richText,richTextSource])
 useEffect(()=>{if(!menu)return;function close(e:MouseEvent){if(!toolbar.current?.contains(e.target as Node))setMenu(null)};function escape(e:KeyboardEvent){if(e.key==='Escape')setMenu(null)};document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape)}},[menu])
 if(!editor)return <p role="status">Opening note...</p>
 const action=(fn:()=>void)=>{fn();setMenu(null)}
 function addLink(){if(!/^https?:\/\//i.test(url))return;if(attachment==='image')editor!.chain().focus().setImage({src:url,alt:'Note image'}).run();else if(editor!.state.selection.empty)editor!.chain().focus().insertContent({type:'text',text:url,marks:[{type:'link',attrs:{href:url}}]}).run();else editor!.chain().focus().setLink({href:url}).run();setAttachment(null);setUrl('')}
 return <div className="apple-editor-shell">
  <div ref={toolbar} onMouseDown={event=>{if((event.target as Element).closest('button'))event.preventDefault()}} className="apple-note-toolbar" role="toolbar" aria-label="Note toolbar">
   <div className="apple-toolbar-leading"><button type="button" title="New note" aria-label="New note" onClick={onNew}><NoteIcon name="compose"/></button><button type="button" title="Move note to Bin" aria-label="Move note to Bin" onClick={onDelete}><NoteIcon name="trash"/></button></div>
   <div className="apple-format-tools">
    <div className="apple-toolbar-popover"><button type="button" title="Format text" aria-label="Format text" aria-expanded={menu==='format'} onClick={()=>setMenu(menu==='format'?null:'format')}><span className="apple-aa">Aa</span></button>{menu==='format'&&<div className="apple-format-menu" role="menu" aria-label="Text formatting">
     <div className="apple-style-grid">{(['Title','Heading','Subheading','Body','Monospaced'] as const).map((label,i)=><button type="button" key={label} role="menuitem" onClick={()=>action(()=>{if(i<3)editor.chain().focus().setHeading({level:(i+1) as 1|2|3}).run();else if(i===4)editor.chain().focus().toggleCodeBlock().run();else editor.chain().focus().setParagraph().run()})}>{label}</button>)}</div>
     <div className="apple-inline-formats">{(['bold','italic','underline','strike'] as const).map(mark=><button type="button" key={mark} aria-label={mark} aria-pressed={editor.isActive(mark)} onClick={()=>{const chain=editor.chain().focus();if(mark==='bold')chain.toggleBold().run();else if(mark==='italic')chain.toggleItalic().run();else if(mark==='underline')chain.toggleUnderline().run();else chain.toggleStrike().run()}}>{mark==='bold'?<b>B</b>:mark==='italic'?<i>I</i>:mark==='underline'?<u>U</u>:<s>S</s>}</button>)}</div>
     <div className="apple-highlight-colors" aria-label="Highlight color">{['#ffdd00','#c4a6ef','#faacba','#a3d8ab','#a4c9f2'].map(color=><button type="button" key={color} style={{background:color}} aria-label={'Highlight '+color} onClick={()=>editor.chain().focus().toggleHighlight({color}).run()}/>)}</div>
     <button type="button" role="menuitem" onClick={()=>action(()=>{editor.chain().focus().toggleBulletList().run()})}>Bulleted List</button><button type="button" role="menuitem" onClick={()=>action(()=>{editor.chain().focus().toggleOrderedList().run()})}>Numbered List</button><button type="button" role="menuitem" onClick={()=>action(()=>{editor.chain().focus().toggleBlockquote().run()})}>Block Quote</button><button type="button" role="menuitem" onClick={()=>action(()=>{editor.chain().focus().unsetAllMarks().clearNodes().run()})}>Remove Formatting</button>
    </div>}</div>
    <button type="button" title="Checklist" aria-label="Checklist" aria-pressed={editor.isActive('taskList')} onClick={()=>editor.chain().focus().toggleTaskList().run()}><NoteIcon name="checklist"/></button>
    <div className="apple-toolbar-popover"><button type="button" title="Table" aria-label="Table" aria-expanded={menu==='table'} onClick={()=>{if(!editor.isActive('table'))editor.chain().focus().insertTable({rows:2,cols:2,withHeaderRow:false}).run();else setMenu(menu==='table'?null:'table')}}><NoteIcon name="table"/></button>{menu==='table'&&<div className="apple-format-menu" role="menu" aria-label="Table actions">{[['Add Row',()=>editor.chain().focus().addRowAfter().run()],['Add Column',()=>editor.chain().focus().addColumnAfter().run()],['Delete Row',()=>editor.chain().focus().deleteRow().run()],['Delete Column',()=>editor.chain().focus().deleteColumn().run()],['Delete Table',()=>editor.chain().focus().deleteTable().run()]].map(([name,fn])=><button type="button" role="menuitem" key={String(name)} onClick={()=>action(fn as ()=>void)}>{String(name)}</button>)}</div>}</div>
    <div className="apple-toolbar-popover"><button type="button" title="Add link or image" aria-label="Add link or image" aria-expanded={menu==='media'} onClick={()=>setMenu(menu==='media'?null:'media')}><NoteIcon name="attachment"/></button>{menu==='media'&&<div className="apple-format-menu" role="menu" aria-label="Add media"><button type="button" role="menuitem" onClick={()=>action(()=>{setAttachment('link');setUrl('')})}>Add Link...</button><button type="button" role="menuitem" onClick={()=>action(()=>{setAttachment('image');setUrl('')})}>Add Image from URL...</button></div>}</div>
    <button type="button" title="Undo" aria-label="Undo" disabled={!editor.can().undo()} onClick={()=>editor.chain().focus().undo().run()}><NoteIcon name="undo"/></button><button type="button" title="Redo" aria-label="Redo" disabled={!editor.can().redo()} onClick={()=>editor.chain().focus().redo().run()}><NoteIcon name="redo"/></button>
   </div>
   <div className="apple-toolbar-trailing"><button type="button" title={pinned?'Unpin note':'Pin note'} aria-label={pinned?'Unpin note':'Pin note'} onClick={onPin}><NoteIcon name="pin"/></button><button type="button" title="Send a copy" aria-label="Send a copy" onClick={onShare}><NoteIcon name="share"/></button><button type="button" title="More" aria-label="More note actions" onClick={onMore}><NoteIcon name="more"/></button><button type="button" title="Search files" aria-label="Search files" onClick={onSearch}><NoteIcon name="search"/></button></div>
  </div>
  {attachment&&<div className="apple-attachment-form"><label>{attachment==='image'?'Image URL':'Link URL'}<input type="url" autoFocus value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addLink()}}}/></label><button type="button" onClick={addLink} disabled={!/^https?:\/\//i.test(url)}>Add</button><button type="button" onClick={()=>setAttachment(null)}>Cancel</button></div>}
  {header}
  <EditorContent editor={editor}/>
 </div>
}
