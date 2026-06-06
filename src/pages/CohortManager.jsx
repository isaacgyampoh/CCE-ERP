import { useState, useEffect } from 'react'
import { Avatar, Badge, EmptyState, Spinner, Modal, Label } from '@/components/ui'
import { Icon } from '@/components/ui'
import { fmtDate } from '@/lib/helpers'

export default function CohortManager({ sb, staff, courses, user }) {
  const [cohorts, setCohorts] = useState([])
  const [sessions, setSessions] = useState([])
  const [enrolments, setEnrolments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)   // selected cohort
  const [tab, setTab] = useState('cohorts')         // cohorts | sessions | enrolments
  const [cohortModal, setCohortModal] = useState(null)
  const [sessionModal, setSessionModal] = useState(null)
  const [enrolModal, setEnrolModal] = useState(null)
  const [registrations, setRegistrations] = useState([])
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState({})
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: c }, { data: r }] = await Promise.all([
      sb.from('cohorts').select('*, instructor:instructor_id(id,name), course:course_id(id,name)').order('start_date', { ascending: false }),
      sb.from('registrations').select('id, full_name, phone, email, course_interest, mode_preference, lead_id, status').eq('status', 'paid'),
    ])
    setCohorts(c || [])
    setRegistrations(r || [])
    setLoading(false)
  }

  const loadCohortDetails = async (cohort) => {
    setSelected(cohort)
    const [{ data: sess }, { data: enr }] = await Promise.all([
      sb.from('class_sessions').select('*').eq('cohort_id', cohort.id).order('session_date'),
      sb.from('enrolments').select('*').eq('cohort_id', cohort.id).order('student_name'),
    ])
    setSessions(sess || [])
    setEnrolments(enr || [])
    setTab('sessions')
  }

  const saveCohort = async () => {
    setSaving(true)
    const { id, created_at, updated_at, instructor, course, ...data } = cohortModal
    data.updated_at = new Date().toISOString()
    if (id) await sb.from('cohorts').update(data).eq('id', id)
    else await sb.from('cohorts').insert(data)
    setSaving(false); setCohortModal(null); loadAll()
    showToast(id ? 'Cohort updated!' : 'Cohort created!')
  }

  const saveSession = async () => {
    setSaving(true)
    const { id, created_at, ...data } = sessionModal
    data.cohort_id = selected.id
    if (!data.class_code_inperson) data.class_code_inperson = Math.random().toString(36).toUpperCase().slice(2, 8)
    if (!data.class_code_online)   data.class_code_online   = Math.random().toString(36).toUpperCase().slice(2, 8)
    if (id) await sb.from('class_sessions').update(data).eq('id', id)
    else await sb.from('class_sessions').insert(data)
    setSaving(false); setSessionModal(null)
    const { data: sess } = await sb.from('class_sessions').select('*').eq('cohort_id', selected.id).order('session_date')
    setSessions(sess || []); showToast('Session saved!')
  }

  const enrolStudent = async (reg) => {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    await sb.from('enrolments').upsert({
      cohort_id: selected.id,
      registration_id: reg.id,
      lead_id: reg.lead_id,
      student_name: reg.full_name,
      student_phone: reg.phone || '',
      student_email: reg.email || '',
      mode: reg.mode_preference || 'in-person',
      rsvp_status: 'pending',
      rsvp_token: token,
    }, { onConflict: 'cohort_id,lead_id' })
    const { data: enr } = await sb.from('enrolments').select('*').eq('cohort_id', selected.id).order('student_name')
    setEnrolments(enr || []); showToast(`${reg.full_name} enrolled!`)
  }

  const sendReminder = async (cohortId, type) => {
    setSending(s => ({ ...s, [type]: true }))
    try {
      const res = await fetch('/api/cohorts/send-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohort_id: cohortId, reminder_type: type })
      })
      const data = await res.json()
      showToast(`${type} reminder sent to ${data.sent} students!`)
    } catch (e) { showToast('Failed to send reminders', 'error') }
    setSending(s => ({ ...s, [type]: false }))
  }

  const openAttendance = async (session) => {
    setSending(s => ({ ...s, [session.id]: true }))
    try {
      const res = await fetch('/api/attendance/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, opened_by: user.id })
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`Attendance opened! ${data.students_notified} students notified. Codes: ${data.code_inperson} (in-person) / ${data.code_online} (online)`)
        const { data: sess } = await sb.from('class_sessions').select('*').eq('cohort_id', selected.id).order('session_date')
        setSessions(sess || [])
      }
    } catch (e) { showToast('Failed to open attendance', 'error') }
    setSending(s => ({ ...s, [session.id]: false }))
  }

  const closeAttendance = async (session) => {
    await fetch('/api/attendance/close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.id })
    })
    const { data: sess } = await sb.from('class_sessions').select('*').eq('cohort_id', selected.id).order('session_date')
    setSessions(sess || []); showToast('Attendance closed.')
  }

  const instructors = staff.filter(s => s.role === 'instructor' || s.role === 'pm' || s.role === 'admin')
  const notEnrolled = registrations.filter(r => !enrolments.find(e => e.lead_id === r.lead_id))

  if (loading) return <Spinner size={24}/>

  return (
    <div className="fade-up space-y-5">
      {toast && <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg fade-up ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{toast.msg}</div>}

      {/* Cohort modal */}
      {cohortModal && (
        <Modal title={cohortModal.id ? 'Edit Cohort' : 'New Cohort'} onClose={() => setCohortModal(null)} maxWidth="max-w-lg">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Course</Label>
                <select value={cohortModal.course_id || ''} onChange={e => {
                  const c = courses.find(x => x.id === e.target.value)
                  setCohortModal({...cohortModal, course_id: e.target.value, course_name: c?.name || ''})
                }} className="inp">
                  <option value="">Select course…</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><Label>Cohort Label</Label><input value={cohortModal.label||''} onChange={e => setCohortModal({...cohortModal,label:e.target.value})} placeholder="e.g. Cohort 3 — Jan 2026" className="inp"/></div>
              <div><Label>Mode</Label>
                <select value={cohortModal.mode||'in-person'} onChange={e => setCohortModal({...cohortModal,mode:e.target.value})} className="inp">
                  <option value="in-person">In-Person</option><option value="online">Online</option><option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div><Label>Start Date *</Label><input type="date" value={cohortModal.start_date||''} onChange={e => setCohortModal({...cohortModal,start_date:e.target.value})} className="inp"/></div>
              <div><Label>End Date</Label><input type="date" value={cohortModal.end_date||''} onChange={e => setCohortModal({...cohortModal,end_date:e.target.value})} className="inp"/></div>
              <div><Label>Class Day</Label>
                <select value={cohortModal.class_day||'Saturday'} onChange={e => setCohortModal({...cohortModal,class_day:e.target.value})} className="inp">
                  {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
              <div><Label>Class Time</Label><input type="time" value={cohortModal.class_time||'09:00'} onChange={e => setCohortModal({...cohortModal,class_time:e.target.value})} className="inp"/></div>
              <div className="col-span-2"><Label>Location / Zoom Link</Label><input value={cohortModal.location||''} onChange={e => setCohortModal({...cohortModal,location:e.target.value})} placeholder="Address or Zoom link" className="inp"/></div>
              <div><Label>Max Students</Label><input type="number" value={cohortModal.max_students||30} onChange={e => setCohortModal({...cohortModal,max_students:Number(e.target.value)})} className="inp"/></div>
              <div><Label>Instructor</Label>
                <select value={cohortModal.instructor_id||''} onChange={e => setCohortModal({...cohortModal,instructor_id:e.target.value})} className="inp">
                  <option value="">— None —</option>
                  {instructors.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div><Label>Status</Label>
                <select value={cohortModal.status||'upcoming'} onChange={e => setCohortModal({...cohortModal,status:e.target.value})} className="inp">
                  <option value="upcoming">Upcoming</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={saveCohort} disabled={!cohortModal.course_name||!cohortModal.start_date||saving} className="btn btn-primary flex-1">{saving?'Saving…':'Save Cohort'}</button>
            <button onClick={() => setCohortModal(null)} className="btn btn-ghost flex-1">Cancel</button>
          </div>
        </Modal>
      )}

      {/* Session modal */}
      {sessionModal && (
        <Modal title={sessionModal.id ? 'Edit Session' : 'New Session'} onClose={() => setSessionModal(null)}>
          <div className="space-y-3">
            <div><Label>Session Date *</Label><input type="date" value={sessionModal.session_date||''} onChange={e => setSessionModal({...sessionModal,session_date:e.target.value})} className="inp"/></div>
            <div><Label>Session Number</Label><input type="number" value={sessionModal.session_number||1} onChange={e => setSessionModal({...sessionModal,session_number:Number(e.target.value)})} className="inp"/></div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">Class codes are auto-generated when attendance is opened. You can also set them manually below.</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Code — In-Person</Label><input value={sessionModal.class_code_inperson||''} onChange={e => setSessionModal({...sessionModal,class_code_inperson:e.target.value.toUpperCase()})} placeholder="Auto" className="inp font-mono uppercase" maxLength={6}/></div>
              <div><Label>Code — Online</Label><input value={sessionModal.class_code_online||''} onChange={e => setSessionModal({...sessionModal,class_code_online:e.target.value.toUpperCase()})} placeholder="Auto" className="inp font-mono uppercase" maxLength={6}/></div>
            </div>
            <div><Label>Notes</Label><textarea value={sessionModal.notes||''} onChange={e => setSessionModal({...sessionModal,notes:e.target.value})} className="inp" rows="2"/></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={saveSession} disabled={!sessionModal.session_date||saving} className="btn btn-primary flex-1">{saving?'Saving…':'Save Session'}</button>
            <button onClick={() => setSessionModal(null)} className="btn btn-ghost flex-1">Cancel</button>
          </div>
        </Modal>
      )}

      {/* Enrol modal */}
      {enrolModal && (
        <Modal title="Enrol Student" onClose={() => setEnrolModal(null)}>
          <p className="text-xs text-slate-400 mb-3">Select a paid student to enrol in <strong>{selected?.label || selected?.course_name}</strong>:</p>
          {notEnrolled.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">All paid students are already enrolled in this cohort.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {notEnrolled.map(r => (
                <button key={r.id} onClick={() => { enrolStudent(r); setEnrolModal(null) }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 transition text-left border border-transparent hover:border-blue-200">
                  <Avatar name={r.full_name} size={32}/>
                  <div><div className="font-medium text-slate-900 text-sm">{r.full_name}</div><div className="text-[10px] text-slate-400">{r.course_interest} · {r.mode_preference||'—'}</div></div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {selected ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setSelected(null); setTab('cohorts') }} className="text-slate-400 hover:text-slate-700 transition">{Icon.back}</button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{selected.label || selected.course_name}</h1>
                <p className="text-sm text-slate-400">{fmtDate(selected.start_date)} · {selected.mode} · {selected.class_day} {selected.class_time}</p>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold text-slate-900">Classes & Cohorts</h1>
              <p className="text-sm text-slate-400 mt-0.5">Manage courses, sessions, enrolments & attendance</p>
            </div>
          )}
        </div>
        {!selected && <button onClick={() => setCohortModal({ mode:'in-person', status:'upcoming', class_day:'Saturday', class_time:'09:00', max_students:30 })} className="btn btn-primary">+ New Cohort</button>}
      </div>

      {/* Cohort list */}
      {!selected && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cohorts.length === 0 ? <div className="col-span-3"><EmptyState icon="📚" title="No cohorts yet" action={<button onClick={() => setCohortModal({ mode:'in-person', status:'upcoming', class_day:'Saturday', class_time:'09:00', max_students:30 })} className="btn btn-primary btn-sm">Create first cohort</button>}/></div> :
            cohorts.map(c => (
              <div key={c.id} className="card p-4 hover:shadow-md transition cursor-pointer" onClick={() => loadCohortDetails(c)}>
                <div className="flex items-start justify-between mb-3">
                  <div><div className="font-bold text-slate-900 text-sm">{c.label || c.course_name}</div><div className="text-[10px] text-slate-400 mt-0.5 capitalize">{c.mode} · {c.class_day}</div></div>
                  <span className={`badge ${c.status==='active'?'bg-emerald-50 text-emerald-600':c.status==='upcoming'?'bg-blue-50 text-blue-600':c.status==='completed'?'bg-slate-100 text-slate-500':'bg-red-50 text-red-500'}`}>{c.status}</span>
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <div>📅 Starts: {fmtDate(c.start_date)}</div>
                  {c.instructor && <div>👤 {c.instructor.name}</div>}
                  <div>🎓 Max: {c.max_students} students</div>
                </div>
                <div className="flex gap-1.5 mt-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => loadCohortDetails(c)} className="btn btn-primary btn-sm flex-1">Manage</button>
                  <button onClick={() => setCohortModal(c)} className="btn btn-ghost btn-sm">{Icon.edit}</button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Cohort detail tabs */}
      {selected && (
        <>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
            {[['sessions','Sessions'],['enrolments','Students'],['reminders','Reminders']].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${tab===t?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{l}</button>
            ))}
          </div>

          {/* Sessions tab */}
          {tab === 'sessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Sessions ({sessions.length})</h2>
                <button onClick={() => setSessionModal({ session_number: sessions.length + 1 })} className="btn btn-primary btn-sm">+ Session</button>
              </div>
              <div className="card overflow-hidden">
                {sessions.length === 0 ? <EmptyState icon="📅" title="No sessions yet"/> : (
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Date</th><th>Code (In-Person)</th><th>Code (Online)</th><th>Attendance</th><th>Actions</th></tr></thead>
                    <tbody>
                      {sessions.map(s => (
                        <tr key={s.id}>
                          <td className="font-bold text-slate-400">{s.session_number}</td>
                          <td className="font-medium text-slate-900">{fmtDate(s.session_date)}</td>
                          <td><code className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{s.class_code_inperson || '—'}</code></td>
                          <td><code className="text-sm font-mono font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">{s.class_code_online || '—'}</code></td>
                          <td>
                            {s.attendance_open
                              ? <span className="badge bg-emerald-50 text-emerald-600 animate-pulse">🟢 LIVE</span>
                              : s.attendance_opened_at
                              ? <span className="badge bg-slate-100 text-slate-500">Closed</span>
                              : <span className="badge bg-slate-100 text-slate-400">Not opened</span>}
                          </td>
                          <td>
                            <div className="flex gap-1.5">
                              {!s.attendance_open ? (
                                <button onClick={() => openAttendance(s)} disabled={!!sending[s.id]} className="btn btn-primary btn-sm press">
                                  {sending[s.id] ? '…' : '▶ Open'}
                                </button>
                              ) : (
                                <button onClick={() => closeAttendance(s)} className="btn btn-danger btn-sm">⏹ Close</button>
                              )}
                              <button onClick={() => setSessionModal(s)} className="btn btn-ghost btn-sm">{Icon.edit}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Enrolments tab */}
          {tab === 'enrolments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Students ({enrolments.length} / {selected.max_students})</h2>
                <button onClick={() => setEnrolModal(true)} className="btn btn-primary btn-sm">+ Enrol Student</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="stat-card"><div className="stat-value text-emerald-600">{enrolments.filter(e=>e.rsvp_status==='confirmed').length}</div><div className="stat-label">Confirmed</div></div>
                <div className="stat-card"><div className="stat-value text-amber-600">{enrolments.filter(e=>e.rsvp_status==='pending').length}</div><div className="stat-label">Pending RSVP</div></div>
                <div className="stat-card"><div className="stat-value text-red-500">{enrolments.filter(e=>e.rsvp_status==='declined').length}</div><div className="stat-label">Declined</div></div>
              </div>
              <div className="card overflow-hidden">
                {enrolments.length === 0 ? <EmptyState icon="🎓" title="No students enrolled yet"/> : (
                  <table className="data-table">
                    <thead><tr><th>Student</th><th>Mode</th><th>RSVP</th><th className="hidden md:table-cell">Reminders</th></tr></thead>
                    <tbody>
                      {enrolments.map(e => (
                        <tr key={e.id}>
                          <td>
                            <div className="flex items-center gap-2.5"><Avatar name={e.student_name} size={28}/>
                              <div><div className="font-medium text-slate-900 text-sm">{e.student_name}</div><div className="text-[10px] text-slate-400">{e.student_phone}</div></div>
                            </div>
                          </td>
                          <td><span className="badge bg-slate-100 text-slate-600 capitalize">{e.mode}</span></td>
                          <td>
                            <span className={`badge ${e.rsvp_status==='confirmed'?'bg-emerald-50 text-emerald-600':e.rsvp_status==='declined'?'bg-red-50 text-red-500':'bg-amber-50 text-amber-600'}`}>
                              {e.rsvp_status}
                            </span>
                          </td>
                          <td className="hidden md:table-cell">
                            <div className="flex gap-1 text-[10px]">
                              {[['1M',e.reminder_1month_sent],['1W',e.reminder_1week_sent],['2D',e.reminder_2day_sent]].map(([l,s])=>(
                                <span key={l} className={`px-1.5 py-0.5 rounded font-semibold ${s?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-400'}`}>{l}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Reminders tab */}
          {tab === 'reminders' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Send Reminders</h2>
              <p className="text-xs text-slate-400">These send via WhatsApp + SMS to all confirmed students. Reminders also auto-send daily via cron job.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { key:'1month', label:'1 Month Reminder', sub:'Announce class is coming in a month', icon:'📅' },
                  { key:'1week',  label:'1 Week Reminder',  sub:'Give full class details — day, time, location', icon:'⏰' },
                  { key:'2day',   label:'2 Day Reminder',   sub:'Ask to confirm attendance, final prep', icon:'🔔' },
                  { key:'rsvp',   label:'RSVP Request',     sub:'Send unique link asking if they will attend', icon:'✋' },
                ].map(r => (
                  <div key={r.key} className="card p-4">
                    <div className="text-2xl mb-2">{r.icon}</div>
                    <div className="font-semibold text-slate-900 text-sm mb-0.5">{r.label}</div>
                    <div className="text-xs text-slate-400 mb-3">{r.sub}</div>
                    <button onClick={() => sendReminder(selected.id, r.key)} disabled={!!sending[r.key]}
                      className="btn btn-primary btn-sm w-full press">
                      {sending[r.key] ? 'Sending…' : `Send ${r.label}`}
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
                <div className="font-semibold text-slate-700">Auto-reminder cron job</div>
                <div>Add to Vercel: <code className="bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono">GET /api/cohorts/send-reminder?cron=true</code> — runs daily at 8AM</div>
                <div>Add this to <code>vercel.json</code> under <code>"crons"</code> to enable automatic daily reminders.</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
