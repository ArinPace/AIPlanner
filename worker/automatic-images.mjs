import { readBrowserPage } from './page-reader.mjs'
import { readPageImage } from './image-reader.mjs'
import { automaticImageSize } from './automatic-image-size.mjs'

export async function readWithImages(context, destination, options = {}) {
  return readBrowserPage(context, destination, { ...options, inspect: async (page, result, slack) => {
    const content = [], attached = [], unavailable = []
    let remaining = 8 * 1024 * 1024
    // Include the newest content images with every read, without requiring a
    // special user prompt. Extra images remain addressable by image index.
    const selected = result.images.slice(-4)
    for (const image of selected) {
      try {
        let output = await readPageImage(context,page,result,slack,image.index)
        let pixels = output.content.find(c=>c.type==='image')
        const fitted=await automaticImageSize(pixels)
        output.content=output.content.map(c=>c===pixels?fitted:c)
        pixels=fitted
        if (Buffer.byteLength(pixels.data,'base64') > remaining) {
          output = await readPageImage(context,page,result,slack,image.index,{ original:false })
          pixels = output.content.find(c=>c.type==='image')
        }
        const size = Buffer.byteLength(pixels.data,'base64')
        if (size > remaining) { unavailable.push(image.index); continue }
        remaining -= size; attached.push(image.index); content.push(...output.content)
      } catch { unavailable.push(image.index) }
    }
    return { content: [{ type:'text', text:JSON.stringify({ ...result, automaticImages:{ attached, unavailable, maxDimension:2400, remaining:result.images.filter(i=>!attached.includes(i.index)).map(i=>i.index) }, imageReading:'Inspect attached image pixels as part of this page read. Automatic images are fitted within 2400 pixels; browser_view_image returns originals for small text or additional relevant images. Never infer hidden or unreadable image details.' }) }, ...content] }
  } })
}
