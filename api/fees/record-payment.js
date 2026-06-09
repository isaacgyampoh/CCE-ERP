import { sb, APP_URL } from '../_lib/config.js'
import { sendSMS } from '../_lib/notify.js'

function genReceiptNo() {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `CCE-${yy}${mm}${dd}-${rand}`
}

const fmtGHS  = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
const fmtDate = (s) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    transaction_id, invoice_id, lead_id,
    amount, method = 'cash', reference = '',
    recorded_by_id, notes = '',
  } = req.body

  if (!amount || !lead_id) return res.status(400).json({ error: 'amount and lead_id required' })

  const now = new Date().toISOString()
  const receiptNo = genReceiptNo()

  let invoiceIdToUse = invoice_id
  if (!invoiceIdToUse && transaction_id) {
    const { data: txn } = await sb.from('course_fee_payments').select('invoice_id').eq('id', transaction_id).single()
    invoiceIdToUse = txn?.invoice_id
  }
  if (!invoiceIdToUse) return res.status(400).json({ error: 'Could not resolve invoice' })

  const { data: invoice } = await sb.from('school_fee_invoices').select('*').eq('id', invoiceIdToUse).single()
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' })

  const grossFee    = Number(invoice.total_fee || 0)
  const scholarship = Number(invoice.scholarship_amount || 0)
  const discount    = Number(invoice.discount_amount || 0)
  const netFee      = grossFee - scholarship - discount
  const prevPaid    = Number(invoice.amount_paid || 0)
  const newPaid     = prevPaid + Number(amount)
  const newBalance  = Math.max(0, netFee - newPaid)
  const newStatus   = newBalance <= 0 ? 'paid' : 'partial'

  if (transaction_id) {
    await sb.from('course_fee_payments').update({
      status: 'completed',
      amount: Number(amount),
      method,
      reference: reference || receiptNo,
      receipt_no: receiptNo,
      recorded_by: recorded_by_id || null,
      paid_at: now,
      notes: notes || undefined,
    }).eq('id', transaction_id)
  } else {
    await sb.from('course_fee_payments').insert({
      invoice_id: invoiceIdToUse,
      lead_id,
      amount: Number(amount),
      method,
      status: 'completed',
      reference: reference || receiptNo,
      receipt_no: receiptNo,
      recorded_by: recorded_by_id || null,
      paid_at: now,
      notes,
    })
  }

  await sb.from('school_fee_invoices').update({
    amount_paid: newPaid,
    balance: newBalance,
    status: newStatus,
    updated_at: now,
  }).eq('id', invoiceIdToUse)

  await sb.from('payments').insert({
    lead_id,
    registration_id: invoice.registration_id || null,
    payment_type: 'school_fee',
    amount: Number(amount),
    reference: reference || receiptNo,
    channel: method,
    status: 'success',
    paid_at: now,
  }).catch(() => {})

  const { data: lead } = await sb.from('leads').select('name, phone').eq('id', lead_id).single()
  const studentName  = lead?.name  || invoice.student_name || 'Student'
  const studentPhone = lead?.phone || invoice.phone || ''

  const waReceiptMsg  = `🧾 *Payment Receipt — Cambridge Center of Excellence*\n\nDear *${studentName}*,\n\nYour payment has been confirmed ✅\n\n*Receipt No:* ${receiptNo}\n*Course:* ${invoice.course}\n*Method:* ${method.charAt(0).toUpperCase() + method.slice(1)}\n*Amount Paid:* ${fmtGHS(amount)}\n*Total Paid:* ${fmtGHS(newPaid)}\n*Balance:* ${fmtGHS(newBalance)}\n*Status:* ${newStatus === 'paid' ? 'FULLY PAID ✅' : 'Partial Payment'}\n*Date:* ${fmtDate(now)}\n\nThank you for choosing Cambridge Center of Excellence! 🎓\n_Accounts Office_`
  const smsReceiptMsg = `CCE Receipt: GH₵${amount} confirmed. Ref: ${receiptNo}. Balance: GH₵${newBalance}. Thank you ${studentName.split(' ')[0]}! - Cambridge Centre of Excellence`

  try {
    const { data: payDocs } = await sb.from('documents')
      .select('*')
      .eq('trigger_event', 'payment_confirmed')
      .eq('is_active', true)
    for (const doc of payDocs || []) {
      if (doc.course && invoice.course && !invoice.course.toLowerCase().includes(doc.course.toLowerCase())) continue
      fetch(`${APP_URL}/api/documents/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: doc.id,
          lead_id,
          channels: ['email', 'whatsapp'],
          context: { name: studentName, course: invoice.course, amount: Number(amount), receipt_no: receiptNo, balance: newBalance },
        }),
      }).catch(e => console.error('Auto-doc send error:', e))
    }
  } catch (e) { console.error('Auto-doc documents error:', e) }

  if (studentPhone) await sendSMS({ phone: studentPhone, message: smsReceiptMsg, leadId: lead_id, type: 'receipt' })

  const { data: finStaff } = await sb.from('staff').select('id').in('role', ['finance', 'admin']).eq('is_active', true)
  for (const s of finStaff || []) {
    await sb.from('notifications').insert({
      staff_id: s.id,
      title: '✅ Fee Payment Recorded',
      message: `${studentName} — ${fmtGHS(amount)} ${method}. Balance: ${fmtGHS(newBalance)}. Ref: ${receiptNo}`,
      type: 'school_fee',
      lead_id,
    })
  }

  return res.status(200).json({
    ok: true,
    receipt_no: receiptNo,
    wa_receipt_msg: waReceiptMsg,
    sms_receipt_msg: smsReceiptMsg,
    student_name: studentName,
    student_phone: studentPhone,
    amount_paid: Number(amount),
    total_paid: newPaid,
    new_balance: newBalance,
    status: newStatus,
    course: invoice.course,
    method,
    paid_at: now,
  })
}
