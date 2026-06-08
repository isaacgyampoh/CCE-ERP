/**
 * CCE ERP — Admission Letter Sender
 * POST /api/admission/send-letter
 *
 * Body: { registration_id, trigger: 'auto' | 'manual', sent_by_id }
 *
 * Sends via:
 *   1. Email (SendGrid) — if SENDGRID_API_KEY is set
 *   2. WhatsApp — logs the WA message + logs it; actual send
 *      happens via wa.me on the frontend OR via WhatsApp Business API
 *      if WABA_TOKEN is set.
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail, sendWA } from '../lib/notify.js'

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { registration_id, trigger = 'auto', sent_by_id } = req.body
  if (!registration_id) return res.status(400).json({ error: 'registration_id required' })

  // Load registration + lead
  const { data: reg, error } = await sb
    .from('registrations')
    .select('*, lead:lead_id(*)')
    .eq('id', registration_id)
    .single()

  if (error || !reg) return res.status(404).json({ error: 'Registration not found' })

  const student = reg.lead || {}
  const name    = reg.full_name || student.name
  const email   = reg.email     || student.email
  const phone   = reg.phone     || student.phone
  const course  = reg.course_interest || student.course_interest || 'your chosen course'
  const mode    = reg.mode_preference || student.mode_preference || ''
  const marketer = reg.marketer_name || 'our team'

  // ── Generate letter content ─────────────────────────────────────────────
  const today        = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const admissionNo  = `CCE-${Date.now().toString(36).toUpperCase().slice(-6)}`

  const letterText = `
CAMBRIDGE CENTER OF EXCELLENCE
Accra, Ghana | admissions@cambridgecoe.edu.gh

Date: ${today}
Admission Reference: ${admissionNo}

Dear ${name},

LETTER OF ADMISSION

We are pleased to inform you that your application to Cambridge Center of Excellence has been reviewed and you have been ADMITTED to the following programme:

  Programme:   ${course}
  Study Mode:  ${mode || 'To be confirmed'}
  Status:      ADMITTED — Registration Fee Paid ✓

This letter serves as your official confirmation of admission. Please keep it for your records.

NEXT STEPS:
1. You will receive a separate invoice for your tuition fees shortly.
2. Your class schedule and orientation details will be sent to you by your consultant, ${marketer}.
3. If you have questions, contact us at admissions@cambridgecoe.edu.gh or WhatsApp: +233 XX XXX XXXX.

We look forward to welcoming you to the CCE community!

Warm regards,

Admissions Office
Cambridge Center of Excellence
`.trim()

  const htmlLetter = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: Georgia, serif; color: #1e293b; background: #f8fafc; margin: 0; padding: 0; }
  .wrapper { max-width: 640px; margin: 24px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%); padding: 32px; text-align: center; color: #fff; }
  .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.02em; }
  .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.8; }
  .badge { display: inline-block; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 999px; padding: 4px 14px; font-size: 11px; margin-top: 12px; }
  .body { padding: 32px; }
  .ref { font-size: 11px; color: #94a3b8; margin-bottom: 24px; }
  h2 { font-size: 18px; color: #1d4ed8; border-bottom: 2px solid #eff6ff; padding-bottom: 8px; }
  .info-box { background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  .info-box table { width: 100%; border-collapse: collapse; }
  .info-box td { padding: 6px 0; font-size: 14px; }
  .info-box td:first-child { color: #64748b; width: 140px; }
  .info-box td:last-child { font-weight: 600; color: #0f172a; }
  .steps { margin: 24px 0; }
  .step { display: flex; gap: 12px; margin-bottom: 12px; }
  .step-num { width: 24px; height: 24px; border-radius: 50%; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .step-text { font-size: 13px; color: #475569; line-height: 1.5; padding-top: 3px; }
  .footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  .status-pill { display: inline-block; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; margin-left: 8px; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Cambridge Center of Excellence</h1>
    <p>Accra, Ghana &nbsp;|&nbsp; admissions@cambridgecoe.edu.gh</p>
    <div class="badge">🎓 Official Admission Letter</div>
  </div>
  <div class="body">
    <div class="ref">Date: ${today} &nbsp;·&nbsp; Ref: ${admissionNo}</div>
    <p>Dear <strong>${name}</strong>,</p>
    <h2>Letter of Admission <span class="status-pill">✓ ADMITTED</span></h2>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      We are pleased to inform you that your application has been reviewed and you have been <strong>admitted</strong> to Cambridge Center of Excellence.
    </p>
    <div class="info-box">
      <table>
        <tr><td>Programme</td><td>${course}</td></tr>
        <tr><td>Study Mode</td><td>${mode || 'To be confirmed'}</td></tr>
        <tr><td>Reg. Fee Status</td><td>✅ Paid</td></tr>
        <tr><td>Your Consultant</td><td>${marketer}</td></tr>
        <tr><td>Admission Ref.</td><td>${admissionNo}</td></tr>
      </table>
    </div>
    <p style="font-size:14px;font-weight:600;color:#1e293b;">Next Steps:</p>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-text">You will receive a tuition fee invoice shortly. Payment plans are available.</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Your class schedule and orientation details will be sent by your consultant, <strong>${marketer}</strong>.</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">For any queries, reply to this email or WhatsApp us directly.</div></div>
    </div>
    <p style="font-size:14px;color:#475569;">We look forward to welcoming you to the CCE community! 🎉</p>
    <p style="margin-top:24px;font-size:14px"><strong>Admissions Office</strong><br>Cambridge Center of Excellence</p>
  </div>
  <div class="footer">
    This is an official admission letter from Cambridge Center of Excellence.<br>
    Cambridge Center of Excellence · Accra, Ghana
  </div>
</div>
</body></html>
`

  const waMsg = `🎓 *Cambridge Center of Excellence*\n\nDear *${name}*, congratulations! 🎉\n\nYour admission has been *confirmed*.\n\n📋 *Programme:* ${course}\n📅 *Mode:* ${mode || 'TBC'}\n✅ *Reg. Fee:* Paid\n📌 *Ref:* ${admissionNo}\n\nYour official admission letter has been sent to your email (${email || 'on file'}).\n\nYou will receive your tuition fee invoice and class schedule shortly.\n\nWelcome to CCE! 🎓\n\n_Admissions Office_\n_Cambridge Center of Excellence_`

  const results = { email: false, whatsapp: false, errors: [] }

  // ── 1. Send Email via SendGrid ──────────────────────────────────────────
  if (email) {
    const { ok, error: emailErr } = await sendEmail({
      toEmail: email, toName: name,
      subject: `🎓 Your Admission Letter — Cambridge Center of Excellence (Ref: ${admissionNo})`,
      html: htmlLetter, text: letterText,
      type: 'admission', leadId: reg.lead_id,
    })
    results.email = ok
    if (emailErr) results.errors.push(`Email: ${emailErr}`)
  } else {
    results.errors.push('Student email not on file')
  }

  // ── 2. WhatsApp ─────────────────────────────────────────────────────────
  if (phone) {
    const { ok, manual, waUrl } = await sendWA({ phone, message: waMsg, leadId: reg.lead_id, type: 'admission' })
    results.whatsapp = ok
    if (manual) { results.whatsapp_message = waMsg; results.whatsapp_phone = phone; results.wa_url = waUrl }
  }

  // ── 3. Update DB ────────────────────────────────────────────────────────
  await sb.from('registrations').update({
    admission_letter_sent: true,
    admission_letter_sent_at: new Date().toISOString(),
    admission_letter_email_sent: results.email,
    admission_letter_wa_sent: results.whatsapp,
    updated_at: new Date().toISOString(),
  }).eq('id', registration_id)

  await sb.from('leads').update({ admission_sent: true, admission_sent_at: new Date().toISOString() }).eq('id', reg.lead_id)

  // Log the letter
  await sb.from('admission_letters').insert({
    registration_id,
    lead_id:        reg.lead_id,
    student_name:   name,
    student_email:  email || '',
    student_phone:  phone || '',
    course,
    mode:           mode || '',
    marketer_name:  marketer,
    sent_via_email: results.email,
    sent_via_wa:    results.whatsapp,
    sent_by:        sent_by_id || null,
    letter_content: letterText,
  })

  // Notify the marketer
  if (reg.marketer_id) {
    await sb.from('notifications').insert({
      staff_id: reg.marketer_id,
      title: '📨 Admission Letter Sent',
      message: `Admission letter sent to ${name} for ${course}. Email: ${results.email ? '✓' : '✗'} WA: ${results.whatsapp ? '✓' : 'manual'}`,
      type: 'admission',
      lead_id: reg.lead_id,
    })
  }

  return res.status(200).json({ ok: true, results, admission_no: admissionNo })
}
