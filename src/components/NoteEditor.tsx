import { useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function NoteEditor({ value, onChange, initialReading=false }: { value: string; onChange: (value: string) => void; initialReading?: boolean }) {
  const [reading, setReading] = useState(initialReading)
  const [attachment, setAttachment] = useState<'link'|'image'|null>(null)
  const [url, setUrl] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  function insert(before: string, after = '', fallback = '') {
    const start=ref.current?.selectionStart ?? value.length, end=ref.current?.selectionEnd ?? start
    const selected=value.slice(start,end) || fallback
    onChange(value.slice(0,start)+before+selected+after+value.slice(end))
    setReading(false)
    requestAnimationFrame(()=>{ref.current?.focus();ref.current?.setSelectionRange(start+before.length,start+before.length+selected.length)})
  }
  return <div className="note-editor">
    <div className="note-toolbar" role="toolbar" aria-label="Note formatting">
      <button type="button" aria-pressed={!reading} onClick={()=>setReading(false)}>Write</button>
      <button type="button" aria-pressed={reading} onClick={()=>setReading(true)}>Read</button>
      {!reading && <>
        <button type="button" title="Heading" onClick={()=>insert('\n## ','\n','Heading')}>Heading</button>
        <button type="button" title="Bold" onClick={()=>insert('**','**','bold text')}><b>B</b></button>
        <button type="button" title="Italic" onClick={()=>insert('*','*','italic text')}><i>I</i></button>
        <button type="button" onClick={()=>insert('\n- ','\n','List item')}>Bullets</button>
        <button type="button" onClick={()=>insert('\n1. ','\n','List item')}>Numbered list</button>
        <button type="button" onClick={()=>insert('\n- [ ] ','\n','To do')}>Checklist</button>
        <button type="button" onClick={()=>insert('\n> ','\n','Quote')}>Quote</button>
        <button type="button" onClick={()=>insert('\n| Column | Column |\n| --- | --- |\n| ',' | |\n','Cell')}>Table</button>
        <button type="button" onClick={()=>{setAttachment('link');setUrl('')}}>Link</button>
        <button type="button" onClick={()=>{setAttachment('image');setUrl('')}}>Image</button>
      </>}
    </div>
    {attachment && <div className="note-attachment"><label>{attachment==='image'?'Image URL':'Link URL'}<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://" /></label><button type="button" disabled={!/^https?:\/\//i.test(url)} onClick={()=>{insert(attachment==='image'?'![':'[',']('+url.replace(/[()\s]/g,c=>encodeURIComponent(c))+')',attachment==='image'?'Image description':'Link');setAttachment(null)}}>Insert {attachment}</button><button type="button" onClick={()=>setAttachment(null)}>Cancel</button></div>}
    {reading ? <article className="note-reading" aria-label="Note reading view"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{a:props=><a href={props.href} target="_blank" rel="noopener noreferrer">{props.children}</a>,img:props=><img src={props.src} alt={props.alt || ''} loading="lazy" referrerPolicy="no-referrer"/>,li:({node,children,...props})=><li {...props} onClick={event=>{if(!(event.target instanceof HTMLInputElement) || event.target.type!=='checkbox')return;const line=(node?.position?.start.line ?? 0)-1;if(line<0)return;const lines=value.split('\n');lines[line]=lines[line].replace(/^(\s*[-*+] \[)([ xX])(\])/,(_all,a,b,c)=>a+(b===' '?'x':' ')+c);onChange(lines.join('\n'))}}>{children}</li>,input:({checked,type})=><input type={type} checked={checked} readOnly aria-label="Checklist item"/>}}>{value || '*Your note is empty. Select Write to begin.*'}</Markdown></article> : <textarea ref={ref} className="note-writing" aria-label="Note content" maxLength={1000000} placeholder="Start writing. Use the toolbar for headings, lists, checklists, links and images." value={value} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if((e.metaKey || e.ctrlKey) && ['b','i'].includes(e.key.toLowerCase())){e.preventDefault();insert(e.key.toLowerCase()==='b'?'**':'*',e.key.toLowerCase()==='b'?'**':'*')}}}/>}
  </div>
}
