import type {SubscriptionAttempt} from '../lib/subscriptionChat'
import {ChatMarkdown} from './ChatMarkdown'
type LiveReply={text:string;phase:string;interaction:boolean;onStop:()=>void}
export function ChatAttempt({attempt,live,onReview,onReply,disabled}:{attempt:SubscriptionAttempt;live?:LiveReply;onReview:()=>void;onReply?:(text:string)=>void;disabled:boolean}){
 const interrupted=attempt.status==='failed'||attempt.status==='interrupted'
 const status=interrupted?'Interrupted':attempt.submitted_at?'No final reply saved':'Delivery unconfirmed'
 const text=live?.text||attempt.partial_reply
 return <article className="assistant-turn chat-attempt" data-attempt-id={attempt.id}>
  <div className="assistant-user-message" role="group" aria-label="Your message"><ChatMarkdown text={attempt.prompt}/></div>
  {text&&<div className="assistant-reply" role="group" aria-label={live?'Assistant reply in progress':'Partial assistant reply'} aria-busy={Boolean(live)}><ChatMarkdown text={text} onReply={onReply} replyDisabled={disabled}/></div>}
  {live?<div role="status" className="chat-attempt-thinking"><span className="chat-thinking-dot" aria-hidden="true"/><span>{live.phase||'Thinking…'}</span><button type="button" onClick={onReview}>{live.interaction?'Finish sign-in':'Open session'}</button><button type="button" aria-label="Stop reply" disabled={!attempt.submitted_at} onClick={live.onStop}>Stop</button></div>:<div className="chat-attempt-status" role="status"><strong>{status}{text?' · partial reply retained':''}</strong><details><summary>Details</summary><p>{attempt.detail||'This request has no saved final reply. Check the ChatGPT session before sending it again.'}</p><time dateTime={attempt.created_at}>Started {new Date(attempt.created_at).toLocaleString()}</time><p>{attempt.submitted_at?'Delivery confirmed.':'Delivery to ChatGPT was not confirmed.'}</p></details><button type="button" disabled={disabled} onClick={onReview}>Review session</button></div>}
 </article>
}
