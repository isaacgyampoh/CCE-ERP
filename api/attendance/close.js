import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { session_id } = req.body
  if (!session_id) return res.status(400).json({ error: 'session_id required' })

  await sb.from('class_sessions').update({
    attendance_open:      false,
    attendance_closed_at: new Date().toISOString(),
  }).eq('id', session_id)

  return res.status(200).json({ ok: true, message: 'Attendance closed' })
}
