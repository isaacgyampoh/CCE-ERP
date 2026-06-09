import { sb, APP_URL } from '../_lib/config.js'
import { sendWA, sendSMS } from '../_lib/notify.js'

function genCode(len = 6) {
  return Math.random().toString(36).toUpperCase().slice(2, 2 + len)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { session_id } = req.body
  if (!session_id) return res.status(400).json({ error: 'session_id required' })

  const codeInPerson   = genCode(6)
  const codeOnline     = genCode(6)
  const attendanceLink = `${APP_URL}/attend?s=${session_id}`

  await sb.from('class_sessions').update({
    attendance_open:         true,
    attendance_opened_at:    new Date().toISOString(),
    class_code_inperson:     codeInPerson,
    class_code_online:       codeOnline,
    attendance_link_sent:    true,
    attendance_link_sent_at: new Date().toISOString(),
  }).eq('id', session_id)

  const { data: session } = await sb.from('class_sessions')
    .select('*, cohort:cohort_id(*)').eq('id', session_id).single()

  const courseName = session?.cohort?.course_name || 'your class'

  const { data: enrolments } = await sb.from('enrolments')
    .select('*').eq('cohort_id', session.cohort_id).eq('rsvp_status', 'confirmed')

  const waMsg  = (name) =>
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
    code_inperson:     codeInPerson,
    code_online:       codeOnline,
    attendance_link:   attendanceLink,
    students_notified: sent,
  })
}
