import { sb } from '../_lib/config.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { session_id, student_name_input, code, mode = 'in-person' } = req.body
  if (!session_id || !student_name_input || !code) {
    return res.status(400).json({ error: 'session_id, student_name_input, and code are required' })
  }

  const { data: session } = await sb.from('class_sessions')
    .select('*, cohort:cohort_id(*)').eq('id', session_id).single()

  if (!session?.attendance_open) {
    return res.status(400).json({ error: 'Attendance is not currently open for this session.' })
  }

  const correctCode = mode === 'online' ? session.class_code_online : session.class_code_inperson
  const codeValid   = code.toUpperCase().trim() === correctCode?.toUpperCase().trim()

  if (!codeValid) {
    return res.status(400).json({ error: 'Incorrect class code. Please check the board and try again.' })
  }

  const { data: enrolments } = await sb.from('enrolments')
    .select('*').eq('cohort_id', session.cohort_id).eq('rsvp_status', 'confirmed')

  const match = enrolments?.find(e =>
    e.student_name.toLowerCase().includes(student_name_input.toLowerCase()) ||
    student_name_input.toLowerCase().includes(e.student_name.toLowerCase())
  )

  if (match) {
    const { data: existing } = await sb.from('attendance')
      .select('id').eq('session_id', session_id).eq('lead_id', match.lead_id).limit(1)
    if (existing?.length) {
      return res.status(400).json({ error: 'You have already signed in for this session!', already_signed: true })
    }
  }

  await sb.from('attendance').insert({
    session_id,
    cohort_id:     session.cohort_id,
    enrolment_id:  match?.id || null,
    lead_id:       match?.lead_id || null,
    student_name:  match?.student_name || student_name_input,
    student_phone: match?.student_phone || '',
    mode,
    code_used:     code.toUpperCase(),
    code_valid:    true,
    ip_address:    req.headers['x-forwarded-for'] || '',
  })

  return res.status(200).json({
    ok:           true,
    message:      `Welcome, ${match?.student_name || student_name_input}! ✅ You're signed in.`,
    student_name: match?.student_name || student_name_input,
    session_date: session.session_date,
    course:       session.cohort?.course_name,
  })
}
