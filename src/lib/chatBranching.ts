export function canBranchChat(chat:{is_main?:boolean;tutor_subject_id?:string|null}|null|undefined){return Boolean(chat&&!chat.is_main&&!chat.tutor_subject_id)}
