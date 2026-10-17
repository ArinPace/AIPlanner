export async function brightspaceContents(context,href,{includeLaunch=false}={}) {
  const u=new URL(href)
  if(u.hostname!=='brightspace.nyu.edu')return null
  const id=u.pathname.match(/\/(?:home|lessons|content)\/(\d+)/)?.[1] || u.searchParams.get('ou')
  if(!id || !/^\d+$/.test(id))return null
  const response=await context.request.get(u.origin+'/d2l/api/le/1.82/'+id+'/content/toc',{timeout:15000,maxRedirects:0})
  try{
    if(!response.ok() || !/json/i.test(response.headers()['content-type'] || '') || Number(response.headers()['content-length'] || 0)>4*1024*1024)return null
    const body=await response.body();if(body.length>4*1024*1024)return null
    const data=JSON.parse(body.toString('utf8')),topics=[]
    function visit(node,path=[]){
      if(!node || typeof node!=='object' || node.IsHidden || node.IsLocked)return
      const title=String(node.Title || '').slice(0,300),parts=title?[...path,title]:path
      let launchUrl
      if(includeLaunch && /gradescope/i.test(title) && typeof node.Url==='string')try{const launch=new URL(node.Url,u.origin);if(launch.origin===u.origin && launch.pathname.startsWith('/d2l/') && (/lti/i.test(launch.pathname) || launch.searchParams.get('type')==='lti'))launchUrl=launch.href}catch{}
      if(node.TopicId && /^\d+$/.test(String(node.TopicId)))topics.push({title,path:parts.join(' / '),url:u.origin+'/d2l/le/content/'+id+'/viewContent/'+node.TopicId+'/View',...(launchUrl?{launchUrl}:{}),...(/^https:\/\/(docs\.google\.com|forms\.gle|forms\.google\.com)\//.test(node.Url || '')?{documentUrl:node.Url}:{})})
      for(const key of ['Modules','Topics','Structure'])if(Array.isArray(node[key]))for(const child of node[key])visit(child,parts)
    }
    if(Array.isArray(data))data.forEach(n=>visit(n));else visit(data)
    return {courseId:id,topics:topics.slice(0,300),coverage:'Permission-checked course content index only. Follow topic URLs to read the actual requirements; this is not a complete course-content review.'}
  }finally{await response.dispose()}
}
