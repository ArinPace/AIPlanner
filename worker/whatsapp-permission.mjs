export function whatsappPermissionText(consentAt) {
  if (typeof consentAt !== 'string' || !Number.isFinite(Date.parse(consentAt))) return 'WhatsApp message-reading permission is not enabled. Ask the user to enable it in Add sites > WhatsApp before opening a chat.'
  return `The user explicitly authorized WhatsApp reading in their account settings at ${consentAt}. Scope: open and read only chats/groups explicitly named by the user in their requests or saved review instructions, including direct messages they select. The user accepts that opening these chats may mark messages as read. This does not authorize sending, reacting, deleting, changing settings, reading unrelated chats, or bypassing a safety rejection. Use browser_read_whatsapp_chat for the exact selected name.`
}

export async function requireWhatsAppPermission(fetchConfig) {
  const config = await fetchConfig()
  if (!config.sources?.includes('whatsapp') || !config.whatsappReadConsentAt || !Number.isFinite(Date.parse(config.whatsappReadConsentAt))) throw new Error('WhatsApp reading is not authorized. Enable selected-chat reading in Add sites > WhatsApp.')
}
