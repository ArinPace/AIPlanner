export type BottomTab='calendar'|'todo'|'work'|'screentime'
const items:{id:BottomTab;label:string;path:string}[]=[
 {id:'calendar',label:'Calendar',path:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'},
 {id:'todo',label:'To-do',path:'m7 12 3 3 7-7M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z'},
 {id:'work',label:'Work',path:'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c5 4 13 4 18 0M12 12v4M5 7h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z'},
 {id:'screentime',label:'Screen Time',path:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm0 5v5l3 2'},
]
export function BottomWorkspaceNav({tab,onChange}:{tab:string;onChange:(tab:BottomTab)=>void}){return <nav className="bottom-workspace-nav" aria-label="Workspace">{items.map(item=><button type="button" key={item.id} aria-current={tab===item.id?'page':undefined} className={tab===item.id?'is-active':''} onClick={()=>onChange(item.id)}><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={item.path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg><span>{item.label}</span></button>)}</nav>}
