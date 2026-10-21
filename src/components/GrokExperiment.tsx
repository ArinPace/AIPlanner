import {useState} from 'react'

export function GrokExperiment(){
 const [testing,setTesting]=useState(false)
 return <section className="grok-experiment" aria-label="Grok experiment">
  <header><h1>Grok <small>Temporary test</small></h1>
   <p>Explore Grok Bot alongside AI Planner. No Grok account is connected to Planner yet.</p></header>
  <div className="grok-experiment-card">
   <h2>Grok Bot</h2>
   <p>Grok Bot runs on its own cloud computer. Its desktop and phone apps connect to the same bots and conversations.</p>
   <p>The published setup uses Grok Bot’s apps. This tab does not yet embed or control those apps.</p>
   <a className="primary-btn" href="https://x.ai/bot" target="_blank" rel="noopener noreferrer">Open Grok Bot setup</a>
   <a href="https://docs.x.ai/grok-bot/mobile" target="_blank" rel="noopener noreferrer">Phone setup guide</a>
  </div>
  <div className="grok-experiment-card">
   <h2>Web embed test</h2>
   <p>Grok Chat’s website currently blocks embedding in other websites. Signing in does not remove that restriction. This test loads Grok Chat, not the Grok Bot desktop app.</p>
   <button type="button" className="text-btn" onClick={()=>setTesting(value=>!value)}>{testing?'Close embed test':'Try web embed'}</button>
   <a href="https://grok.com" target="_blank" rel="noopener noreferrer">Open Grok Chat separately</a>
   {testing&&<><p role="status">If the frame is blank or says “refused to connect,” the website blocked the embed. This does not indicate a connected account.</p><iframe title="Grok Chat embed experiment" src="https://grok.com" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"/></>}
  </div>
 </section>
}
