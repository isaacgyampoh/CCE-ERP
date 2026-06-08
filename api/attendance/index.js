/**
 * CCE ERP — Attendance Controller
 * POST /api/attendance/open   — instructor opens attendance, sends link to all confirmed students
 * POST /api/attendance/submit — student submits attendance with code
 * GET  /api/attendance/status?session_id=xxx — live attendance count
 */

import { createClient } from '@supabase/supabase-js'
import { sendWA, sendSMS } from '../_lib/notify.js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const APP_URL = process.env.APP_URL || 'https://cce-erp.vercel.app'

function genCode(len = 6) {
  return Math.random().toString(36).toUpperCase().slice(2, 2 + len)
}

export default async function handler(req, res) {
  const action = req.url.includes('/open') ? 'open'
    : req.url.includes('/submit') ? 'submit'
    : req.url.includes('/status') ? 'status'
    : req.url.includes('/close') ? 'close'
    : null

  // ── Open Attendance ───────────────────────────────────────────────────────
  if (action === 'open' && req.method === 'POST') {
    const { session_id, opened_by } = req.body
    if (!session_id) return res.status(400).json({ error: 'session_id required' })

    // Generate unique codes for this session
    const codeInPerson = genCode(6)
    const codeOnline   = genCode(6)
    const attendanceLink = `${APP_URL}/attend?s=${session_id}`

    // Update session
    await sb.from('class_sessions').update({
      attendance_open:       true,
      attendance_opened_at:  new Date().toISOString(),
      class_code_inperson:   codeInPerson,
      class_code_online:     codeOnline,
      attendance_link_sent:  true,
      attendance_link_sent_at: new Date().toISOString(),
    }).eq('id', session_id)

    // Load session + cohort
    const { data: session } = await sb.from('class_sessions')
      .select('*, cohort:cohort_id(*)').eq('id', session_id).single()

    const courseName = session?.cohort?.course_name || 'your class'

    // Load all RSVP-confirmed enrolments for this cohort
    const { data: enrolments } = await sb.from('enrolments')
      .select('*').eq('cohort_id', session.cohort_id).eq('rsvp_status', 'confirmed')

    const waMsg = (name) =>
      `📋 *Class is starting now!* 🎓\n\n${name}, your *${courseName}* session has begun!\n\nSign in here:\n👉 ${attendanceLink}\n\nYou'll need the *class code on the board/screen* to complete sign-in.\n\nSee you inside! 💪`

    const smsMsg = (name) =>
      `CCE: ${courseName} class started! Sign in at: ${attendanceLink} - Use the code on the board. - Cambridge Centre of Excellence`

    let sent = 0
    for (const enr of enrolments || []) {
      if (enr.student_phone) {
        await sendWA({ phone: enr.student_phone, message: waMsg(enr.student_name), leadId: enr.lead_id, type: 'attendance' })
        await sendSMS({ phone: enr.student_phone, message: smsMsg(enr.student_name), leadId: enr.lead_id, type: 'attendance' })
        sent++
      }
    }

    return res.status(200).json({
      ok: true,
      code_inperson: codeInPerson,
      code_online:   codeOnline,
      attendance_link: attendanceLink,
      students_notified: sent,
    })
  }

  // ── Submit Attendance (student) ───────────────────────────────────────────
  if (action === 'submit' && req.method === 'POST') {
    const { session_id, student_name_input, code, mode = 'in-person' } = req.body
    if (!session_id || !student_name_input || !code) {
      return res.status(400).json({ error: 'session_id, student_name_input, and code are required' })
    }

    // Validate session is open
    const { data: session } = await sb.from('class_sessions')
      .select('*, cohort:cohort_id(*)').eq('id', session_id).single()

    if (!session?.attendance_open) return res.status(400).json({ error: 'Attendance is not currently open for this session.' })

    // Check code
    const correctCode = mode === 'online' ? session.class_code_online : session.class_code_inperson
    const codeValid = code.toUpperCase().trim() === correctCode?.toUpperCase().trim()

    if (!codeValid) return res.status(400).json({ error: 'Incorrect class code. Please check the board and try again.' })

    // Find enrolment by name (fuzzy match)
    const { data: enrolments } = await sb.from('enrolments')
      .select('*').eq('cohort_id', session.cohort_id).eq('rsvp_status', 'confirmed')

    const match = enrolments?.find(e =>
      e.student_name.toLowerCase().includes(student_name_input.toLowerCase()) ||
      student_name_input.toLowerCase().includes(e.student_name.toLowerCase())
    )

    // Check for duplicate
    if (match) {
      const { data: existing } = await sb.from('attendance')
        .select('id').eq('session_id', session_id).eq('lead_id', match.lead_id).limit(1)
      if (existing?.length) return res.status(400).json({ error: 'You have already signed in for this session!', already_signed: true })
    }

    // Record attendance
    const { data: record } = await sb.from('attendance').insert({
      session_id,
      cohort_id:    session.cohort_id,
      enrolment_id: match?.id || null,
      lead_id:      match?.lead_id || null,
      student_name: match?.student_name || student_name_input,
      student_phone: match?.student_phone || '',
      mode,
      code_used:    code.toUpperCase(),
      code_valid:   true,
      ip_address:   req.headers['x-forwarded-for'] || '',
    }).select().single()

    return res.status(200).json({
      ok: true,
      message: `Welcome, ${match?.student_name || student_name_input}! ✅ You're signed in.`,
      student_name: match?.student_name || student_name_input,
      session_date: session.session_date,
      course: session.cohort?.course_name,
    })
  }

  // ── Live status ───────────────────────────────────────────────────────────
  if (action === 'status' && req.method === 'GET') {
    const session_id = req.query.session_id
    if (!session_id) return res.status(400).json({ error: 'session_id required' })

    const [{ data: session }, { data: records }, { data: expected }] = await Promise.all([
      sb.from('class_sessions').select('*, cohort:cohort_id(course_name, class_day, class_time)').eq('id', session_id).single(),
      sb.from('attendance').select('*').eq('session_id', session_id).order('checked_in_at'),
      sb.from('enrolments').select('id').eq('cohort_id', session?.cohort_id || '').eq('rsvp_status', 'confirmed'),
    ])

    return res.status(200).json({
      ok: true,
      session,
      attendance: records || [],
      count_inperson: records?.filter(r => r.mode === 'in-person').length || 0,
      count_online:   records?.filter(r => r.mode === 'online').length || 0,
      total:          records?.length || 0,
      expected:       expected?.length || 0,
    })
  }

  // ── Close Attendance ──────────────────────────────────────────────────────
  if (action === 'close' && req.method === 'POST') {
    const { session_id } = req.body
    await sb.from('class_sessions').update({
      attendance_open: false,
      attendance_closed_at: new Date().toISOString(),
    }).eq('id', session_id)
    return res.status(200).json({ ok: true, message: 'Attendance closed' })
  }

  return res.status(404).json({ error: 'Unknown action' })
}
