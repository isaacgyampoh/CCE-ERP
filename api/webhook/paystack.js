/**
 * CCE ERP — Paystack Webhook Handler
 * POST /api/webhook/paystack
 *
 * Events handled:
 *   charge.success  → confirm reg payment → trigger admission letter → notify all
 *   invoicepayment.success → confirm school fee payment → update invoice
 */

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const APP_URL = process.env.APP_URL || 'https://cce-erp.vercel.app'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify signature
  const secret = process.env.PAYSTACK_SECRET_KEY
  const hash   = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex')
  if (hash !== req.headers['x-paystack-signature']) return res.status(401).json({ error: 'Invalid signature' })

  const { event, data } = req.body

  // ── Registration Fee Payment ────────────────────────────────────────────
  if (event === 'charge.success') {
    const { reference, amount, metadata, customer } = data
    const leadId      = metadata?.lead_id
    const marketerId  = metadata?.marketer_id
    const marketerName= metadata?.marketer_name || ''
    const amountGHS   = amount / 100

    if (!leadId) return res.status(200).json({ ok: true })

    // Load existing registration (may have been created on frontend)
    const { data: existingReg } = await sb.from('registrations').select('id').eq('lead_id', leadId).eq('status','paid').limit(1).single()

    let registrationId = existingReg?.id

    // If no registration yet (payment came before form save — edge case), create minimal one
    if (!registrationId) {
      const { data: lead } = await sb.from('leads').select('*').eq('id', leadId).single()
      const { data: newReg } = await sb.from('registrations').insert({
        lead_id: leadId, marketer_id: marketerId, marketer_name: marketerName,
        full_name: lead?.name || '', phone: lead?.phone || '', email: lead?.email || customer?.email || '',
        course_interest: lead?.course_interest || '', mode_preference: lead?.mode_preference || '',
        paystack_ref: reference, amount_paid: amountGHS, paid_at: new Date().toISOString(), status: 'paid',
      }).select().single()
      registrationId = newReg?.id
    } else {
      // Update existing
      await sb.from('registrations').update({ status: 'paid', paystack_ref: reference, amount_paid: amountGHS, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', registrationId)
    }

    // Upsert payment record
    await sb.from('payments').upsert({
      lead_id: leadId, registration_id: registrationId, marketer_id: marketerId,
      payment_type: 'registration', amount: amountGHS, reference, channel: 'paystack',
      status: 'success', paid_at: new Date().toISOString(),
    }, { onConflict: 'reference' })

    // Update lead
    await sb.from('leads').update({
      status: 'registered', reg_fee_paid: amountGHS,
      reg_paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', leadId)

    // Log comment
    const { data: lead } = await sb.from('leads').select('name').eq('id', leadId).single()
    await sb.from('lead_comments').insert({
      lead_id: leadId, staff_id: marketerId, staff_name: marketerName,
      comment: `✅ Registration fee paid — GH₵${amountGHS}. Ref: ${reference}. Admission letter being sent automatically.`,
      status_change: 'registered',
    })

    // AUTO-SEND ADMISSION LETTER
    if (registrationId) {
      try {
        await fetch(`${APP_URL}/api/admission/send-letter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registration_id: registrationId, trigger: 'auto', sent_by_id: null })
        })
      } catch(e) { console.error('Auto admission letter failed:', e) }
    }

    // Google Sheets sync
    const sheetsUrl = process.env.SHEETS_WEBHOOK_URL
    if (sheetsUrl && lead) {
      try {
        await fetch(sheetsUrl, { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ timestamp: new Date().toISOString(), name: lead.name, reference, amount: amountGHS, marketer: marketerName, type: 'registration' })
        })
      } catch(e) {}
    }

    // Notify relevant staff
    const { data: adminStaff } = await sb.from('staff').select('id').in('role', ['admission','admin','finance']).eq('is_active', true)
    const studentName = lead?.name || customer?.email
    for (const s of adminStaff || []) {
      await sb.from('notifications').insert({
        staff_id: s.id,
        title: '🎓 New Registration Payment',
        message: `${studentName} paid GH₵${amountGHS} reg fee. Marketer: ${marketerName}. Admission letter auto-sent.`,
        type: 'registration', lead_id: leadId,
      })
    }
    if (marketerId) {
      await sb.from('notifications').insert({
        staff_id: marketerId, title: '✅ Lead Registered & Paid!',
        message: `${studentName} completed registration and paid GH₵${amountGHS}. Admission letter sent. 🎉`,
        type: 'registration', lead_id: leadId,
      })
    }
  }

  // ── School Fee Payment ──────────────────────────────────────────────────
  if (event === 'invoicepayment.success' || (event === 'charge.success' && data.metadata?.type === 'school_fee')) {
    const { reference, amount, metadata } = data
    const registrationId = metadata?.registration_id
    const leadId         = metadata?.lead_id
    const amountGHS      = amount / 100

    if (registrationId) {
      // Load invoice
      const { data: invoice } = await sb.from('school_fee_invoices').select('*').eq('registration_id', registrationId).limit(1).single()
      if (invoice) {
        const newPaid    = Number(invoice.amount_paid) + amountGHS
        const newBalance = Math.max(0, Number(invoice.total_fee) - newPaid)
        const newStatus  = newBalance <= 0 ? 'paid' : 'partial'
        await sb.from('school_fee_invoices').update({ amount_paid: newPaid, balance: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq('id', invoice.id)
        await sb.from('registrations').update({ school_fee_paid: newPaid, school_fee_status: newStatus, updated_at: new Date().toISOString() }).eq('id', registrationId)
        if (leadId) await sb.from('leads').update({ school_fee_status: newStatus }).eq('id', leadId)
      }

      // Record payment
      await sb.from('payments').upsert({
        lead_id: leadId || null, registration_id: registrationId, payment_type: 'school_fee',
        amount: amountGHS, reference, channel: 'paystack', status: 'success', paid_at: new Date().toISOString(),
      }, { onConflict: 'reference' })

      // Notify finance
      const { data: finStaff } = await sb.from('staff').select('id').in('role',['finance','admin']).eq('is_active',true)
      for (const s of finStaff || []) {
        await sb.from('notifications').insert({
          staff_id: s.id, title: '💰 School Fee Payment Received',
          message: `GH₵${amountGHS} school fee paid. Ref: ${reference}`,
          type: 'school_fee', lead_id: leadId || null,
        })
      }
    }
  }

  return res.status(200).json({ ok: true })
}
