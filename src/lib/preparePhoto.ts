export const PHOTO_SOURCE_LIMIT=25*1024*1024
export const PHOTO_SEND_LIMIT=480*1024
export async function preparePhoto(file:File,mime:string,maxBytes=PHOTO_SEND_LIMIT){
 if(!file.size||file.size>PHOTO_SOURCE_LIMIT)throw Error('Choose a nonempty photo up to 25 MB.')
 const url=URL.createObjectURL(file),image=new Image()
 try{
  image.src=url
  try{await image.decode()}catch{throw Error('This photo could not be decoded. Try sharing or exporting it as JPEG or PNG.')}
  const originalWidth=image.naturalWidth,originalHeight=image.naturalHeight
  if(!originalWidth||!originalHeight)throw Error('This photo has no readable image dimensions.')
  if(['image/png','image/jpeg','image/webp'].includes(mime)&&file.size<=maxBytes&&Math.max(originalWidth,originalHeight)<=2560)return {blob:new Blob([file],{type:mime}),resized:false,width:originalWidth,height:originalHeight}
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d')
  if(!context)throw Error('Could not prepare this photo in your browser.')
  let edge=Math.min(2560,Math.max(originalWidth,originalHeight))
  for(let attempt=0;attempt<14;attempt++){
   const scale=Math.min(1,edge/Math.max(originalWidth,originalHeight))
   canvas.width=Math.max(1,Math.round(originalWidth*scale));canvas.height=Math.max(1,Math.round(originalHeight*scale))
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height)
   context.drawImage(image,0,0,canvas.width,canvas.height)
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',attempt%2===0?.9:.78))
   if(!blob)throw Error('Could not encode this photo. Try JPEG or PNG.')
   if(blob.size<=maxBytes)return {blob,resized:true,width:canvas.width,height:canvas.height}
   if(attempt%2===1)edge*=.8
  }
  throw Error('This photo could not be reduced enough to send. Try cropping it or sending a smaller copy.')
 }finally{URL.revokeObjectURL(url)}
}
