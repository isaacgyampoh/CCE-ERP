import { sb } from '../_lib/config.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token, response } = req.body
  if (!token || !response) return res.status(400).json({ error: 'token and response required' })

  const { data: enr } = await sb.from('enrolments').select('*, cohort:cohort_id(*)').eq('rsvp_token', token).single()
  if (!enr) return res.status(404).json({ error: 'Invalid RSVP link' })

  const status = response === 'yes' ? 'confirmed' : 'declined'
  await sb.from('enrolments').update({ rsvp_status: status, rsvp_responded_at: new Date().toISOString() }).eq('id', enr.id)

  const { data: pms } = await sb.from('staff').select('id').in('role', ['pm','admin','instructor']).eq('is_active', true)
  for (const pm of pms || []) {
    await sb.from('notifications').insert({
      staff_id: pm.id,
      title: `RSVP ${status === 'confirmed' ? '✅' : '❌'}: ${enr.student_name}`,
      message: `${enr.student_name} has ${status} attendance for ${enr.cohort?.course_name}`,
      type: 'rsvp',
    })
  }

  return res.status(200).json({
    ok: true,
    status,
    student: enr.student_name,
    course: enr.cohort?.course_name,
    class_date: enr.cohort?.start_date,
  })
}
