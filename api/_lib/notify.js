import { sb, ARKESEL_KEY, ARKESEL_FROM, WABA_TOKEN, WABA_PHONE_ID, SENDGRID_KEY, SENDGRID_FROM, SENDGRID_NAME } from './config.js'

export const cleanPhone = (p) => {
  if (!p) return ''
  return String(p).replace(/\s/g, '').replace(/^0/, '233').replace(/^\+/, '')
}

// ── SMS via Arkesel v2 ──────────────────────────────────────────────────────
export async function sendSMS({ phone, message, leadId = null, type = 'general' }) {
  if (!ARKESEL_KEY) return { ok: false, error: 'ARKESEL_API_KEY not set' }
  const to = cleanPhone(phone)
  if (!to) return { ok: false, error: 'Invalid phone' }

  let ok = false
  try {
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': ARKESEL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: ARKESEL_FROM, message, recipients: [to] }),
    })
    const data = await res.json()
    ok = res.ok && (data.status === 'success' || data.code === 'ok')
    await sb.from('sms_log').insert({ lead_id: leadId, phone: to, message, type, provider: 'arkesel', status: ok ? 'sent' : 'failed' }).catch(() => {})
    return { ok, data }
  } catch (e) {
    await sb.from('sms_log').insert({ lead_id: leadId, phone: to, message, type, provider: 'arkesel', status: 'failed' }).catch(() => {})
    return { ok: false, error: e.message }
  }
}

// ── WhatsApp via WABA API (or wa.me log fallback) ───────────────────────────
export async function sendWA({ phone, message, leadId = null, type = 'general' }) {
  const to = cleanPhone(phone)
  if (!to) return { ok: false, error: 'Invalid phone' }

  if (WABA_TOKEN && WABA_PHONE_ID) {
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${WABA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: message, preview_url: true },
        }),
      })
      const data = await res.json()
      const ok = !!data.messages?.[0]?.id
      await sb.from('whatsapp_log').insert({ lead_id: leadId, phone: to, message, marketer_name: 'System (Auto)', status: ok ? 'sent' : 'failed' }).catch(() => {})
      return { ok, data }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  await sb.from('whatsapp_log').insert({ lead_id: leadId, phone: to, message, marketer_name: 'System (Auto)', status: 'pending_manual' }).catch(() => {})
  return { ok: false, manual: true, waUrl: `https://wa.me/${to}?text=${encodeURIComponent(message)}` }
}

// ── Email via SendGrid ──────────────────────────────────────────────────────
export async function sendEmail({ toEmail, toName = '', subject, html, text, attachments = [], type = 'general', leadId = null }) {
  if (!SENDGRID_KEY) return { ok: false, error: 'SENDGRID_API_KEY not set' }
  if (!toEmail)      return { ok: false, error: 'No email address' }

  const content = [
    ...(text ? [{ type: 'text/plain', value: text }] : []),
    ...(html ? [{ type: 'text/html',  value: html  }] : []),
  ]
  if (!content.length) return { ok: false, error: 'No email content' }

  try {
    const body = {
      personalizations: [{ to: [{ email: toEmail, name: toName }] }],
      from: { email: SENDGRID_FROM, name: SENDGRID_NAME },
      subject,
      content,
    }
    if (attachments.length) body.attachments = attachments
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SENDGRID_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const ok = res.status === 202
    await sb.from('email_log').insert({ to_email: toEmail, to_name: toName, subject, type, lead_id: leadId, status: ok ? 'sent' : 'failed' }).catch(() => {})
    return { ok }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
