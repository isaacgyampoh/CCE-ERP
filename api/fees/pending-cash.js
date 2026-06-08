/**
 * CCE ERP — Cash Payment Request
 * POST /api/fees/pending-cash
 *
 * Student selects "Pay Cash" at the attendance page.
 * Creates a pending_cash transaction, notifies finance team + confirms to student.
 */

import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '../lib/notify.js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { invoice_id, lead_id, student_name, amount, course } = req.body
  if (!invoice_id || !lead_id) return res.status(400).json({ error: 'invoice_id and lead_id required' })

  const { data: txn, error } = await sb.from('course_fee_payments').insert({
    invoice_id,
    lead_id,
    amount: Number(amount) || 0,
    method: 'cash',
    status: 'pending_cash',
    notes: `Student requested cash payment at class attendance. Course: ${course || ''}`,
  }).select().single()

  if (error) { console.error('Insert error:', error); return res.status(500).json({ error: 'Failed to record request' }) }

  const { data: financeStaff } = await sb.from('staff')
    .select('id, phone').in('role', ['finance', 'admin']).eq('is_active', true)

  for (const s of financeStaff || []) {
    await sb.from('notifications').insert({
      staff_id: s.id,
      title: '💵 Cash Payment — Front Desk',
      message: `${student_name} is coming to pay GH₵ ${Number(amount).toLocaleString('en-GH', { minimumFractionDigits: 2 })} cash for ${course || 'course'}.`,
      type: 'school_fee',
      lead_id,
    })
    if (s.phone) {
      await sendSMS({ phone: s.phone, message: `CCE Finance: ${student_name} is coming to pay GH₵${amount} cash for ${course || 'course'}. Please receive payment at the front desk.`, leadId: lead_id, type: 'school_fee' })
    }
  }

  const { data: lead } = await sb.from('leads').select('phone').eq('id', lead_id).single()
  if (lead?.phone) {
    await sendSMS({ phone: lead.phone, message: `Hi ${student_name.split(' ')[0]}! Your cash payment request of GH₵${amount} has been noted. Please proceed to the CCE front desk to complete your payment. Cambridge Center of Excellence.`, leadId: lead_id, type: 'school_fee' })
  }

  return res.status(200).json({ ok: true, transaction_id: txn.id })
}
