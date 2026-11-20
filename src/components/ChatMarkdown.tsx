import {memo,useState} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './chat-markdown.css'

const plugins=[remarkGfm]

export const ChatMarkdown=memo(function ChatMarkdown({text,onReply,replyDisabled=false}:{text:string;onReply?:(text:string)=>void;replyDisabled?:boolean}){
 const [selected,setSelected]=useState(false)
 const options=onReply?[...new Set([...text.matchAll(/\[\[DUO_OPTION:([^\]\n]{1,80})\]\]/g)].map(match=>match[1].trim()))].slice(0,6):[]
 const content=options.length?text.replace(/\[\[DUO_OPTION:[^\]\n]{1,80}\]\]/g,''):text
 return <div className="chat-markdown"><Markdown remarkPlugins={plugins} skipHtml components={{
  a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  table:({children})=><div className="chat-table-scroll" role="region" aria-label="Message table" tabIndex={0}><table>{children}</table></div>,
  img:({alt,src})=><a href={src} target="_blank" rel="noopener noreferrer">{alt || 'View image'}</a>,
 }}>{content}</Markdown>{options.length>0&&<div className="duo-verification-options" role="group" aria-label="Choose verification method">{options.map(option=><button type="button" key={option} disabled={replyDisabled||selected} onClick={()=>{setSelected(true);onReply?.('For Duo verification, choose: '+option)}}>{option}</button>)}</div>}</div>
})
