export async function readGoogleDocument(context,href) {
  const source=new URL(href)
  const match=source.hostname==='docs.google.com' && source.pathname.match(/^\/(document|spreadsheets)\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)(?:\/|$)/)
  if(!match)return null
  const sheet=match[1]==='spreadsheets'
  const exportUrl=new URL('/'+match[1]+'/d/'+match[2]+'/export',source.origin)
  exportUrl.searchParams.set('format',sheet?'csv':'txt')
  const gid=source.searchParams.get('gid') || new URLSearchParams(source.hash.slice(1)).get('gid') || '0'
  if(sheet){if(!/^\d+$/.test(gid))return null;exportUrl.searchParams.set('gid',gid)}
  if(source.searchParams.has('authuser'))exportUrl.searchParams.set('authuser',source.searchParams.get('authuser'))
  let url=exportUrl.href
  for(let attempt=0;attempt<4;attempt++){
    const u=new URL(url)
    if(u.protocol!=='https:' || u.username || u.password || !(u.hostname==='docs.google.com' || u.hostname.endsWith('.googleusercontent.com')))return null
    const response=await context.request.get(url,{timeout:25000,maxRedirects:0})
    try{
      if([301,302,303,307,308].includes(response.status())){url=new URL(response.headers().location,url).href;continue}
      if(!response.ok() || !(sheet?/^(?:text\/csv|text\/plain|application\/csv)\b/i:/^text\/plain\b/i).test(response.headers()['content-type'] || '') || Number(response.headers()['content-length'] || 0)>2*1024*1024)return null
      const bytes=await response.body();if(bytes.length>2*1024*1024)return null
      const text=bytes.toString('utf8');if(!text.trim())return null
      return {text:text.slice(0,80000),truncated:text.length>80000,...(sheet?{sheetId:gid}:{}),coverage:sheet?'Authenticated Google spreadsheet CSV export for tab gid='+gid+'. Other tabs, images, formulas, comments and linked documents are not included.':'Authenticated Google document text export. Images, comments, linked documents and form responses are not included.'}
    }finally{await response.dispose()}
  }
  return null
}
