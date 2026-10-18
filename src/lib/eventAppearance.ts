import { contrastText } from './colors'

export function eventAppearance(color:string,reminder?:boolean){
 return {background:reminder?'transparent':color,color:reminder?color:contrastText(color),...(reminder?{border:'1px solid '+color}:{})}
}
