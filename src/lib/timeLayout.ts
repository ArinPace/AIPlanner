// Allocate columns independently for each connected group of visible cards.
// The rendered bottom includes wrapped titles, even for five-minute events.
export function layoutTimeCards<T extends {top:number;bottom:number}>(items:T[]):(T&{col:number;cols:number})[] {
  const sorted=[...items].sort((a,b)=>a.top-b.top || b.bottom-a.bottom)
  const result:(T&{col:number;cols:number})[]=[]
  let group:T[]=[],groupEnd=-Infinity
  function flush(){
    const ends:number[]=[]
    const placed=group.map(item=>{
      let col=ends.findIndex(end=>end<=item.top)
      if(col<0)col=ends.length
      ends[col]=item.bottom
      return {...item,col}
    })
    result.push(...placed.map(item=>({...item,cols:ends.length})))
    group=[]
  }
  for(const item of sorted){
    if(group.length && item.top>=groupEnd)flush()
    group.push(item)
    groupEnd=group.length===1?item.bottom:Math.max(groupEnd,item.bottom)
  }
  flush()
  return result
}
