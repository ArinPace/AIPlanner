import {memo} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './chat-markdown.css'

const plugins=[remarkGfm]

export const ChatMarkdown=memo(function ChatMarkdown({text}:{text:string}){
 return <div className="chat-markdown"><Markdown remarkPlugins={plugins} skipHtml components={{
  a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  table:({children})=><div className="chat-table-scroll" role="region" aria-label="Message table" tabIndex={0}><table>{children}</table></div>,
  img:({alt,src})=><a href={src} target="_blank" rel="noopener noreferrer">{alt || 'View image'}</a>,
 }}>{text}</Markdown></div>
})
