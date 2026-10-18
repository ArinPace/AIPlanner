export type ChatAttachment={id:string;name:string;kind:'image'|'pdf'|'text';size:number;data:string;text?:string;images?:string[];thumbnail?:string;coverage:string}
export type AttachmentSummary=Pick<ChatAttachment,'id'|'name'|'kind'|'size'|'thumbnail'|'coverage'>
export const ATTACHMENT_LIMIT=2*1024*1024
export const ATTACHMENT_COUNT=4
