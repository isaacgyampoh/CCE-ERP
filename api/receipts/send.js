import { sb } from '../_lib/config.js'
import { sendSMS, sendWA, sendEmail } from '../_lib/notify.js'

const fmtGHS  = (n) => `GH₵ ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
const fmtDate = (ts) => new Date(ts || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { payment_id, lead_id, registration_id, payment_type = 'registration' } = req.body

  const { data: payment } = await sb.from('payments').select('*').eq('id', payment_id).single()
  if (!payment) return res.status(404).json({ error: 'Payment not found' })

  const { data: reg }  = await sb.from('registrations').select('*').eq('id', registration_id || payment.registration_id).single()
  const { data: lead } = await sb.from('leads').select('*').eq('id', lead_id || payment.lead_id).single()

  const name    = reg?.full_name  || lead?.name  || 'Student'
  const email   = reg?.email      || lead?.email || ''
  const phone   = reg?.phone      || lead?.phone || ''
  const course  = reg?.course_interest || lead?.course_interest || ''
  const amount  = payment.amount
  const channel = payment.channel || 'Paystack'
  const ref     = payment.reference
  const paidAt  = payment.paid_at || new Date().toISOString()

  const receiptNo  = `CCE-RCP-${Date.now().toString(36).toUpperCase()}`
  const typeLabel  = payment_type === 'registration' ? 'Registration Fee' : payment_type === 'school_fee' ? 'School Fees' : 'Payment'

  const receiptHTML = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:0}
.wrap{max-width:580px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);padding:28px;text-align:center;color:#fff}
.header h1{margin:0;font-size:20px;letter-spacing:.02em}
.stamp{display:inline-block;border:3px solid rgba(255,255,255,.5);border-radius:8px;padding:6px 18px;font-size:13px;font-weight:800;letter-spacing:.08em;margin-top:12px;color:rgba(255,255,255,.9)}
.body{padding:32px}
.amount-box{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:16px 20px;text-align:center;margin:20px 0}
.amount-box .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#16a34a;font-weight:700}
.amount-box .val{font-size:36px;font-weight:900;color:#15803d;margin-top:2px}
.details{background:#f8fafc;border-radius:8px;padding:16px 20px;margin:20px 0}
.details table{width:100%;border-collapse:collapse}
.details td{padding:7px 0;font-size:13px;border-bottom:1px solid #f1f5f9}
.details td:first-child{color:#64748b}
.details td:last-child{font-weight:600;color:#0f172a;text-align:right}
.details tr:last-child td{border-bottom:none}
.footer{background:#f8fafc;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="wrap">
  <div class="header">
    <h1>Cambridge Center of Excellence</h1>
    <p style="margin:4px 0 0;opacity:.75;font-size:12px">Official Payment Receipt</p>
    <div class="stamp">✓ PAYMENT CONFIRMED</div>
  </div>
  <div class="body">
    <p style="font-size:15px">Dear <strong>${name}</strong>,</p>
    <p style="font-size:13px;color:#475569">Your payment has been received and confirmed. Please keep this receipt for your records.</p>
    <div class="amount-box">
      <div class="lbl">${typeLabel}</div>
      <div class="val">${fmtGHS(amount)}</div>
    </div>
    <div class="details">
      <table>
        <tr><td>Student Name</td><td>${name}</td></tr>
        <tr><td>Programme</td><td>${course || '—'}</td></tr>
        <tr><td>Payment Type</td><td>${typeLabel}</td></tr>
        <tr><td>Amount Paid</td><td>${fmtGHS(amount)}</td></tr>
        <tr><td>Payment Method</td><td>${channel}</td></tr>
        <tr><td>Transaction Ref.</td><td style="font-family:monospace;font-size:11px">${ref}</td></tr>
        <tr><td>Date &amp; Time</td><td>${new Date(paidAt).toLocaleString('en-GB')}</td></tr>
        <tr><td>Receipt No.</td><td><strong>${receiptNo}</strong></td></tr>
      </table>
    </div>
  </div>
  <div class="footer">Cambridge Center of Excellence · Accra, Ghana<br>accounts@cambridgecoe.edu.gh</div>
</div></body></html>`

  const waMsg  = `🧾 *Payment Receipt*\n*Cambridge Center of Excellence*\n\nDear *${name}*, your payment is confirmed ✅\n\n*Receipt No:* ${receiptNo}\n*Type:* ${typeLabel}\n*Amount:* ${fmtGHS(amount)}\n*Method:* ${channel}\n*Ref:* ${ref}\n*Date:* ${fmtDate(paidAt)}\n\nYour official receipt has been sent to your email.\nThank you for choosing CCE! 🎓`
  const smsMsg = `CCE Receipt ${receiptNo}: ${typeLabel} of ${fmtGHS(amount)} confirmed. Ref: ${ref}. Date: ${fmtDate(paidAt)}. Thank you! - Cambridge Center of Excellence`

  const results = {}

  if (email) {
    results.email = await sendEmail({
      toEmail: email, toName: name,
      subject: `Payment Receipt — ${receiptNo} — Cambridge Center of Excellence`,
      html: receiptHTML, type: 'receipt', leadId: lead_id || payment.lead_id,
    })
  }

  if (phone) results.wa  = await sendWA({ phone, message: waMsg, leadId: lead_id || payment.lead_id, type: 'receipt' })
  if (phone) results.sms = await sendSMS({ phone, message: smsMsg, leadId: lead_id || payment.lead_id, type: 'receipt' })

  const sentChannels = [
    results.email?.ok && 'email',
    results.wa?.ok    && 'whatsapp',
    results.sms?.ok   && 'sms',
  ].filter(Boolean).join(',') || 'none'

  await sb.from('receipts').insert({
    payment_id:      payment_id || null,
    lead_id:         lead_id || payment.lead_id,
    registration_id: registration_id || payment.registration_id,
    receipt_no:      receiptNo,
    student_name:    name,
    student_email:   email,
    student_phone:   phone,
    amount,
    payment_type,
    sent_via:  sentChannels,
    sent_at:   new Date().toISOString(),
  })

  return res.status(200).json({ ok: true, receipt_no: receiptNo, results })
}
