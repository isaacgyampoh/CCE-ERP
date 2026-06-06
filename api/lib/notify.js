/**
 * CCE ERP — Unified Notification Sender
 * Sends via: SMS (Arkesel), WhatsApp (WABA or wa.me log), Email (SendGrid)
 *
 * Usage:
 *   import { sendSMS, sendWA, sendEmail, sendAll } from './notify.js'
 */

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const ARKESEL_KEY   = process.env.ARKESEL_API_KEY
const ARKESEL_FROM  = process.env.ARKESEL_SENDER_ID || 'CCE-Ghana'
const WABA_TOKEN    = process.env.WABA_TOKEN
const WABA_PHONE_ID = process.env.WABA_PHONE_ID
const SENDGRID_KEY  = process.env.SENDGRID_API_KEY
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL || 'info@cambridgecoe.edu.gh'
const SENDGRID_NAME = process.env.SENDGRID_FROM_NAME  || 'Cambridge Center of Excellence'

// ── Clean phone to E.164 for Ghana ─────────────────────────────────────────
export const cleanPhone = (p) => {
  if (!p) return ''
  return p.replace(/\s/g,'').replace(/^0/,'233').replace(/^\+/,'')
}

// ── SMS via Arkesel ─────────────────────────────────────────────────────────
export async function sendSMS({ phone, message, leadId = null, type = 'general' }) {
  if (!ARKESEL_KEY) return { ok: false, error: 'ARKESEL_API_KEY not set' }
  const cleanedPhone = cleanPhone(phone)
  if (!cleanedPhone) return { ok: false, error: 'Invalid phone' }

  try {
    const res = await fetch('https://sms.arkesel.com/sms/api?action=send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: ARKESEL_KEY,
        to: cleanedPhone,
        from: ARKESEL_FROM,
        sms: message,
      })
    })
    const data = await res.json()
    const ok = data.code === 'ok' || data.status === 'success'

    await sb.from('sms_log').insert({
      lead_id: leadId, phone: cleanedPhone, message, type,
      provider: 'arkesel', status: ok ? 'sent' : 'failed',
    })

    return { ok, data }
  } catch (e) {
    await sb.from('sms_log').insert({ lead_id: leadId, phone: cleanedPhone, message, type, provider: 'arkesel', status: 'failed' })
    return { ok: false, error: e.message }
  }
}

// ── WhatsApp via WABA ───────────────────────────────────────────────────────
export async function sendWA({ phone, message, leadId = null, type = 'general' }) {
  const cleanedPhone = cleanPhone(phone)
  if (!cleanedPhone) return { ok: false, error: 'Invalid phone' }

  // If WABA configured, use API
  if (WABA_TOKEN && WABA_PHONE_ID) {
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${WABA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanedPhone,
          type: 'text',
          text: { body: message, preview_url: true },
        })
      })
      const data = await res.json()
      const ok = !!data.messages?.[0]?.id
      await sb.from('whatsapp_log').insert({ lead_id: leadId, phone: cleanedPhone, message, marketer_name: 'System (Auto)', status: ok ? 'sent' : 'failed' })
      return { ok, data }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // Fallback: log it (frontend can open wa.me)
  await sb.from('whatsapp_log').insert({ lead_id: leadId, phone: cleanedPhone, message, marketer_name: 'System (Auto)', status: 'pending_manual' })
  return { ok: false, manual: true, waUrl: `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}` }
}

// ── Email via SendGrid ──────────────────────────────────────────────────────
export async function sendEmail({ toEmail, toName, subject, html, text, type = 'general', leadId = null }) {
  if (!SENDGRID_KEY) return { ok: false, error: 'SENDGRID_API_KEY not set' }
  if (!toEmail) return { ok: false, error: 'No email address' }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SENDGRID_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail, name: toName || '' }] }],
        from: { email: SENDGRID_FROM, name: SENDGRID_NAME },
        subject,
        content: [
          ...(text ? [{ type: 'text/plain', value: text }] : []),
          ...(html ? [{ type: 'text/html',  value: html  }] : []),
        ],
      })
    })
    const ok = res.ok || res.status === 202
    await sb.from('email_log').insert({ to_email: toEmail, to_name: toName || '', subject, type, lead_id: leadId, status: ok ? 'sent' : 'failed' })
    return { ok }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── Send All (SMS + WA + Email) ─────────────────────────────────────────────
export async function sendAll({ phone, email, name, message, subject, html, leadId, type }) {
  const results = {}
  if (phone) {
    results.sms = await sendSMS({ phone, message, leadId, type })
    results.wa  = await sendWA({ phone, message, leadId, type })
  }
  if (email) {
    results.email = await sendEmail({ toEmail: email, toName: name, subject, html: html || `<p>${message.replace(/\n/g,'<br>')}</p>`, leadId, type })
  }
  return results
}
