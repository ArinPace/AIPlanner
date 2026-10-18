export type PlanningTask = {
 id: string; title: string; category: string; urgency: number; minutes: number; deadline: string | null;
 preferredDays: number[]; earliestDate: string | null; status: 'todo'|'done'; source: string; goal: string;
}
export type PlanningProfile = {
 enabled: boolean; onboarded: boolean; wake: string; sleep: string; intensity: number;
 weekdays: (number|null)[]; overrides: Record<string,number>; recoveryUntil: string | null;
 goals: string; preferences: string; breakActivities: string[];
 tasks: PlanningTask[]; learning: Record<string,{samples:number;ratio:number}>;
 feedback: {id:string;taskId:string;estimated:number;actual:number|null;outcome:'completed'|'missed';at:string}[];
}
export const DEFAULT_PLANNING: PlanningProfile = {
 enabled:false,onboarded:false,wake:'07:00',sleep:'23:00',intensity:50,weekdays:[null,null,null,null,null,null,null],overrides:{},recoveryUntil:null,
 goals:'',preferences:'',breakActivities:['Close your eyes and rest','Listen to calming music','Gentle breathing: inhale for 4 seconds, exhale for 6','Take a short walk'],tasks:[],learning:{},feedback:[],
}
export function intensityFor(profile:PlanningProfile,date:string,weekday:number){
 const value=profile.overrides[date] ?? profile.weekdays[weekday] ?? profile.intensity
 return profile.recoveryUntil && date<=profile.recoveryUntil ? Math.min(value,20) : value
}
export function intensityDescription(value:number){return value<=30?'Gentle':value>=75?'Focused':'Balanced'}
