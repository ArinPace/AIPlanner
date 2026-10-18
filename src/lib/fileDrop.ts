export function isFileDrop(transfer:DataTransfer){
 return Array.from(transfer.types).some(type=>['files','downloadurl'].includes(type.toLowerCase())) || Array.from(transfer.items).some(item=>item.kind==='file')
}
export function droppedFiles(transfer:DataTransfer){
 const files=Array.from(transfer.files)
 return files.length?files:Array.from(transfer.items).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>file!==null)
}
