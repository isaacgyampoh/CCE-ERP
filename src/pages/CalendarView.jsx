import { useState, useEffect } from 'react'
import { Spinner, EmptyState } from '@/components/ui'
import { fmtDate } from '@/lib/helpers'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateKey(ts) {
  // Returns 'YYYY-MM-DD' in local time
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EVENT_TYPES = {
  follow_up:    { color: 'bg-amber-400',   label: 'Follow-up needed' },
  cohort_start: { color: 'bg-blue-500',    label: 'Cohort starts' },
  cohort_end:   { color: 'bg-slate-400',   label: 'Cohort ends' },
  session:      { color: 'bg-indigo-500',  label: 'Class session' },
  pending_reg:  { color: 'bg-orange-400',  label: 'Pending registration' },
}

export default function CalendarView({ leads, sb }) {
  const [cohorts,  setCohorts]  = useState([])
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [viewDate, setViewDate] = useState(new Date())
  const [selected, setSelected] = useState(null)   // selected day number

  useEffect(() => {
    Promise.all([
      sb.from('cohorts').select('id, course_name, label, start_date, end_date, status').order('start_date'),
      sb.from('class_sessions').select('id, session_date, session_number, cohort_id, cohort:cohort_id(course_name, label)').order('session_date'),
    ]).then(([{ data: c }, { data: s }]) => {
      setCohorts(c || [])
      setSessions(s || [])
      setLoading(false)
    })
  }, [])

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth     = new Date(year, month + 1, 0).getDate()

  // Build event map: 'YYYY-MM-DD' -> event[]
  const events = {}
  const addEvent = (dateStr, ev) => {
    if (!events[dateStr]) events[dateStr] = []
    events[dateStr].push(ev)
  }

  const todayKey = dateKey(new Date())

  // Follow-up leads → today's date (needs attention now)
  leads.filter(l => ['follow_up', 'assigned', 'contacted'].includes(l.status)).forEach(l =>
    addEvent(todayKey, { type: 'follow_up', label: l.name, leadId: l.id })
  )

  // Pending registration leads → today
  leads.filter(l => l.status === 'pending_registration').forEach(l =>
    addEvent(todayKey, { type: 'pending_reg', label: l.name, leadId: l.id })
  )

  // Cohort start/end dates
  cohorts.forEach(c => {
    if (c.start_date) addEvent(c.start_date, { type: 'cohort_start', label: c.label || c.course_name })
    if (c.end_date)   addEvent(c.end_date,   { type: 'cohort_end',   label: c.label || c.course_name })
  })

  // Class sessions
  sessions.forEach(s => {
    if (s.session_date) {
      addEvent(s.session_date, {
        type: 'session',
        label: `Session ${s.session_number}: ${s.cohort?.label || s.cohort?.course_name || 'Class'}`,
      })
    }
  })

  const cellDateKey = (d) => {
    const m = String(month + 1).padStart(2, '0')
    const day = String(d).padStart(2, '0')
    return `${year}-${m}-${day}`
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))
  const goToday   = () => { setViewDate(new Date()); setSelected(new Date().getDate()) }

  const selectedKey    = selected ? cellDateKey(selected) : null
  const selectedEvents = selectedKey ? (events[selectedKey] || []) : []
  const selectedDate   = selected ? new Date(year, month, selected) : null

  // Upcoming events (future only, sorted)
  const upcomingKeys = Object.keys(events)
    .filter(k => k > todayKey)
    .sort()
    .slice(0, 12)

  if (loading) return <Spinner size={24}/>

  return (
    <div className="fade-up space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Calendar</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Follow-up reminders, cohort dates &amp; class sessions
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Calendar grid */}
        <div className="lg:col-span-2 card p-5">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="btn btn-ghost btn-sm">← Prev</button>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-slate-900">
                {viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={goToday} className="text-[11px] text-blue-600 font-medium">Today</button>
            </div>
            <button onClick={nextMonth} className="btn btn-ghost btn-sm">Next →</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {/* Empty leading cells */}
            {Array.from({ length: firstDayOfMonth }, (_, i) => <div key={`e${i}`}/>)}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const d   = i + 1
              const key = cellDateKey(d)
              const dayEvents = events[key] || []
              const isToday    = key === todayKey
              const isSel      = d === selected

              return (
                <button
                  key={d}
                  onClick={() => setSelected(d === selected ? null : d)}
                  className={`relative min-h-[56px] p-1.5 rounded-lg text-left transition border
                    ${isSel   ? 'bg-blue-50 border-blue-200 shadow-sm'
                    : isToday ? 'bg-amber-50 border-amber-200'
                    : dayEvents.length > 0
                               ? 'bg-slate-50 border-slate-150 hover:bg-slate-100'
                               : 'border-transparent hover:bg-slate-50'}`}
                >
                  <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-amber-700' : isSel ? 'text-blue-700' : 'text-slate-600'}`}>
                    {d}
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {dayEvents.slice(0, 3).map((ev, ei) => (
                      <div key={ei} className={`w-1.5 h-1.5 rounded-full ${EVENT_TYPES[ev.type]?.color || 'bg-slate-400'}`}/>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[8px] text-slate-400 font-semibold">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <div className={`w-2 h-2 rounded-full ${v.color}`}/>
                {v.label}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="space-y-4">
          {/* Selected day */}
          <div className="card p-4">
            {selectedDate ? (
              <>
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {selectedEvents.length === 0 ? (
                  <EmptyState icon="🗓️" title="No events" sub="Nothing on this day"/>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map((ev, i) => {
                      const t = EVENT_TYPES[ev.type]
                      return (
                        <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50">
                          <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${t?.color || 'bg-slate-400'}`}/>
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {t?.label || ev.type}
                            </div>
                            <div className="text-xs text-slate-700 font-medium mt-0.5">{ev.label}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">Click a day to see events</p>
            )}
          </div>

          {/* Today's summary */}
          <div className="card p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Today's Overview</h3>
            <div className="space-y-2">
              {[
                { label: 'Follow-ups due',    count: leads.filter(l => ['follow_up','assigned','contacted'].includes(l.status)).length, color: 'text-amber-600' },
                { label: 'Pending reg.',       count: leads.filter(l => l.status === 'pending_registration').length, color: 'text-orange-600' },
                { label: 'Classes today',      count: (events[todayKey] || []).filter(e => e.type === 'session').length, color: 'text-indigo-600' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming events */}
          <div className="card p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Upcoming</h3>
            {upcomingKeys.length === 0 ? (
              <p className="text-xs text-slate-300 text-center py-4">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {upcomingKeys.map(key => {
                  const evs = events[key] || []
                  return (
                    <div key={key}>
                      <div className="text-[10px] font-bold text-slate-400 mb-1">{fmtDate(key)}</div>
                      {evs.slice(0, 2).map((ev, i) => {
                        const t = EVENT_TYPES[ev.type]
                        return (
                          <div key={i} className="flex items-center gap-1.5 mb-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t?.color || 'bg-slate-400'}`}/>
                            <span className="text-[11px] text-slate-600 truncate">{ev.label}</span>
                          </div>
                        )
                      })}
                      {evs.length > 2 && (
                        <span className="text-[10px] text-slate-400 ml-3">+{evs.length - 2} more</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
