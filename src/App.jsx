import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://PLACEHOLDER.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

// Arkesel SMS
const ARKESEL_KEY = 'VXliSENVQnpsYkhWYlNpZkNRZEc'
const SMS_SENDER = 'Cambridge'

async function sendSMS(phone, message) {
  if (!phone) return
  const recipient = phone.replace(/\s+/g, '').replace(/^0/, '233')
  try {
    await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': ARKESEL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: SMS_SENDER, message, recipients: [recipient] }),
    })
  } catch (e) { console.error('SMS error:', e) }
}

const STATUS_LABELS = {
  new: 'New', assigned: 'Assigned', contacted: 'Contacted', follow_up: 'Follow Up',
  pending_registration: 'Pending Registration', registered: 'Registered',
  next_session: 'Next Session', not_qualified: 'Not Qualified', inquiry: 'Inquiry',
}
const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700', assigned: 'bg-purple-100 text-purple-700',
  contacted: 'bg-cyan-100 text-cyan-700', follow_up: 'bg-amber-100 text-amber-700',
  pending_registration: 'bg-orange-100 text-orange-700', registered: 'bg-green-100 text-green-700',
  next_session: 'bg-indigo-100 text-indigo-700', not_qualified: 'bg-red-100 text-red-700',
  inquiry: 'bg-gray-100 text-gray-600',
}
const SOURCES = ['facebook', 'linkedin', 'website', 'manual', 'referral', 'walk-in']

export default function App() {
  const [user, setUser] = useState(null) // logged-in staff
  const [staff, setStaff] = useState([])
  const [page, setPage] = useState('dashboard')
  const [leads, setLeads] = useState([])
  const [courses, setCourses] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showNotifs, setShowNotifs] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQ, setSearchQ] = useState('')

  useEffect(() => {
    const saved = sessionStorage.getItem('cce_user')
    if (saved) { setUser(JSON.parse(saved)); loadAll(JSON.parse(saved)) }
    else { loadStaff() }
  }, [])

  async function loadStaff() {
    const { data } = await sb.from('staff').select('*').eq('is_active', true).order('name')
    setStaff(data || [])
    setLoading(false)
  }

  async function loadAll(u) {
    const [{ data: l }, { data: s }, { data: c }, { data: n }] = await Promise.all([
      sb.from('leads').select('*, staff:assigned_to(name)').order('created_at', { ascending: false }),
      sb.from('staff').select('*').eq('is_active', true).order('name'),
      sb.from('courses').select('*').order('name'),
      sb.from('notifications').select('*').eq('staff_id', u.id).order('created_at', { ascending: false }).limit(20),
    ])
    setLeads(l || [])
    setStaff(s || [])
    setCourses(c || [])
    setNotifications(n || [])
    setLoading(false)
  }

  function login(s) {
    setUser(s)
    sessionStorage.setItem('cce_user', JSON.stringify(s))
    setLoading(true)
    loadAll(s)
  }

  function logout() {
    setUser(null)
    sessionStorage.removeItem('cce_user')
    setPage('dashboard')
    loadStaff()
  }

  const isPM = user?.role === 'pm' || user?.role === 'admin'
  const myLeads = isPM ? leads : leads.filter(l => l.assigned_to === user?.id)
  const unreadNotifs = notifications.filter(n => !n.is_read).length

  const filteredLeads = (isPM ? leads : myLeads).filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      return l.name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.email?.toLowerCase().includes(q)
    }
    return true
  })

  // ═══ ASSIGN LEAD ═══
  async function assignLead(leadId, marketerId) {
    const marketer = staff.find(s => s.id === marketerId)
    if (!marketer) return

    await sb.from('leads').update({
      assigned_to: marketerId,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)

    // Notify marketer
    const lead = leads.find(l => l.id === leadId)
    await sb.from('notifications').insert({
      staff_id: marketerId,
      title: 'New Lead Assigned',
      message: `${lead?.name || 'A lead'} has been assigned to you by ${user.name}`,
      type: 'assignment',
      lead_id: leadId,
    })

    // Log comment
    await sb.from('lead_comments').insert({
      lead_id: leadId,
      staff_id: user.id,
      staff_name: user.name,
      comment: `Lead assigned to ${marketer.name}`,
      status_change: 'assigned',
    })

    // Send SMS to lead (personalized with marketer name)
    if (lead?.phone) {
      const firstName = (lead.name || '').split(' ')[0]
      const smsMsg = `Hi ${firstName}, thank you for your interest in Cambridge Center of Excellence!\n\nWe offer world-class professional courses (Online & In-Person) with scholarship opportunities.\n\n${marketer.name} from our team will be reaching out to you shortly to discuss the best options for you.\n\nCambridge Center of Excellence\nwww.cce.edu.gh`
      await sendSMS(lead.phone, smsMsg)

      // Log SMS
      await sb.from('whatsapp_log').insert({
        lead_id: leadId,
        phone: lead.phone,
        message: smsMsg,
        marketer_name: marketer.name,
        status: 'sent',
      })

      // Update lead
      await sb.from('leads').update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() }).eq('id', leadId)
    }

    loadAll(user)
  }

  // ═══ UPDATE STATUS ═══
  async function updateStatus(leadId, newStatus, comment = '') {
    await sb.from('leads').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)

    if (comment) {
      await sb.from('lead_comments').insert({
        lead_id: leadId,
        staff_id: user.id,
        staff_name: user.name,
        comment,
        status_change: newStatus,
      })
    }

    loadAll(user)
  }

  // ═══ ADD LEAD MANUALLY ═══
  async function addLead(data) {
    await sb.from('leads').insert({
      ...data,
      source: data.source || 'manual',
      status: 'new',
    })

    // Notify PM
    const pms = staff.filter(s => s.role === 'pm' || s.role === 'admin')
    for (const pm of pms) {
      await sb.from('notifications').insert({
        staff_id: pm.id,
        title: 'New Lead',
        message: `${data.name} — ${data.source || 'manual'}`,
        type: 'new_lead',
      })
      // SMS to PM
      if (pm.phone) {
        await sendSMS(pm.phone, `New Lead! ${data.name} (${data.source || 'manual'})${data.phone ? ' — ' + data.phone : ''}. Login to CCE ERP to assign.`)
      }
    }

    loadAll(user)
  }

  async function markNotifRead(id) {
    await sb.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x))
  }

  // ═══ LOGIN SCREEN ═══
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-xs fade-in">
        <div className="text-center mb-6">
          <h1 className="text-xl font-extrabold text-slate-900">CCE ERP</h1>
          <p className="text-xs text-slate-400 mt-1">Cambridge Center of Excellence</p>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : staff.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">No staff found. Run the SQL schema first.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-3 text-center">Select your account</p>
            {staff.map(s => (
              <button key={s.id} onClick={() => login(s)}
                className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-400 transition press text-left">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">{s.name.charAt(0)}</div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                  <div className="text-[10px] text-slate-400 uppercase">{s.role}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>

  // ═══ MAIN APP ═══
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Nav */}
      <nav className="bg-white border-b border-slate-200 px-4">
        <div className="max-w-6xl mx-auto h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-extrabold text-slate-900">CCE ERP</h1>
            <span className="text-[10px] text-slate-400 hidden sm:block">Cambridge Center of Excellence</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button onClick={() => setShowNotifs(!showNotifs)} className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-50 transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
              {unreadNotifs > 0 && <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{unreadNotifs}</span>}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{user.name.charAt(0)}</div>
              <div className="hidden sm:block">
                <div className="text-xs font-semibold text-slate-900">{user.name}</div>
                <div className="text-[10px] text-slate-400 uppercase">{user.role}</div>
              </div>
            </div>
            <button onClick={logout} className="text-[10px] text-slate-400 hover:text-red-500 transition">Logout</button>
          </div>
        </div>
      </nav>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 overflow-x-auto">
        <div className="max-w-6xl mx-auto flex gap-1 -mb-px">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'leads', label: `Leads (${isPM ? leads.length : myLeads.length})` },
            ...(isPM ? [{ id: 'staff', label: 'Staff' }, { id: 'courses', label: 'Courses' }, { id: 'add', label: '+ Add Lead' }] : [{ id: 'add', label: '+ Add Lead' }]),
          ].map(t => (
            <button key={t.id} onClick={() => { setPage(t.id); setSelectedLead(null) }}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${page === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications dropdown */}
      {showNotifs && (
        <div className="fixed top-14 right-4 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-[60vh] overflow-y-auto fade-in">
          <div className="p-3 border-b border-slate-100 flex justify-between items-center">
            <span className="text-sm font-bold text-slate-900">Notifications</span>
            <button onClick={() => setShowNotifs(false)} className="text-xs text-slate-400">Close</button>
          </div>
          {notifications.length === 0 ? <p className="text-xs text-slate-300 text-center py-6">No notifications</p> : (
            notifications.map(n => (
              <div key={n.id} onClick={() => { markNotifRead(n.id); setShowNotifs(false) }}
                className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                <div className="text-xs font-semibold text-slate-800">{n.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{n.message}</div>
                <div className="text-[10px] text-slate-300 mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4">

        {/* ═══ DASHBOARD ═══ */}
        {page === 'dashboard' && (
          <div className="fade-in">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Welcome, {user.name}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Leads', value: isPM ? leads.length : myLeads.length, color: 'bg-blue-50 text-blue-700' },
                { label: 'New', value: (isPM ? leads : myLeads).filter(l => l.status === 'new').length, color: 'bg-cyan-50 text-cyan-700' },
                { label: 'Follow Up', value: (isPM ? leads : myLeads).filter(l => l.status === 'follow_up').length, color: 'bg-amber-50 text-amber-700' },
                { label: 'Registered', value: (isPM ? leads : myLeads).filter(l => l.status === 'registered').length, color: 'bg-green-50 text-green-700' },
                { label: 'Pending Reg.', value: (isPM ? leads : myLeads).filter(l => l.status === 'pending_registration').length, color: 'bg-orange-50 text-orange-700' },
                { label: 'Not Qualified', value: (isPM ? leads : myLeads).filter(l => l.status === 'not_qualified').length, color: 'bg-red-50 text-red-700' },
                { label: 'Inquiries', value: (isPM ? leads : myLeads).filter(l => l.status === 'inquiry').length, color: 'bg-gray-50 text-gray-600' },
                { label: 'Unassigned', value: leads.filter(l => !l.assigned_to).length, color: isPM ? 'bg-purple-50 text-purple-700' : 'bg-slate-50 text-slate-400' },
              ].map(c => (
                <div key={c.label} className={`${c.color} rounded-xl p-4`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{c.label}</div>
                  <div className="text-2xl font-bold mt-1">{c.value}</div>
                </div>
              ))}
            </div>

            {/* Recent leads */}
            <h3 className="text-sm font-bold text-slate-700 mb-2">Recent Leads</h3>
            <div className="space-y-2">
              {(isPM ? leads : myLeads).slice(0, 5).map(l => (
                <div key={l.id} onClick={() => { setSelectedLead(l); setPage('leads') }}
                  className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between cursor-pointer hover:border-slate-400 transition">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{l.name}</div>
                    <div className="text-[11px] text-slate-400">{l.phone} · {l.source} · {l.staff?.name || 'Unassigned'}</div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status] || 'bg-slate-100 text-slate-500'}`}>{STATUS_LABELS[l.status] || l.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ LEADS ═══ */}
        {page === 'leads' && !selectedLead && (
          <div className="fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Leads</h2>
            </div>

            {/* Search + Filters */}
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search name, phone, email..."
              className="w-full h-10 px-4 mb-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
              <button onClick={() => setStatusFilter('all')} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>All</button>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <button key={k} onClick={() => setStatusFilter(k)} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusFilter === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>{v}</button>
              ))}
            </div>

            {/* Lead list */}
            <div className="space-y-2">
              {filteredLeads.map(l => (
                <div key={l.id} onClick={() => setSelectedLead(l)}
                  className="bg-white rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-slate-400 transition">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{l.name}</div>
                      <div className="text-[11px] text-slate-400">{l.phone} {l.email && `· ${l.email}`}</div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[l.status]}`}>{STATUS_LABELS[l.status]}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{l.source}</span>
                    {l.course_interest && <span>{l.course_interest}</span>}
                    <span>{l.staff?.name || 'Unassigned'}</span>
                    <span className="ml-auto">{new Date(l.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {filteredLeads.length === 0 && <p className="text-sm text-slate-300 text-center py-10">No leads found.</p>}
            </div>
          </div>
        )}

        {/* ═══ LEAD DETAIL ═══ */}
        {page === 'leads' && selectedLead && <LeadDetail
          lead={selectedLead} staff={staff} courses={courses} user={user} isPM={isPM}
          onBack={() => setSelectedLead(null)}
          onAssign={(marketerId) => assignLead(selectedLead.id, marketerId)}
          onStatusChange={(status, comment) => updateStatus(selectedLead.id, status, comment)}
          onRefresh={() => loadAll(user)}
          sb={sb}
        />}

        {/* ═══ ADD LEAD ═══ */}
        {page === 'add' && <AddLeadForm courses={courses} onSubmit={addLead} onDone={() => setPage('leads')} />}

        {/* ═══ STAFF ═══ */}
        {page === 'staff' && isPM && <StaffManager staff={staff} sb={sb} onRefresh={() => loadAll(user)} />}

        {/* ═══ COURSES ═══ */}
        {page === 'courses' && isPM && <CourseManager courses={courses} sb={sb} onRefresh={() => loadAll(user)} />}
      </div>
    </div>
  )
}

// ═══ LEAD DETAIL ═══
function LeadDetail({ lead, staff, courses, user, isPM, onBack, onAssign, onStatusChange, onRefresh, sb }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [newStatus, setNewStatus] = useState(lead.status)

  useEffect(() => {
    sb.from('lead_comments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }).then(({ data }) => setComments(data || []))
  }, [lead.id])

  async function addComment() {
    if (!newComment.trim()) return
    const statusChanged = newStatus !== lead.status
    await onStatusChange(statusChanged ? newStatus : lead.status, newComment.trim())
    setNewComment('')
    const { data } = await sb.from('lead_comments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false })
    setComments(data || [])
    onRefresh()
  }

  const marketers = staff.filter(s => s.role === 'marketer')

  return (
    <div className="fade-in">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-700 mb-4">← Back to Leads</button>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Lead info */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{lead.name}</h2>
                <div className="text-sm text-slate-400 mt-0.5">{lead.phone} {lead.email && `· ${lead.email}`}</div>
              </div>
              <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[lead.status]}`}>{STATUS_LABELS[lead.status]}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400 text-xs">Source</span><div className="font-medium text-slate-700">{lead.source} {lead.source_campaign && `· ${lead.source_campaign}`}</div></div>
              <div><span className="text-slate-400 text-xs">Course Interest</span><div className="font-medium text-slate-700">{lead.course_interest || '—'}</div></div>
              <div><span className="text-slate-400 text-xs">Mode</span><div className="font-medium text-slate-700">{lead.mode_preference || '—'}</div></div>
              <div><span className="text-slate-400 text-xs">Scholarship</span><div className="font-medium text-slate-700">{lead.scholarship_interest ? 'Yes' : 'No'}</div></div>
              <div><span className="text-slate-400 text-xs">Assigned To</span><div className="font-medium text-slate-700">{lead.staff?.name || 'Unassigned'}</div></div>
              <div><span className="text-slate-400 text-xs">Created</span><div className="font-medium text-slate-700">{new Date(lead.created_at).toLocaleString()}</div></div>
            </div>
            {lead.notes && <div className="mt-3 text-sm text-slate-500 bg-slate-50 rounded-lg p-3">{lead.notes}</div>}
          </div>

          {/* Comments */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Activity & Comments</h3>

            {/* Add comment */}
            <div className="mb-4">
              <div className="flex gap-2 mb-2">
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="h-9 px-3 border border-slate-200 rounded-lg text-xs">
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {newStatus !== lead.status && <span className="text-[10px] text-amber-600 font-medium self-center">Status will change</span>}
              </div>
              <div className="flex gap-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
                  placeholder="Add a comment..." className="flex-1 h-10 px-4 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                <button onClick={addComment} className="h-10 px-4 bg-blue-600 text-white rounded-lg text-xs font-semibold press">Post</button>
              </div>
            </div>

            {/* Comment list */}
            <div className="space-y-3">
              {comments.map(c => (
                <div key={c.id} className="border-l-2 border-slate-200 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{c.staff_name}</span>
                    {c.status_change && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[c.status_change]}`}>{STATUS_LABELS[c.status_change]}</span>}
                    <span className="text-[10px] text-slate-300 ml-auto">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">{c.comment}</p>
                </div>
              ))}
              {comments.length === 0 && <p className="text-xs text-slate-300 text-center py-4">No comments yet.</p>}
            </div>
          </div>
        </div>

        {/* Sidebar — Assign */}
        <div>
          {isPM && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Assign to Marketer</h3>
              <div className="space-y-1.5">
                {marketers.map(m => (
                  <button key={m.id} onClick={() => onAssign(m.id)}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-left text-sm transition press ${lead.assigned_to === m.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                    <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600">{m.name.charAt(0)}</div>
                    <span className="font-medium text-slate-700">{m.name}</span>
                    {lead.assigned_to === m.id && <span className="text-[10px] text-blue-600 font-semibold ml-auto">Current</span>}
                  </button>
                ))}
                {marketers.length === 0 && <p className="text-xs text-slate-300 text-center py-4">No marketers. Add staff first.</p>}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Actions</h3>
            <div className="space-y-1.5">
              {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700">📞 Call {lead.phone}</a>}
              {lead.phone && <a href={`https://wa.me/${lead.phone.replace(/\s/g, '').replace(/^0/, '233')}`} target="_blank" className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700">💬 WhatsApp</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700">📧 Email</a>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══ ADD LEAD FORM ═══
function AddLeadForm({ courses, onSubmit, onDone }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: 'manual', course_interest: '', mode_preference: '', scholarship_interest: false, notes: '' })
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!form.name.trim()) return
    setSaving(true)
    await onSubmit(form)
    setSaving(false)
    setForm({ name: '', phone: '', email: '', source: 'manual', course_interest: '', mode_preference: '', scholarship_interest: false, notes: '' })
    onDone()
  }

  return (
    <div className="max-w-lg fade-in">
      <h2 className="text-lg font-bold text-slate-900 mb-4">Add New Lead</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name *" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
        <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" type="tel" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
        <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm">
          {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={form.course_interest} onChange={e => setForm({ ...form, course_interest: e.target.value })} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm">
          <option value="">Course interest (optional)</option>
          {courses.map(c => <option key={c.id} value={c.name}>{c.name} ({c.mode})</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <select value={form.mode_preference} onChange={e => setForm({ ...form, mode_preference: e.target.value })} className="h-10 px-3 border border-slate-200 rounded-lg text-sm">
            <option value="">Mode</option>
            <option value="in-person">In-Person</option>
            <option value="online">Online</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.scholarship_interest} onChange={e => setForm({ ...form, scholarship_interest: e.target.checked })} /> Scholarship
          </label>
        </div>
        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="w-full h-16 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
        <button onClick={submit} disabled={!form.name.trim() || saving} className="w-full h-10 bg-blue-600 text-white rounded-lg text-sm font-semibold press disabled:opacity-50">{saving ? 'Saving...' : 'Add Lead'}</button>
      </div>
    </div>
  )
}

// ═══ STAFF MANAGER ═══
function StaffManager({ staff, sb, onRefresh }) {
  const [editing, setEditing] = useState(null)
  async function save() {
    if (!editing) return
    const { id, created_at, ...data } = editing
    if (id) await sb.from('staff').update(data).eq('id', id)
    else await sb.from('staff').insert(data)
    setEditing(null); onRefresh()
  }
  async function del(id) { if (confirm('Delete this staff?')) { await sb.from('staff').delete().eq('id', id); onRefresh() } }

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Staff</h2>
        <button onClick={() => setEditing({ name: '', email: '', phone: '', role: 'marketer', is_active: true })} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-xs font-semibold">+ Add Staff</button>
      </div>
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-slate-900 mb-4">{editing.id ? 'Edit' : 'New'} Staff</h3>
            <div className="space-y-3">
              <input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Name" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
              <input value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} placeholder="Email" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
              <input value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} placeholder="Phone" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
              <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm">
                <option value="marketer">Marketer</option>
                <option value="pm">Project Manager</option>
                <option value="admin">Admin</option>
                <option value="finance">Finance</option>
                <option value="admission">Admission</option>
                <option value="receptionist">Receptionist</option>
              </select>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={save} className="flex-1 h-10 bg-blue-600 text-white rounded-lg text-sm font-semibold">Save</button>
              <button onClick={() => setEditing(null)} className="flex-1 h-10 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {staff.map(s => (
          <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-sm font-bold text-slate-600">{s.name.charAt(0)}</div>
              <div><div className="text-sm font-semibold text-slate-900">{s.name}</div><div className="text-[10px] text-slate-400 uppercase">{s.role} · {s.email || s.phone || ''}</div></div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditing(s)} className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded font-semibold">Edit</button>
              <button onClick={() => del(s.id)} className="text-[10px] px-2 py-1 bg-red-50 text-red-600 rounded font-semibold">Del</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══ COURSE MANAGER ═══
function CourseManager({ courses, sb, onRefresh }) {
  const [editing, setEditing] = useState(null)
  async function save() {
    if (!editing) return
    const { id, created_at, ...data } = editing
    if (id) await sb.from('courses').update(data).eq('id', id)
    else await sb.from('courses').insert(data)
    setEditing(null); onRefresh()
  }
  async function del(id) { if (confirm('Delete?')) { await sb.from('courses').delete().eq('id', id); onRefresh() } }

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Courses</h2>
        <button onClick={() => setEditing({ name: '', description: '', mode: 'in-person', duration: '', fee: 0, scholarship_available: false, is_active: true })} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-xs font-semibold">+ Add Course</button>
      </div>
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-slate-900 mb-4">{editing.id ? 'Edit' : 'New'} Course</h3>
            <div className="space-y-3">
              <input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Course name" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
              <textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="Description" className="w-full h-16 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
              <select value={editing.mode} onChange={e => setEditing({ ...editing, mode: e.target.value })} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm">
                <option value="in-person">In-Person</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <input value={editing.duration || ''} onChange={e => setEditing({ ...editing, duration: e.target.value })} placeholder="Duration (e.g. 6 months)" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
              <input type="number" value={editing.fee || ''} onChange={e => setEditing({ ...editing, fee: Number(e.target.value) })} placeholder="Fee (GHS)" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.scholarship_available} onChange={e => setEditing({ ...editing, scholarship_available: e.target.checked })} /> Scholarship Available</label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={save} className="flex-1 h-10 bg-blue-600 text-white rounded-lg text-sm font-semibold">Save</button>
              <button onClick={() => setEditing(null)} className="flex-1 h-10 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {courses.map(c => (
          <div key={c.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{c.name}</div>
              <div className="text-[10px] text-slate-400">{c.mode} · {c.duration} · GH₵ {Number(c.fee).toFixed(2)} {c.scholarship_available && '· 🎓 Scholarship'}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditing(c)} className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded font-semibold">Edit</button>
              <button onClick={() => del(c.id)} className="text-[10px] px-2 py-1 bg-red-50 text-red-600 rounded font-semibold">Del</button>
            </div>
          </div>
        ))}
        {courses.length === 0 && <p className="text-sm text-slate-300 text-center py-8">No courses. Add one above.</p>}
      </div>
    </div>
  )
}
