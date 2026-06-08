/**
 * CCE ERP — Automated Follow-up Reminder Cron
 * GET /api/cron/followup-reminders?cron=true
 *
 * Runs daily (see vercel.json cron schedule).
 * For every lead in 'assigned', 'contacted', or 'follow_up' status
 * with no update in 24 hours, sends an SMS reminder to the assigned marketer.
 *
 * Env vars needed: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET
 */

import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '../lib/notify.js'

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  // Verify secret (Vercel sends CRON_SECRET automatically in Authorization header)
  const auth   = req.headers.authorization || ''
  const secret = req.query.secret || ''
  const cronSecret = process.env.CRON_SECRET

  const isVercelCron  = auth === `Bearer ${cronSecret}`
  const isManualQuery = secret === cronSecret
  const isDev         = process.env.NODE_ENV === 'development'

  if (cronSecret && !isVercelCron && !isManualQuery && !isDev) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Fetch stale leads with assigned marketers
  const { data: staleLeads, error } = await sb
    .from('leads')
    .select('id, name, phone, status, updated_at, assigned_to, assignee:assigned_to(id, name, phone)')
    .in('status', ['assigned', 'contacted', 'follow_up'])
    .lt('updated_at', cutoff)
    .not('assigned_to', 'is', null)

  if (error) {
    console.error('DB error:', error)
    return res.status(500).json({ error: 'DB query failed', detail: error.message })
  }

  let sent = 0
  const results = []

  for (const lead of staleLeads || []) {
    const marketer = lead.assignee
    if (!marketer?.phone) {
      results.push({ lead: lead.name, status: 'skipped — no marketer phone' })
      continue
    }

    const hoursStale = Math.round((Date.now() - new Date(lead.updated_at)) / 3600000)

    const msg =
      `Cambridge ERP Reminder: Please follow up with ${lead.name}` +
      `${lead.phone ? ' (' + lead.phone + ')' : ''}. ` +
      `No activity in ${hoursStale}h. Status: ${lead.status}. Login to CCE ERP to update.`

    await sendSMS({ phone: marketer.phone, message: msg, leadId: lead.id, type: 'reminder' })

    // Create in-app notification for marketer
    await sb.from('notifications').insert({
      staff_id: marketer.id,
      title:    'Follow-up Reminder',
      message:  `${lead.name}${lead.phone ? ' — ' + lead.phone : ''} — no activity in ${hoursStale}h`,
      type:     'reminder',
      lead_id:  lead.id,
    })

    results.push({ lead: lead.name, marketer: marketer.name, status: 'sent' })
    sent++
  }

  return res.status(200).json({
    ok:              true,
    reminders_sent:  sent,
    total_stale:     staleLeads?.length || 0,
    cutoff,
    results,
  })
}
