import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON } from '@/lib/constants'

const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

export default function AttendPage() {
  const params    = new URLSearchParams(window.location.search)
  const sessionId = params.get('s')

  const [step, setStep]         = useState('loading')  // loading | name | code | success | error | closed
  const [session, setSession]   = useState(null)
  const [enrolments, setEnrolments] = useState([])
  const [nameInput, setNameInput]   = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedName, setSelectedName] = useState('')
  const [mode, setMode]         = useState('in-person')
  const [code, setCode]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState(null)
  const nameRef = useRef(null)

  useEffect(() => {
    if (!sessionId) { setStep('error'); return }
    init()
  }, [])

  const init = async () => {
    const { data: session } = await sb.from('class_sessions')
      .select('*, cohort:cohort_id(id, course_name, mode, class_day, class_time, location)').eq('id', sessionId).single()

    if (!session) { setStep('error'); return }
    if (!session.attendance_open) { setStep('closed'); setSession(session); return }

    setSession(session)

    // Load confirmed enrolments
    const { data: enr } = await sb.from('enrolments')
      .select('student_name, lead_id, mode').eq('cohort_id', session.cohort_id).eq('rsvp_status', 'confirmed')

    setEnrolments(enr || [])
    setStep('name')
    setTimeout(() => nameRef.current?.focus(), 300)
  }

  // Fuzzy name suggestions
  useEffect(() => {
    if (!nameInput.trim() || nameInput.length < 2) { setSuggestions([]); return }
    const q = nameInput.toLowerCase()
    const matches = enrolments
      .filter(e => e.student_name.toLowerCase().includes(q))
      .slice(0, 5)
    setSuggestions(matches)
  }, [nameInput, enrolments])

  const pickName = (name, m) => {
    setSelectedName(name)
    setNameInput(name)
    setMode(m || mode)
    setSuggestions([])
    setStep('code')
    setTimeout(() => document.getElementById('code-input')?.focus(), 200)
  }

  const handleNameNext = () => {
    if (!nameInput.trim()) return
    setSelectedName(nameInput.trim())
    setSuggestions([])
    setStep('code')
  }

  const submit = async () => {
    if (code.trim().length < 4) { setError('Please enter the full class code.'); return }
    setSubmitting(true); setError('')

    try {
      const res = await fetch('/api/attendance/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, student_name_input: selectedName, code: code.trim(), mode }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult(data); setStep('success')
      } else {
        setError(data.error || 'Something went wrong.')
        setSubmitting(false)
      }
    } catch (e) { setError('Network error. Please try again.'); setSubmitting(false) }
  }

  // ── Screens ───────────────────────────────────────────────────────────────
  const Header = () => (
    <div className="text-center mb-8">
      <div className="w-14 h-14 bg-blue-700 rounded-2xl flex items-center justify-center text-2xl font-black text-white mx-auto mb-4">C</div>
      <h1 className="text-lg font-black text-slate-900">Cambridge Center of Excellence</h1>
      {session && <p className="text-sm text-slate-500 mt-1">{session.cohort?.course_name}</p>}
      {session && <p className="text-xs text-slate-400 mt-0.5">{session.cohort?.class_day} · {session.cohort?.class_time}</p>}
    </div>
  )

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"/>
    </div>
  )

  if (step === 'closed') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Attendance Closed</h2>
        <p className="text-sm text-slate-500">Attendance sign-in is not currently open for this session. Contact your instructor.</p>
        {session && <p className="text-xs text-slate-400 mt-3">{session.cohort?.course_name}</p>}
      </div>
    </div>
  )

  if (step === 'error') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Invalid Link</h2>
        <p className="text-sm text-slate-500">This attendance link is not valid. Contact Cambridge Center of Excellence for help.</p>
      </div>
    </div>
  )

  if (step === 'success') return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">✅</div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Signed In!</h2>
        <p className="text-slate-600 text-sm mb-4">
          Welcome, <strong>{result?.student_name}</strong>!<br/>
          Your attendance has been recorded.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
          <div className="flex justify-between"><span>Course</span><span className="font-semibold">{result?.course}</span></div>
          <div className="flex justify-between"><span>Mode</span><span className="font-semibold capitalize">{mode}</span></div>
          <div className="flex justify-between"><span>Time</span><span className="font-semibold">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>
        <p className="text-xs text-slate-400 mt-4">You're all set. Enjoy your class! 🎓</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <Header/>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {['name','code'].map((s, i) => (
            <div key={s} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
              {i > 0 && <div className={`flex-1 h-0.5 mx-2 ${step === 'code' ? 'bg-blue-400' : 'bg-slate-200'}`}/>}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step === s || (step === 'code' && s === 'name') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {step === 'code' && s === 'name' ? '✓' : i + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 'name' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1">Type your name</h2>
              <p className="text-xs text-slate-400 mb-3">Start typing — your name will appear below if you're enrolled.</p>
              <input
                ref={nameRef}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !suggestions.length && handleNameNext()}
                placeholder="e.g. Kwame Asante"
                className="inp text-base"
                autoComplete="off"
              />
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select your name</div>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => pickName(s.student_name, s.mode)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition text-left border-t border-slate-100">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {s.student_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.student_name}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{s.mode || 'in-person'}</div>
                    </div>
                    <svg className="ml-auto text-blue-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
            )}

            {nameInput.length >= 2 && suggestions.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Name not found in enrolment list. You can still continue — your entry will be flagged for review.
              </div>
            )}

            <button onClick={handleNameNext} disabled={!nameInput.trim()}
              className="btn btn-primary w-full press">Continue →</button>
          </div>
        )}

        {/* Step 2: Mode + Code */}
        {step === 'code' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Hello, {selectedName.split(' ')[0]}! 👋</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Select your attendance mode, then enter the code shown on the board or screen.</p>
            </div>

            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-2">
              {[['in-person','🏢','In-Person'],['online','💻','Online']].map(([val, icon, label]) => (
                <button key={val} onClick={() => setMode(val)}
                  className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition font-medium text-sm ${mode === val ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  <span className="text-xl">{icon}</span>{label}
                </button>
              ))}
            </div>

            {/* Class code input */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Class Code (from the {mode === 'online' ? 'screen' : 'board'})
              </label>
              <input
                id="code-input"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="e.g. X7K2MN"
                maxLength={6}
                className="inp text-center text-2xl font-black tracking-[0.3em] uppercase"
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setStep('name'); setCode(''); setError('') }} className="btn btn-ghost flex-shrink-0">← Back</button>
              <button onClick={submit} disabled={!code.trim() || submitting} className="btn btn-primary flex-1 press">
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Signing in…</>
                ) : 'Sign In ✓'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
