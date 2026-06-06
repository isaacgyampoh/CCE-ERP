/**
 * CCE ERP — Class Reminder Scheduler
 * POST /api/cohorts/send-reminder
 *
 * Body: { cohort_id, reminder_type: '1month'|'1week'|'2day'|'rsvp' }
 *
 * Also callable as a cron job via Vercel Cron:
 *   GET /api/cohorts/send-reminder?cron=true
 *   (runs daily, checks which cohorts need reminders sent)
 */

import { createClient } from '@supabase/supabase-js'
import { sendSMS, sendWA } from '../lib/notify.js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const APP_URL = process.env.APP_URL || 'https://cce-erp.vercel.app'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export default async function handler(req, res) {
  // ── Cron mode: auto-check all cohorts ────────────────────────────────────
  if (req.method === 'GET' && req.query.cron === 'true') {
    const now = new Date()
    const { data: cohorts } = await sb.from('cohorts')
      .select('*, enrolments(*)')
      .eq('status', 'upcoming')

    let totalSent = 0
    for (const cohort of cohorts || []) {
      const start = new Date(cohort.start_date)
      const diffDays = Math.floor((start - now) / 86400000)

      let reminderType = null
      if (diffDays <= 30 && diffDays > 7)  reminderType = '1month'
      if (diffDays <= 7  && diffDays > 2)  reminderType = '1week'
      if (diffDays <= 2  && diffDays > 0)  reminderType = '2day'
      if (diffDays <= 1  && diffDays >= 0) reminderType = '1day'

      if (reminderType) {
        const result = await sendReminderForCohort(cohort.id, reminderType)
        totalSent += result.sent || 0
      }
    }
    return res.status(200).json({ ok: true, total_sent: totalSent })
  }

  // ── Manual trigger ────────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { cohort_id, reminder_type } = req.body
  if (!cohort_id || !reminder_type) return res.status(400).json({ error: 'cohort_id and reminder_type required' })

  const result = await sendReminderForCohort(cohort_id, reminder_type)
  return res.status(200).json({ ok: true, ...result })
}

async function sendReminderForCohort(cohortId, reminderType) {
  const { data: cohort } = await sb.from('cohorts').select('*').eq('id', cohortId).single()
  if (!cohort) return { sent: 0, error: 'Cohort not found' }

  const fieldMap = {
    '1month': 'reminder_1month_sent',
    '1week':  'reminder_1week_sent',
    '2day':   'reminder_2day_sent',
    '1day':   'reminder_1day_sent',
    'rsvp':   null,
  }
  const sentField = fieldMap[reminderType]

  // Get enrolments that haven't received this reminder yet
  let query = sb.from('enrolments').select('*').eq('cohort_id', cohortId).eq('rsvp_status', 'confirmed')
  if (sentField) query = query.eq(sentField, false)
  const { data: enrolments } = await query

  if (!enrolments?.length) return { sent: 0, skipped: 'none eligible' }

  const startDateFmt = fmtDate(cohort.start_date)
  const location     = cohort.location || 'Cambridge Center of Excellence, Accra'
  let sent = 0

  for (const enr of enrolments) {
    let message = ''

    if (reminderType === '1month') {
      message = `Hi ${enr.student_name}! 📅 Your *${cohort.course_name}* class starts in *1 month* on ${startDateFmt}. Start preparing — it's going to be amazing! 🚀\n\nCambridge Center of Excellence`
    } else if (reminderType === '1week') {
      message = `Hi ${enr.student_name}! ⏰ Your *${cohort.course_name}* class is *1 week away!*\n\n📅 ${cohort.class_day} · 🕘 ${cohort.class_time}\n📍 ${location}\n\nGet ready — we can't wait to see you!\n\nCambridge Center of Excellence`
    } else if (reminderType === '2day') {
      message = `Hi ${enr.student_name}! 🔔 *2 days to your class!*\n\n*${cohort.course_name}*\n📅 ${cohort.class_day} · 🕘 ${cohort.class_time}\n📍 ${location}\n\nReply YES to confirm, or contact us if you can't make it.\n\nCambridge Center of Excellence`
    } else if (reminderType === '1day') {
      message = `Hi ${enr.student_name}! 🎓 *Tomorrow is your class day!*\n\n*${cohort.course_name}* starts at *${cohort.class_time}*.\n📍 ${location}\n\nMake sure you:\n✅ Bring your ID\n✅ Have your course materials\n✅ Arrive on time\n\nSee you tomorrow! 💪\n\nCambridge Center of Excellence`
    } else if (reminderType === 'rsvp') {
      const rsvpLink = `${APP_URL}/rsvp?t=${enr.rsvp_token}`
      message = `Hi ${enr.student_name}! 👋\n\nYour *${cohort.course_name}* class is starting on *${startDateFmt}*.\n\nPlease confirm your attendance:\n👉 ${rsvpLink}\n\nYour spot depends on your confirmation!\n\nCambridge Center of Excellence`
    }

    if (!message) continue

    // Send WA + SMS
    const smsMsg = message.replace(/\*/g, '').replace(/\n/g, ' ').replace(/👉/g, '').trim()

    if (enr.student_phone) {
      await sendWA({ phone: enr.student_phone, message, leadId: enr.lead_id, type: 'reminder' })
      await sendSMS({ phone: enr.student_phone, message: smsMsg.slice(0, 160), leadId: enr.lead_id, type: 'reminder' })
    }

    // Mark as sent
    if (sentField) {
      await sb.from('enrolments').update({ [sentField]: true }).eq('id', enr.id)
    }

    // Notify system
    await sb.from('notifications').insert({
      staff_id: cohort.instructor_id || null,
      title: `Reminder sent: ${reminderType}`,
      message: `${reminderType} reminder sent to ${enr.student_name} for ${cohort.course_name}`,
      type: 'reminder',
    }).select()

    sent++
  }

  return { sent, cohort: cohort.course_name, reminder_type: reminderType }
}
