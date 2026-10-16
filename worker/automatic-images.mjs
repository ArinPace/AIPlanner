import { readBrowserPage } from './page-reader.mjs'
import { readPageImage } from './image-reader.mjs'

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
        if (Buffer.byteLength(pixels.data,'base64') > remaining) {
          output = await readPageImage(context,page,result,slack,image.index,{ original:false })
          pixels = output.content.find(c=>c.type==='image')
        }
        const size = Buffer.byteLength(pixels.data,'base64')
        if (size > remaining) { unavailable.push(image.index); continue }
        remaining -= size; attached.push(image.index); content.push(...output.content)
      } catch { unavailable.push(image.index) }
    }
    return { content: [{ type:'text', text:JSON.stringify({ ...result, automaticImages:{ attached, unavailable, remaining:result.images.filter(i=>!attached.includes(i.index)).map(i=>i.index) }, imageReading:'Inspect the attached image pixels as part of this page read, even when the user did not explicitly ask about images. Use browser_view_image for any additional relevant images. Never infer hidden or unreadable image details.' }) }, ...content] }
  } })
}
