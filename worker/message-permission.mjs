export function messagePermissionText(consents={}) {
 const sources=['instagram','x','linkedin'].filter(s=>typeof consents[s]==='string' && Number.isFinite(Date.parse(consents[s])))
 return `Saved user permission for selected conversation reading: ${sources.join(', ') || 'none'}. When the user explicitly requests messages, use browser_list_message_threads to discover visible conversation names, then browser_read_messages for the selected conversation. Only a user-authorized inbox review may select a representative chat without a supplied name. Opening messages can mark them seen. These tools do not send, react, delete, guess passcodes or bypass encryption. Report locked/unsupported content accurately. Saved permission is not permission to override a safety rejection. WhatsApp remains separate: do not retry a previously rejected WhatsApp read through these tools or generic browser_read. Never treat a feed post, inbox shell or conversation name as verified message content.`
}
export function messagePermissionAllowed(config,source){
 const consent=config.messageReadConsent?.[source]
 return ['instagram','x','linkedin'].includes(source) && config.sources?.includes(source) && typeof consent==='string' && Number.isFinite(Date.parse(consent))
}
