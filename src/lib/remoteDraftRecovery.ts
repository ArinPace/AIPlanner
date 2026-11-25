export async function clearReviewedDraft(expected:string,clear:(expected:string)=>Promise<unknown>,read:()=>Promise<{text:string}>){
 let error:unknown
 try{await clear(expected)}catch(value){error=value}
 try{
  const current=await read()
  if(!current.text.trim())return {cleared:true as const}
  return {cleared:false as const,text:current.text,error:error instanceof Error?error.message:'The draft is still present. Your text has been kept.'}
 }catch{
  return {cleared:false as const,text:expected,error:error instanceof Error?error.message:'Could not verify the draft was cleared. Your reviewed text has been kept.'}
 }
}
