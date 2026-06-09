import { sb } from '../_lib/config.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const session_id = req.query.session_id
  if (!session_id) return res.status(400).json({ error: 'session_id required' })

  const [{ data: session }, { data: records }, { data: expected }] = await Promise.all([
    sb.from('class_sessions').select('*, cohort:cohort_id(course_name, class_day, class_time)').eq('id', session_id).single(),
    sb.from('attendance').select('*').eq('session_id', session_id).order('checked_in_at'),
    sb.from('enrolments').select('id').eq('cohort_id', session?.cohort_id || '').eq('rsvp_status', 'confirmed'),
  ])

  return res.status(200).json({
    ok:             true,
    session,
    attendance:     records || [],
    count_inperson: records?.filter(r => r.mode === 'in-person').length || 0,
    count_online:   records?.filter(r => r.mode === 'online').length || 0,
    total:          records?.length || 0,
    expected:       expected?.length || 0,
  })
}
