import {memo,useState} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './chat-markdown.css'

const plugins=[remarkGfm]

export const ChatMarkdown=memo(function ChatMarkdown({text,onReply,replyDisabled=false}:{text:string;onReply?:(text:string)=>void;replyDisabled?:boolean}){
 const [selected,setSelected]=useState(false)
 const options=onReply?[...new Set([...text.matchAll(/\[\[DUO_OPTION:([^\]\n]{1,80})\]\]/g)].map(match=>match[1].trim()))].slice(0,6):[]
 const ambiguousPhone=(option:string)=>/phone|text message|sms/i.test(option)&&/first|second|third|listed phone|phone\s*[12]\b/i.test(option)&&!/[0-9]{2,}/.test(option)
 const needsPhoneDetails=options.some(ambiguousPhone)
 const content=options.length?text.replace(/\[\[DUO_OPTION:[^\]\n]{1,80}\]\]/g,''):text
 return <div className="chat-markdown"><Markdown remarkPlugins={plugins} skipHtml components={{
  a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  table:({children})=><div className="chat-table-scroll" role="region" aria-label="Message table" tabIndex={0}><table>{children}</table></div>,
  img:({alt,src})=><a href={src} target="_blank" rel="noopener noreferrer">{alt || 'View image'}</a>,
 }}>{content}</Markdown>{options.length>0&&<div className="duo-verification-options" role="group" aria-label="Choose verification method">{options.map(option=><button type="button" key={option} disabled={replyDisabled||selected||ambiguousPhone(option)} onClick={()=>{setSelected(true);onReply?.('For Duo verification, choose: '+option)}}>{option}</button>)}{needsPhoneDetails&&<button type="button" disabled={replyDisabled||selected} onClick={()=>{setSelected(true);onReply?.('Inspect the currently displayed Duo verification methods without selecting or sending any method. Show clickable choices with the exact visible device names and masked phone numbers or ending digits, so I can distinguish the phones. Do not label them first/second or phone 1/2. Do not read password or passcode fields, infer hidden digits, send a text or push, or change devices. Wait for my identifiable choice.')}}>Show phone details</button>}</div>}</div>
})
