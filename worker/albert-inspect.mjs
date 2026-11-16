import {albertHosts} from './browser-sources.mjs'
export async function inspectAlbertPage(page,identityText){
 const frames=[]
 for(const frame of page.frames()){
  let url;try{url=new URL(frame.url())}catch{continue}
  if(url.protocol!=='https:'||!albertHosts.has(url.hostname))continue
  const data=await frame.evaluate(identity=>{
   const norm=s=>String(s||'').replace(/\s+/g,' ').trim()
   const visible=n=>!!(n.getBoundingClientRect().width&&n.getBoundingClientRect().height)
   const selector=n=>{if(n.id)return '[id='+JSON.stringify(n.id)+']';const parts=[];for(let p=n;p&&p!==document.documentElement;p=p.parentElement){const tag=p.tagName.toLowerCase();parts.unshift(tag+':nth-of-type('+([...p.parentElement.children].filter(c=>c.tagName===p.tagName).indexOf(p)+1)+')');if(p.parentElement.id){parts.unshift('[id='+JSON.stringify(p.parentElement.id)+']');break}}return parts.join(' > ')}
   const needle=norm(identity).toLowerCase(),boundary=new RegExp('(?:^|\\W)'+needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|\\W)')
   const matches=[...document.querySelectorAll('tr,[role=row],section,article,div')].filter(n=>visible(n)&&boundary.test(norm(n.innerText).toLowerCase())&&norm(n.innerText).length<1800)
   const rows=matches.filter(n=>!matches.some(other=>other!==n&&n.contains(other)))
   return {candidates:rows.slice(0,8).map(row=>{
    let container=row.closest('tr,[role=row]')||row
    for(let i=0;i<4&&container&&!container.querySelector('img[alt],td,[role=cell],.status,[id*=STATUS],[id*=status]');i++)container=container.parentElement
    if(!container||norm(container.innerText).length>3000)container=row
    const statuses=[container,...container.querySelectorAll('*')].filter(n=>visible(n)&&/^(open|available|closed|waitlist|wait list|full)$/i.test(norm(n.getAttribute('alt')||n.getAttribute('aria-label')||n.innerText)))
    return {rowSelector:selector(container),text:norm(container.innerText).slice(0,1800),statuses:statuses.filter(n=>!statuses.some(other=>other!==n&&n.contains(other))).slice(0,8).map(n=>({statusSelector:n===container?':scope':selector(n).startsWith(selector(container)+' > ')?selector(n).slice(selector(container).length+3):selector(n),status:norm(n.getAttribute('alt')||n.getAttribute('aria-label')||n.innerText)}))}
   }),controls:[...document.querySelectorAll('input:not([type=password]):not([type=hidden]),select,button,a')].filter(n=>visible(n)&&!n.matches('input')||visible(n)&&n.matches('input')&&!/password|credential|username|otp/i.test(n.id+' '+n.name)).slice(0,120).map(n=>({selector:selector(n),tag:n.tagName.toLowerCase(),label:norm(n.innerText||n.getAttribute('aria-label')||n.getAttribute('title')||n.getAttribute('value')).slice(0,120),options:n.matches('select')?[...n.options].map(o=>({value:o.value,label:o.text})):undefined}))}
  },identityText)
  frames.push({url:frame.url(),...data})
 }
 return {url:page.url(),identityText,frames,instructions:'Selectors describe this rendered page only. Verify exact term, course and section. Test URL and search steps in a fresh tab before saving; positional selectors may change. Status selectors are CSS selectors scoped within rowSelector.'}
}
