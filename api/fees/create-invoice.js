import { sb, PAYSTACK_SECRET, SENDGRID_KEY, SENDGRID_FROM, WABA_TOKEN, WABA_PHONE_ID, APP_URL } from '../_lib/config.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { registration_id, total_fee, due_date, notes = '', sent_by_id } = req.body
  if (!registration_id || !total_fee) return res.status(400).json({ error: 'registration_id and total_fee required' })

  const { data: reg } = await sb.from('registrations').select('*, lead:lead_id(*)').eq('id', registration_id).single()
  if (!reg) return res.status(404).json({ error: 'Registration not found' })

  const student    = reg.lead || {}
  const name       = reg.full_name  || student.name
  const email      = reg.email      || student.email
  const phone      = reg.phone      || student.phone
  const course     = reg.course_interest || student.course_interest
  const marketer   = reg.marketer_name || ''
  const invoiceRef = `CCE-FEE-${Date.now().toString(36).toUpperCase().slice(-8)}`

  let paystackLink = null
  let paystackCode = null

  if (PAYSTACK_SECRET && email) {
    try {
      const psRes = await fetch('https://api.paystack.co/paymentrequest', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { email, name },
          amount: total_fee * 100,
          currency: 'GHS',
          description: `School fees — ${course} — Cambridge Center of Excellence`,
          due_date: due_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0,10),
          line_items: [{ name: `Tuition — ${course}`, amount: total_fee * 100, quantity: 1 }],
          tax: [],
          metadata: { registration_id, lead_id: reg.lead_id, type: 'school_fee', invoice_ref: invoiceRef }
        })
      })
      const psData = await psRes.json()
      if (psData.status) {
        paystackLink = psData.data?.payment_url || psData.data?.offline_reference
        paystackCode = psData.data?.request_code
      }
    } catch (e) { console.error('Paystack invoice error:', e) }
  }

  if (!paystackLink) {
    paystackLink = `${APP_URL}/pay-fees?r=${registration_id}`
  }

  const { data: invoice } = await sb.from('school_fee_invoices').insert({
    registration_id,
    lead_id:       reg.lead_id,
    student_name:  name,
    course,
    total_fee,
    amount_paid:   0,
    balance:       total_fee,
    due_date:      due_date || null,
    status:        'pending',
    paystack_link: paystackLink,
    notes,
  }).select().single()

  await sb.from('registrations').update({
    school_fee_amount: total_fee,
    school_fee_status: 'pending',
    school_fee_due_date: due_date || null,
    updated_at: new Date().toISOString(),
  }).eq('id', registration_id)

  await sb.from('leads').update({ school_fee_status: 'pending' }).eq('id', reg.lead_id)

  const fmtGHS = (n) => `GH₵ ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
  const dueDateFmt = due_date ? new Date(due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'As soon as possible'

  const emailSubject = `Tuition Fee Invoice — ${course} (Ref: ${invoiceRef})`
  const emailHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #1e293b; background: #f8fafc; margin: 0; }
  .wrapper { max-width: 600px; margin: 24px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); padding: 28px; color: #fff; text-align: center; }
  .header h1 { margin: 0; font-size: 20px; }
  .body { padding: 28px; }
  .invoice-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
  .invoice-box table { width: 100%; border-collapse: collapse; }
  .invoice-box td { padding: 8px 0; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
  .invoice-box td:first-child { color: #64748b; }
  .invoice-box td:last-child { font-weight: 600; text-align: right; }
  .total-row td { font-size: 16px; font-weight: 800; color: #0f172a; border-bottom: none; padding-top: 12px; }
  .pay-btn { display: block; background: #1d4ed8; color: #fff; text-decoration: none; text-align: center; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 700; margin: 24px 0; }
  .footer { background: #f8fafc; padding: 16px 28px; font-size: 12px; color: #94a3b8; text-align: center; }
</style></head><body>
<div class="wrapper">
  <div class="header"><h1>Tuition Fee Invoice</h1><p style="margin:4px 0 0;opacity:.8;font-size:13px">Cambridge Center of Excellence</p></div>
  <div class="body">
    <p>Dear <strong>${name}</strong>,</p>
    <div class="invoice-box">
      <table>
        <tr><td>Invoice Ref.</td><td>${invoiceRef}</td></tr>
        <tr><td>Programme</td><td>${course}</td></tr>
        <tr><td>Due Date</td><td>${dueDateFmt}</td></tr>
        ${notes ? `<tr><td>Notes</td><td>${notes}</td></tr>` : ''}
        <tr class="total-row"><td>Amount Due</td><td style="color:#1d4ed8">${fmtGHS(total_fee)}</td></tr>
      </table>
    </div>
    <a href="${paystackLink}" class="pay-btn">Pay ${fmtGHS(total_fee)} Now</a>
  </div>
  <div class="footer">Cambridge Center of Excellence · Accra, Ghana<br>accounts@cambridgecoe.edu.gh</div>
</div></body></html>`

  const waMsg = `📋 *Cambridge Center of Excellence*\n*Tuition Fee Invoice*\n\nDear *${name}*,\n\nYour fee invoice is ready.\n\n📚 *Programme:* ${course}\n💰 *Amount Due:* ${fmtGHS(total_fee)}\n📅 *Due Date:* ${dueDateFmt}\n🔖 *Ref:* ${invoiceRef}\n\n👇 *Click to Pay Now:*\n${paystackLink}\n\n_Accounts Office_\n_Cambridge Center of Excellence_`

  const results = { email: false, whatsapp: false }

  if (SENDGRID_KEY && email) {
    try {
      const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SENDGRID_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email, name }] }],
          from: { email: SENDGRID_FROM, name: 'CCE Accounts' },
          subject: emailSubject,
          content: [{ type: 'text/html', value: emailHtml }],
        })
      })
      if (sgRes.ok || sgRes.status === 202) {
        results.email = true
        await sb.from('email_log').insert({ to_email: email, to_name: name, subject: emailSubject, type: 'school_fee', lead_id: reg.lead_id, status: 'sent' })
      }
    } catch (e) { console.error('Email error:', e) }
  }

  if (WABA_TOKEN && WABA_PHONE_ID && phone) {
    try {
      const cleanPhone = phone.replace(/\s/g,'').replace(/^0/,'233').replace(/^\+/,'')
      const waRes = await fetch(`https://graph.facebook.com/v18.0/${WABA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: cleanPhone, type: 'text', text: { body: waMsg } })
      })
      if (waRes.ok) {
        results.whatsapp = true
        await sb.from('whatsapp_log').insert({ lead_id: reg.lead_id, phone, message: waMsg, marketer_name: 'Accounts (Auto)', status: 'sent' })
      }
    } catch (e) { console.error('WA error:', e) }
  } else {
    results.whatsapp_message = waMsg
    results.whatsapp_phone   = phone
  }

  const { data: financeStaff } = await sb.from('staff').select('id').in('role', ['finance','admin']).eq('is_active', true)
  for (const s of financeStaff || []) {
    await sb.from('notifications').insert({
      staff_id: s.id,
      title: '🧾 School Fee Invoice Created',
      message: `Invoice for ${name} — ${fmtGHS(total_fee)} for ${course}. Ref: ${invoiceRef}`,
      type: 'school_fee',
      lead_id: reg.lead_id,
    })
  }

  return res.status(200).json({ ok: true, invoice_id: invoice?.id, paystack_link: paystackLink, results })
}
