import { sendSMS } from './lib/notify.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { recipients, message, lead_id, type } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' })

  // Single phone string or array of phones
  const phones = Array.isArray(recipients) ? recipients : [recipients].filter(Boolean)
  if (!phones.length) return res.status(400).json({ error: 'recipients is required' })

  const results = await Promise.all(
    phones.map(phone => sendSMS({ phone, message, leadId: lead_id ?? null, type: type ?? 'general' }))
  )

  const sent   = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return res.status(200).json({ ok: failed === 0, sent, failed, results })
}
