import sharp from 'sharp'
// Originals stay available through browser_view_image. Automatic attachments
// need bounded pixel dimensions as well as compressed bytes to bound inference RAM.
export async function automaticImageSize(pixels) {
  const bytes=Buffer.from(pixels.data,'base64')
  const image=sharp(bytes,{limitInputPixels:64000000})
  const metadata=await image.metadata()
  if((metadata.width || 0)<=2400 && (metadata.height || 0)<=2400)return pixels
  const resized=await image.resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer()
  return {...pixels,data:resized.toString('base64'),mimeType:'image/jpeg'}
}
