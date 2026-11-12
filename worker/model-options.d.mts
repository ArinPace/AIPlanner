export type ModelChoice={model:string;label:string;efforts:string[];tiers:{id:string;label:string}[]}
export type GenerationOptions={reset?:boolean;model?:string;effort?:string;serviceTier?:string}
export function modelCatalog(rows:unknown):ModelChoice[]
export function generationOptions(value:unknown,catalog:ModelChoice[]):GenerationOptions
