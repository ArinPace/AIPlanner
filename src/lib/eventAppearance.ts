import { contrastText } from './colors'

export function eventAppearance(color:string,reminder?:boolean){
 if(!reminder&&color.toLowerCase()==='#ffffff')return {background:'#ffffff',color:'#000000',border:'1px solid #000000'}
 return {background:reminder?'transparent':color,color:reminder?color:contrastText(color),...(reminder?{border:'1px solid '+color}:{})}
}
