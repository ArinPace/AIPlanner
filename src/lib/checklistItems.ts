export const ITEM_ID=/\[item:([0-9a-f-]{36})\]\s*/gi
export function checklistLabel(value:string){return value.replace(ITEM_ID,'').replace(/\[urgency:\d{1,2}\]\s*/g,'').trim()}
export function checklistItems(content:string){
 const rows:{index:number;line:number;id:string|null;label:string;checked:boolean}[]=[];let fenced=false
 content.split('\n').forEach((line,lineIndex)=>{
  if(/^\s*(```|~~~)/.test(line)){fenced=!fenced;return}if(fenced)return
  const match=line.match(/^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+(.+)$/);if(!match)return
  rows.push({index:rows.length,line:lineIndex,id:match[2].match(/\[item:([0-9a-f-]{36})\]/i)?.[1]||null,label:checklistLabel(match[2]),checked:match[1].toLowerCase()==='x'})
 });return rows
}
