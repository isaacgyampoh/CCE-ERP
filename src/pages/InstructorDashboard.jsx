import { useState, useEffect, useRef } from 'react'
import { Avatar, EmptyState, Spinner } from '@/components/ui'
import { Icon } from '@/components/ui'
import { fmtDate } from '@/lib/helpers'

export default function InstructorDashboard({ sb, user }) {
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [codes, setCodes] = useState(null)
  const [toast, setToast] = useState(null)
  const pollRef = useRef(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  useEffect(() => {
    loadSessions()
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    if (selected?.attendance_open) {
      pollAttendance()
      pollRef.current = setInterval(pollAttendance, 5000) // poll every 5s when open
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [selected?.id, selected?.attendance_open])

  const loadSessions = async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await sb.from('class_sessions')
      .select('*, cohort:cohort_id(course_name, class_day, class_time, location, mode, instructor_id)')
      .gte('session_date', today)
      .order('session_date')
      .limit(10)
    setSessions(data || [])
    // Auto-select today's session if it exists
    const todaySession = data?.find(s => s.session_date === today)
    if (todaySession) { setSelected(todaySession); loadAttendance(todaySession.id) }
    setLoading(false)
  }

  const loadAttendance = async (sessionId) => {
    const { data } = await sb.from('attendance').select('*').eq('session_id', sessionId).order('checked_in_at')
    setAttendance(data || [])
  }

  const pollAttendance = async () => {
    if (!selected) return
    const { data } = await sb.from('attendance').select('*').eq('session_id', selected.id).order('checked_in_at')
    setAttendance(data || [])
    // Also refresh session state
    const { data: sess } = await sb.from('class_sessions').select('*').eq('id', selected.id).single()
    if (sess) setSelected(sess)
  }

  const openAttendance = async () => {
    if (!selected) return
    setOpening(true)
    try {
      const res = await fetch('/api/attendance/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: selected.id, opened_by: user.id })
      })
      const data = await res.json()
      if (data.ok) {
        setCodes({ inperson: data.code_inperson, online: data.code_online })
        showToast(`Attendance open! ${data.students_notified} students notified via WhatsApp + SMS`)
        const { data: sess } = await sb.from('class_sessions').select('*, cohort:cohort_id(*)').eq('id', selected.id).single()
        setSelected(sess)
        loadAttendance(selected.id)
      }
    } catch (e) { showToast('Failed to open attendance.', 'error') }
    setOpening(false)
  }

  const closeAttendance = async () => {
    await fetch('/api/attendance/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: selected.id })
    })
    const { data: sess } = await sb.from('class_sessions').select('*, cohort:cohort_id(*)').eq('id', selected.id).single()
    setSelected(sess)
    clearInterval(pollRef.current)
    showToast('Attendance closed.')
  }

  const inPerson = attendance.filter(a => a.mode === 'in-person')
  const online   = attendance.filter(a => a.mode === 'online')

  if (loading) return <Spinner size={24}/>

  return (
    <div className="fade-up space-y-6">
      {toast && <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg fade-up ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{toast.msg}</div>}

      <div>
        <h1 className="text-xl font-bold text-slate-900">Instructor Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manage class attendance for your sessions</p>
      </div>

      {/* Session selector */}
      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sessions.map(s => (
            <button key={s.id} onClick={() => { setSelected(s); loadAttendance(s.id) }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${selected?.id === s.id ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
              📅 {s.cohort?.course_name} — {fmtDate(s.session_date)}
              {s.attendance_open && <span className="ml-1.5 w-2 h-2 bg-green-400 rounded-full inline-block animate-pulse"/>}
            </button>
          ))}
        </div>
      )}

      {!selected ? (
        <EmptyState icon="📅" title="No upcoming sessions" sub="Sessions are created by the PM or Admin in Classes & Cohorts"/>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Control panel */}
          <div className="space-y-4">
            <div className="card p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Session Info</div>
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-400">Course</span><div className="font-semibold text-slate-900">{selected.cohort?.course_name}</div></div>
                <div><span className="text-slate-400">Date</span><div className="font-semibold text-slate-900">{fmtDate(selected.session_date)}</div></div>
                <div><span className="text-slate-400">Time</span><div className="font-semibold text-slate-900">{selected.cohort?.class_time}</div></div>
                <div><span className="text-slate-400">Location</span><div className="font-semibold text-slate-900 truncate">{selected.cohort?.location || 'CCE Campus'}</div></div>
              </div>
            </div>

            {/* Attendance control */}
            <div className="card p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Attendance Control</div>
              {!selected.attendance_open ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">Click the button below to open attendance. WhatsApp + SMS links will be sent automatically to all confirmed students.</p>
                  <button onClick={openAttendance} disabled={opening}
                    className="btn btn-primary w-full text-base h-12 press">
                    {opening ? (
                      <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Opening…</>
                    ) : '▶ Open Attendance'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/>
                    Attendance is LIVE
                  </div>
                  <p className="text-xs text-slate-400">Students are signing in. The list updates every 5 seconds.</p>
                  <button onClick={closeAttendance} className="btn btn-danger w-full press">⏹ Close Attendance</button>
                </div>
              )}
            </div>

            {/* Class codes */}
            {(codes || selected.class_code_inperson) && (
              <div className="card p-5 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Class Codes</div>
                <div className="text-[10px] text-slate-400">Write these on the board / share on screen</div>
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">🏢 In-Person</div>
                  <div className="text-3xl font-black tracking-[0.3em] text-blue-700 bg-blue-50 rounded-xl py-3 text-center font-mono">
                    {codes?.inperson || selected.class_code_inperson}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">💻 Online</div>
                  <div className="text-3xl font-black tracking-[0.3em] text-violet-700 bg-violet-50 rounded-xl py-3 text-center font-mono">
                    {codes?.online || selected.class_code_online}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live attendance list */}
          <div className="lg:col-span-2 space-y-4">
            {/* Counts */}
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-card text-center">
                <div className="stat-value text-blue-700">{inPerson.length}</div>
                <div className="stat-label">🏢 In-Person</div>
              </div>
              <div className="stat-card text-center">
                <div className="stat-value text-violet-700">{online.length}</div>
                <div className="stat-label">💻 Online</div>
              </div>
              <div className="stat-card text-center">
                <div className="stat-value">{attendance.length}</div>
                <div className="stat-label">Total Present</div>
              </div>
            </div>

            {/* Live list */}
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  {selected.attendance_open ? (
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/>Live Attendance</span>
                  ) : 'Attendance Record'}
                </h2>
                <span className="text-xs text-slate-400">{attendance.length} signed in</span>
              </div>
              {attendance.length === 0 ? (
                <EmptyState icon="📋" title="No sign-ins yet" sub={selected.attendance_open ? "Waiting for students to sign in…" : "Open attendance to start recording"}/>
              ) : (
                <div>
                  {/* In-person section */}
                  {inPerson.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-blue-50 text-[10px] font-bold text-blue-600 uppercase tracking-wider">🏢 In-Person ({inPerson.length})</div>
                      {inPerson.map((a, i) => (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50">
                          <span className="text-xs text-slate-300 w-5 font-bold">{i+1}</span>
                          <Avatar name={a.student_name} size={28}/>
                          <span className="flex-1 text-sm font-medium text-slate-800">{a.student_name}</span>
                          <span className="text-[10px] text-slate-400">{new Date(a.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {/* Online section */}
                  {online.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-violet-50 text-[10px] font-bold text-violet-600 uppercase tracking-wider">💻 Online ({online.length})</div>
                      {online.map((a, i) => (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50">
                          <span className="text-xs text-slate-300 w-5 font-bold">{i+1}</span>
                          <Avatar name={a.student_name} size={28}/>
                          <span className="flex-1 text-sm font-medium text-slate-800">{a.student_name}</span>
                          <span className="text-[10px] text-slate-400">{new Date(a.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
