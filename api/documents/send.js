/**
 * CCE ERP — Send Document to Lead
 * POST /api/documents/send
 *
 * Sends a PDF from the Document Hub to a lead via Email (SendGrid) and/or WhatsApp link.
 * Called manually from the Documents page or auto-triggered by lead_created / payment_confirmed events.
 *
 * Body: { document_id, lead_id, channels: ['email','whatsapp'], context: { name, course, amount, receipt_no, balance }, sent_by? }
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail, sendWA } from '../_lib/notify.js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

function buildBodyText({ doc, lead, ctx }) {
  const trigger = doc.trigger_event
  const course  = ctx.course || lead.course_interest || ''
  if (trigger === 'lead_created') {
    return `Thank you for your interest in <strong>Cambridge Center of Excellence</strong>! 🎓<br/><br/>
We're excited to share more about our programs with you.${course ? ` You expressed interest in <strong>${course}</strong>.` : ''}<br/><br/>
Please find the attached document for more information.`
  }
  if (trigger === 'admission_approved') {
    return `Congratulations! 🎉 We are pleased to confirm your admission to <strong>Cambridge Center of Excellence</strong>.<br/><br/>
${course ? `Program: <strong>${course}</strong><br/><br/>` : ''}
Please find your official admission letter attached. Complete your enrolment by settling your programme fees.`
  }
  if (trigger === 'payment_confirmed') {
    return `Your payment has been successfully confirmed ✅<br/><br/>
${ctx.receipt_no ? `Receipt No: <strong>${ctx.receipt_no}</strong><br/>` : ''}
${ctx.amount     ? `Amount Paid: <strong>GH₵ ${Number(ctx.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</strong><br/>` : ''}
${ctx.balance != null ? `Balance: <strong>GH₵ ${Number(ctx.balance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}</strong><br/>` : ''}
<br/>Please find your official receipt/invoice attached.`
  }
  return `Please find the attached document from Cambridge Center of Excellence.`
}

function buildEmailHtml({ doc, lead, ctx }) {
  const firstName = ((lead.name || ctx.name || 'Student').split(' ')[0])
  const body = buildBodyText({ doc, lead, ctx })
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr><td>
      <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 24px;border-radius:16px 16px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:22px;font-weight:800;">Cambridge Center of Excellence</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">Empowering Excellence in Education</p>
      </div>
      <div style="background:white;padding:28px 24px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:0;">
        <p style="font-size:16px;margin:0 0 12px;">Dear <strong>${firstName}</strong>,</p>
        <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">${body}</p>
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px;margin:20px 0;display:flex;align-items:center;gap:12px;">
          <span style="font-size:28px;">📄</span>
          <div>
            <div style="font-weight:700;font-size:15px;color:#0c4a6e;">${doc.name}</div>
            <a href="${doc.file_url}" style="color:#2563eb;font-size:13px;text-decoration:none;">View / Download PDF ↗</a>
          </div>
        </div>
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0;"/>
        <p style="font-size:13px;color:#64748b;margin:0;">Best regards,<br/>
        <strong>Cambridge Center of Excellence</strong><br/>
        Accra, Ghana &nbsp;·&nbsp; admissions@cambridgecoe.edu.gh</p>
      </div>
    </td></tr>
  </table>
</body>
</html>`
}

function buildWAMessage({ doc, lead, ctx }) {
  const firstName = (lead.name || ctx.name || 'Student').split(' ')[0]
  const trigger   = doc.trigger_event
  const course    = ctx.course || lead.course_interest || ''
  const lines = [`📄 *${doc.name}*`, ``, `Dear *${firstName}*,`]
  if (trigger === 'lead_created') {
    lines.push(`Thank you for your interest in Cambridge Center of Excellence! 🎓`)
    if (course) lines.push(`Course interest: *${course}*`)
    lines.push(`Please find your document at the link below.`)
  } else if (trigger === 'admission_approved') {
    lines.push(`Congratulations! 🎉 Your admission to Cambridge Center of Excellence has been confirmed.`)
    if (course) lines.push(`Programme: *${course}*`)
  } else if (trigger === 'payment_confirmed') {
    lines.push(`Your payment has been confirmed ✅`)
    if (ctx.receipt_no) lines.push(`Receipt No: *${ctx.receipt_no}*`)
    if (ctx.amount)     lines.push(`Amount Paid: *GH₵ ${Number(ctx.amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })}*`)
    if (ctx.balance != null) lines.push(`Balance: *GH₵ ${Number(ctx.balance).toLocaleString('en-GH', { minimumFractionDigits: 2 })}*`)
  } else {
    lines.push(`Please find below a document from Cambridge Center of Excellence.`)
  }
  lines.push(``, `📎 *Download:*`)
  lines.push(doc.file_url)
  lines.push(``, `— Cambridge Center of Excellence 🎓`)
  return lines.join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    document_id,
    lead_id,
    channels = ['email', 'whatsapp'],
    context: ctx = {},
    sent_by,
  } = req.body

  if (!document_id || !lead_id) return res.status(400).json({ error: 'document_id and lead_id required' })

  const [{ data: doc }, { data: lead }] = await Promise.all([
    sb.from('documents').select('*').eq('id', document_id).single(),
    sb.from('leads').select('name, email, phone, course_interest').eq('id', lead_id).single(),
  ])
  if (!doc)  return res.status(404).json({ error: 'Document not found' })
  if (!lead) return res.status(404).json({ error: 'Lead not found' })

  const results = { ok: true, email_sent: false, wa_link: null }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (channels.includes('email') && lead.email) {
    let attachments = []
    try {
      const pdfRes = await fetch(doc.file_url)
      if (pdfRes.ok) {
        const buf = await pdfRes.arrayBuffer()
        attachments = [{
          content:     Buffer.from(buf).toString('base64'),
          type:        'application/pdf',
          filename:    doc.file_name || 'document.pdf',
          disposition: 'attachment',
        }]
      }
    } catch (e) { console.error('PDF fetch error:', e) }

    const { ok: emailOk } = await sendEmail({
      toEmail: lead.email, toName: lead.name,
      subject: `${doc.name} — Cambridge Center of Excellence`,
      html: buildEmailHtml({ doc, lead, ctx }),
      attachments,
      leadId: lead_id, type: doc.trigger_event || 'document',
    })
    results.email_sent = emailOk
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (channels.includes('whatsapp') && lead.phone) {
    const { ok, manual, waUrl } = await sendWA({
      phone: lead.phone,
      message: buildWAMessage({ doc, lead, ctx }),
      leadId: lead_id, type: doc.trigger_event || 'document',
    })
    results.wa_sent = ok
    if (manual) results.wa_link = waUrl
  }

  // ── Track send ────────────────────────────────────────────────────────────
  await sb.from('document_sends').insert({
    document_id,
    lead_id,
    channel:  channels.join(','),
    status:   'sent',
    sent_by:  sent_by || null,
  }).catch(() => {})

  await sb.from('documents')
    .update({ sends_count: (doc.sends_count || 0) + 1 })
    .eq('id', document_id)
    .catch(() => {})

  return res.status(200).json(results)
}
