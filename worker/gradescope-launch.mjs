import { brightspaceContents } from './brightspace-reader.mjs'
import { brightspaceCourse, signedInPage } from './site-status.mjs'

export async function resumeGradescope(context,courseUrl,{timeout=15000}={}) {
  const course=brightspaceCourse(courseUrl)
  if(!course)return false
  const index=await brightspaceContents(context,course,{includeLaunch:true}).catch(()=>null)
  const candidates=index?.topics.filter(t=>t.launchUrl) || []
  if(candidates.length!==1)return false
  const previous=new Set(context.pages()),page=await context.newPage()
  try{
    await page.goto(candidates[0].launchUrl,{waitUntil:'domcontentloaded',timeout}).catch(()=>{})
    const deadline=Date.now()+timeout
    while(Date.now()<deadline){
      for(const candidate of context.pages().filter(p=>!previous.has(p))){
        for(const frame of candidate.frames()){
          let u;try{u=new URL(frame.url())}catch{continue}
          if(u.hostname.replace(/^www\./,'')!=='gradescope.com')continue
          const text=await frame.locator('body').innerText({timeout:1000}).catch(()=>'')
          if(signedInPage('gradescope',frame.url(),text,await frame.locator('input[type=password]:visible').count()>0))return true
          if(/login|signin|auth/.test(u.pathname) && await frame.locator('input[type=password]:visible').count()>0)return false
        }
      }
      await new Promise(r=>setTimeout(r,500))
    }
    return false
  }finally{for(const candidate of context.pages().filter(p=>!previous.has(p)))await candidate.close().catch(()=>{})}
}
