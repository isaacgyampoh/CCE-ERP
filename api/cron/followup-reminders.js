import { sb, CRON_SECRET } from '../_lib/config.js'
import { sendSMS } from '../_lib/notify.js'

export default async function handler(req, res) {
  const auth   = req.headers.authorization || ''
  const secret = req.query.secret || ''

  const isVercelCron  = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  const isManualQuery = CRON_SECRET && secret === CRON_SECRET
  const isDev         = process.env.NODE_ENV === 'development'

  if (CRON_SECRET && !isVercelCron && !isManualQuery && !isDev) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

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
