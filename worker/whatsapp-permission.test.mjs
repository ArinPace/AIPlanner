import test from 'node:test'
import assert from 'node:assert/strict'
import { requireWhatsAppPermission, whatsappPermissionText } from './whatsapp-permission.mjs'

test('WhatsApp permission fails closed and honors revocation and disabled sources', async () => {
  for (const config of [{}, {sources:['whatsapp']}, {sources:['whatsapp'],whatsappReadConsentAt:'bad'}, {sources:[],whatsappReadConsentAt:new Date().toISOString()}]) await assert.rejects(requireWhatsAppPermission(async()=>config))
  await assert.rejects(requireWhatsAppPermission(async()=>{throw Error('offline')}))
  await requireWhatsAppPermission(async()=>({sources:['whatsapp'],whatsappReadConsentAt:'2026-10-18T07:00:00Z'}))
  assert.match(whatsappPermissionText(null), /not enabled/)
  assert.match(whatsappPermissionText('2026-10-18T07:00:00Z'), /explicitly named/)
  assert.match(whatsappPermissionText('2026-10-18T07:00:00Z'), /may mark messages as read/)
  assert.match(whatsappPermissionText('2026-10-18T07:00:00Z'), /does not authorize sending/)
})
