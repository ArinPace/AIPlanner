export const isWhoopBackground=(prompt:string)=>prompt==='Scheduled WHOOP sleep check'||prompt.startsWith('WHOOP BACKGROUND UPDATE.')||prompt.startsWith('HOURLY WHOOP SLEEP FOLLOW-UP.')
export function whoopBackgroundIds(messages:{id:string;role:string;content:string}[]){
 const ids=new Set<string>();let background=false
 for(const item of messages){if(item.role==='user')background=isWhoopBackground(item.content);if(background)ids.add(item.id)}
 return ids
}
