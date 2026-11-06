const watched=new WeakSet(),pending=new WeakMap(),sessions=new WeakMap()
export const PLANNER_BROWSER_TIMEZONE='America/New_York'
export async function applyBrowserTimezone(context){
 const apply=page=>{
  if(pending.has(page))return pending.get(page)
  const operation=(async()=>{
   if(page.isClosed())return
   if(await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone)===PLANNER_BROWSER_TIMEZONE)return
   let session=sessions.get(page)
   if(!session){session=await context.newCDPSession(page);sessions.set(page,session);page.once('close',()=>{sessions.delete(page);void session.detach().catch(()=>{})})}
   await session.send('Emulation.setTimezoneOverride',{timezoneId:PLANNER_BROWSER_TIMEZONE})
  })().finally(()=>pending.delete(page))
  pending.set(page,operation);return operation
 }
 if(!watched.has(context)){watched.add(context);context.on('page',page=>{void apply(page).catch(()=>{})})}
 await Promise.all(context.pages().map(apply))
 return context
}
