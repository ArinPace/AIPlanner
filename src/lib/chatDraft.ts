import {useCallback,useRef,useState,type SetStateAction} from 'react'
const key=(username:string,chat:string|null)=>'ai-planner-chat-draft:'+JSON.stringify([username,chat||'new'])
export function readChatDraft(username:string,chat:string|null){try{return localStorage.getItem(key(username,chat))||''}catch{return ''}}
export function writeChatDraft(username:string,chat:string|null,text:string){try{if(text)localStorage.setItem(key(username,chat),text);else localStorage.removeItem(key(username,chat))}catch{/* Keep the in-memory draft when browser storage is unavailable. */}}
export function useChatDraft(username:string){
 const [message,update]=useState(''),current=useRef<{username:string;chat:string|null;text:string}>({username,chat:null,text:''})
 const selectDraft=useCallback((chat:string|null,move=false)=>{
  const previous=current.current
  if(previous.username===username&&previous.chat===chat)return
  const carry=previous.username===username&&previous.chat===null&&chat!==null&&Boolean(previous.text)
  const saved=readChatDraft(username,chat),text=move&&previous.username===username?previous.text:carry?(saved&&saved!==previous.text?saved+'\n'+previous.text:previous.text):saved
  if(move||carry){writeChatDraft(username,chat,text);writeChatDraft(previous.username,previous.chat,'')}
  current.current={username,chat,text};update(text)
 },[username])
 const setMessage=useCallback((action:SetStateAction<string>)=>{
  const previous=current.current
  const text=typeof action==='function'?action(previous.text):action
  current.current={...previous,text};writeChatDraft(previous.username,previous.chat,text);update(text)
 },[])
 return {message,setMessage,selectDraft}
}
