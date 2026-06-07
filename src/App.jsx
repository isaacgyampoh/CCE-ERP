import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON, STATUS, SOURCES, ROLES, WA_ASSIGN_MSG, WA_REG_MSG } from '@/lib/constants'
import { formatPhone, timeAgo, fmtCurrency, fmtDate, marketerRegLink, sendSMS } from '@/lib/helpers'
import { Avatar, Badge, Modal, StatCard, EmptyState, Spinner, Label, ProgressBar, Icon } from '@/components/ui'
import Analytics from '@/pages/Analytics'
import Finance from '@/pages/Finance'
import Admission from '@/pages/Admission'
import RegisterPage from '@/pages/RegisterPage'
import CohortManager from '@/pages/CohortManager'
import InstructorDashboard from '@/pages/InstructorDashboard'
import AttendPage from '@/pages/AttendPage'

const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

// ─── Router ────────────────────────────────────────────────────────────────────
const path = window.location.pathname
const isRegisterRoute = path === '/register' || new URLSearchParams(window.location.search).get('m')
const isAttendRoute   = path === '/attend'   || new URLSearchParams(window.location.search).get('s')

// ─── App Entry ────────────────────────────────────────────────────────────────
export default function App() {
  if (isRegisterRoute) return <RegisterPage />
  if (isAttendRoute)   return <AttendPage />
  return <ERP />
}

// ─── Main ERP ─────────────────────────────────────────────────────────────────
function ERP() {
  const [user, setUser] = useState(null)
  const [staff, setStaff] = useState([])
  const [page, setPage] = useState('dashboard')
  const [leads, setLeads] = useState([])
  const [courses, setCourses] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showNotifs, setShowNotifs] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('cce_user')
    if (saved) { const u = JSON.parse(saved); setUser(u); loadAll(u) }
    else loadStaff()
  }, [])

  const loadStaff = async () => {
    const { data } = await sb.from('staff').select('*').eq('is_active', true).order('name')
    setStaff(data || [])
    setLoading(false)
  }

  const loadAll = async (u) => {
    setLoading(true)
    const [{ data: l }, { data: s }, { data: c }, { data: n }] = await Promise.all([
      sb.from('leads').select('*, assignee:assigned_to(id,name,role,phone)').order('created_at', { ascending: false }),
      sb.from('staff').select('*').eq('is_active', true).order('name'),
      sb.from('courses').select('*').order('name'),
      sb.from('notifications').select('*').eq('staff_id', u.id).order('created_at', { ascending: false }).limit(40),
    ])
    setLeads(l || [])
    setStaff(s || [])
    setCourses(c || [])
    setNotifications(n || [])
    setLoading(false)
  }

  const login = (s) => { setUser(s); sessionStorage.setItem('cce_user', JSON.stringify(s)); loadAll(s) }
  const logout = () => { setUser(null); sessionStorage.removeItem('cce_user'); setPage('dashboard'); setSelectedLead(null); loadStaff() }

  const isPM = user?.role === 'pm' || user?.role === 'admin'
  const isFinance = user?.role === 'finance'
  const isAdmission = user?.role === 'admission'
  const isMarketer = user?.role === 'marketer'
  const myLeads = isPM ? leads : leads.filter(l => l.assigned_to === user?.id)
  const unread = notifications.filter(n => !n.is_read).length

  // ── Actions ─────────────────────────────────────────────────────────────
  const assignLead = async (leadId, marketerId) => {
    const marketer = staff.find(s => s.id === marketerId)
    const lead = leads.find(l => l.id === leadId)
    if (!marketer || !lead) return

    await sb.from('leads').update({ assigned_to: marketerId, assigned_at: new Date().toISOString(), status: 'assigned', updated_at: new Date().toISOString() }).eq('id', leadId)
    await sb.from('notifications').insert({ staff_id: marketerId, title: 'New Lead Assigned', message: `${lead.name} assigned to you by ${user.name}`, type: 'assignment', lead_id: leadId })
    await sb.from('lead_comments').insert({ lead_id: leadId, staff_id: user.id, staff_name: user.name, comment: `Assigned to ${marketer.name}`, status_change: 'assigned' })

    const phone = formatPhone(lead.phone)
    if (phone) {
      // Auto-send SMS via Arkesel
      const smsMsg = `Hello ${lead.name.split(' ')[0]}! Thank you for your interest in Cambridge Center of Excellence.\n\n${marketer.name} from our admissions team will be reaching out to you shortly to guide you through your enrollment journey.\n\nWe offer world-class professional courses (Online & In-Person) with scholarship opportunities.\n\nCambridge Center of Excellence`
      await sendSMS(phone, smsMsg)

      // Also open WhatsApp for detailed message
      const msg = WA_ASSIGN_MSG(lead.name, marketer.name)
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
      await sb.from('whatsapp_log').insert({ lead_id: leadId, phone: lead.phone, message: smsMsg, marketer_name: marketer.name, status: 'sent' })
      await sb.from('leads').update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() }).eq('id', leadId)
    }
    await loadAll(user)
  }

  const sendRegLink = async (lead) => {
    if (!lead.assigned_to) return alert('Assign the lead to a marketer first.')
    const link = marketerRegLink(lead.assigned_to, lead.id)
    const marketer = staff.find(s => s.id === lead.assigned_to)
    const phone = formatPhone(lead.phone)
    const msg = WA_REG_MSG(lead.name, link, marketer?.name || 'CCE')
    if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
    // Update status to pending
    await sb.from('leads').update({ status: 'pending_registration', updated_at: new Date().toISOString() }).eq('id', lead.id)
    await sb.from('lead_comments').insert({ lead_id: lead.id, staff_id: user.id, staff_name: user.name, comment: `Registration link sent via WhatsApp: ${link}`, status_change: 'pending_registration' })
    await loadAll(user)
  }

  const updateStatus = async (leadId, newStatus, comment = '') => {
    await sb.from('leads').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', leadId)
    if (comment) await sb.from('lead_comments').insert({ lead_id: leadId, staff_id: user.id, staff_name: user.name, comment, status_change: newStatus })
    await loadAll(user)
  }

  const addLead = async (data) => {
    const { data: inserted } = await sb.from('leads').insert({ ...data, status: 'new' }).select().single()
    const pms = staff.filter(s => s.role === 'pm' || s.role === 'admin')
    for (const pm of pms) {
      await sb.from('notifications').insert({ staff_id: pm.id, title: 'New Lead', message: `${data.name} via ${data.source}`, type: 'new_lead', lead_id: inserted?.id })
      if (pm.phone) await sendSMS(pm.phone, `New Lead! ${data.name} (${data.source})${data.phone ? ' — ' + data.phone : ''}. Login to assign.`)
    }
    await loadAll(user)
  }

  const addPersonalLead = async (data) => {
    const { data: inserted } = await sb.from('leads').insert({
      ...data, source: 'personal', status: 'assigned',
      assigned_to: user.id, assigned_at: new Date().toISOString(),
    }).select().single()
    await sb.from('lead_comments').insert({ lead_id: inserted?.id, staff_id: user.id, staff_name: user.name, comment: 'Personal lead added by marketer.', status_change: 'assigned' })
    const pms = staff.filter(s => s.role === 'pm' || s.role === 'admin')
    for (const pm of pms) await sb.from('notifications').insert({ staff_id: pm.id, title: 'New Personal Lead', message: `${user.name} added a personal lead: ${data.name}`, type: 'new_lead', lead_id: inserted?.id })
    await loadAll(user)
  }

  const markNotifRead = async (id) => {
    await sb.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x))
  }
  const markAllRead = async () => {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    await sb.from('notifications').update({ is_read: true }).in('id', ids)
    setNotifications(n => n.map(x => ({ ...x, is_read: true })))
  }

  const nav = (p, lead = null) => { setPage(p); setSelectedLead(lead); setSidebarOpen(false); window.scrollTo(0, 0) }

  // ── Login ──────────────────────────────────────────────────────────────
  if (!user) return (
    <div className="min-h-screen flex bg-slate-50">
      <div className="hidden md:flex flex-col justify-center w-96 bg-gradient-to-b from-blue-700 to-indigo-900 p-10 text-white flex-shrink-0">
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl font-black mb-6">C</div>
        <h1 className="text-3xl font-black leading-tight">Cambridge Center<br/>of Excellence</h1>
        <p className="text-blue-200 text-sm mt-3 leading-relaxed">Integrated CRM, Lead Pipeline, Payments & Admissions Management.</p>
        <div className="mt-8 space-y-2.5 text-sm text-blue-200">
          {['Role-based dashboards','Lead assignment & tracking','Unique marketer registration links','Paystack payment integration','Conversion rate analytics','Finance & Admission portals'].map(f => (
            <div key={f} className="flex items-center gap-2">
              <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-[9px]">✓</div>{f}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm fade-up">
          <div className="mb-8 md:hidden">
            <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center text-xl font-black text-white mb-3">C</div>
            <h1 className="text-2xl font-black text-slate-900">CCE ERP</h1>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-6">Select your account to continue</p>
          {loading ? <Spinner size={24}/> : staff.length === 0 ? (
            <div className="card p-6 text-center"><p className="text-sm text-slate-400">No staff found. Run the SQL schema first.</p></div>
          ) : (
            <div className="space-y-2">
              {staff.map(s => (
                <button key={s.id} onClick={() => login(s)}
                  className="w-full flex items-center gap-3 p-3.5 card hover:border-blue-300 hover:shadow-sm transition press text-left group">
                  <Avatar name={s.name} size={38}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{s.role}</div>
                  </div>
                  <svg className="opacity-0 group-hover:opacity-100 transition text-blue-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ── Nav Items per role ──────────────────────────────────────────────────
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icon.dashboard, roles: 'all' },
    { id: 'leads', label: 'Leads', count: myLeads.length, icon: Icon.leads, roles: 'all' },
    { id: 'add', label: 'Add Lead', icon: Icon.add, roles: ['pm','admin','marketer','receptionist'] },
    { id: 'my_leads', label: 'My Leads', icon: Icon.target, roles: ['marketer'] },
    { id: 'analytics', label: 'Analytics', icon: Icon.analytics, roles: 'all' },
    { id: 'finance', label: 'Finance', icon: Icon.finance, roles: ['pm','admin','finance'] },
    { id: 'admission', label: 'Admissions', icon: Icon.admission, roles: ['pm','admin','admission'] },
    { id: 'classes', label: 'Classes', icon: Icon.courses, roles: ['pm','admin'] },
    { id: 'instructor', label: 'My Classes', icon: Icon.courses, roles: ['instructor'] },
    { id: 'staff', label: 'Staff', icon: Icon.staff, roles: ['pm','admin'] },
    { id: 'courses', label: 'Courses', icon: Icon.courses, roles: ['pm','admin'] },
    { id: 'integrations', label: 'Integrations', icon: Icon.integrations, roles: ['pm','admin'] },
  ].filter(item => item.roles === 'all' || item.roles.includes(user?.role))

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-[220px] bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="h-14 flex items-center px-4 border-b border-slate-100">
          <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center text-white text-xs font-black mr-2.5">C</div>
          <div><div className="text-xs font-bold text-slate-900">CCE ERP</div><div className="text-[9px] text-slate-400">Cambridge Centre</div></div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => nav(item.id)}
              className={`nav-item w-full ${page === item.id && !selectedLead ? 'active' : ''}`}>
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.count != null && <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{item.count}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-2.5 p-2 rounded-lg">
            <Avatar name={user.name} size={30}/>
            <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-slate-900 truncate">{user.name}</div><div className="text-[10px] text-slate-400 uppercase">{user.role}</div></div>
            <button onClick={logout} title="Logout" className="text-slate-300 hover:text-red-500 transition p-1 press">{Icon.logout}</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 md:ml-[220px] flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 sticky top-0 z-30">
          <button className="md:hidden p-2 -ml-1" onClick={() => setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="flex-1 text-sm font-semibold text-slate-800">
            {selectedLead ? (
              <span className="flex items-center gap-1.5">
                <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-slate-700 transition">{Icon.back}</button>
                <span className="text-slate-300">/</span>
                <span className="truncate">{selectedLead.name}</span>
              </span>
            ) : navItems.find(n => n.id === page)?.label || 'Dashboard'}
          </div>
          <div className="relative">
            <button onClick={() => setShowNotifs(!showNotifs)}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 transition text-slate-500">
              {Icon.bell}
              {unread > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unread}</span>}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-11 w-80 card shadow-xl z-50 fade-up overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Notifications {unread > 0 && <span className="text-blue-600">({unread})</span>}</span>
                  <div className="flex gap-2">
                    {unread > 0 && <button onClick={markAllRead} className="text-[10px] text-blue-600 font-medium">Mark all read</button>}
                    <button onClick={() => setShowNotifs(false)} className="text-slate-300 hover:text-slate-600">{Icon.x}</button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? <div className="py-8 text-center text-xs text-slate-300">No notifications</div> :
                    notifications.map(n => (
                      <div key={n.id} onClick={() => { markNotifRead(n.id); setShowNotifs(false); if (n.lead_id) { const l = leads.find(x => x.id === n.lead_id); if (l) nav('leads', l) } }}
                        className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${!n.is_read ? 'bg-blue-50/40' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.is_read && <div className="live-dot mt-1.5 shrink-0"/>}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-800">{n.title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{n.message}</div>
                            <div className="text-[10px] text-slate-300 mt-1">{timeAgo(n.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 p-4 md:p-6">
          {loading ? <Spinner size={24}/> : (
            <>
              {page === 'dashboard'    && <Dashboard user={user} isPM={isPM} isMarketer={isMarketer} leads={leads} myLeads={myLeads} staff={staff} nav={nav}/>}
              {page === 'leads'        && !selectedLead && <LeadList leads={myLeads} isPM={isPM} staff={staff} onSelect={l => { setSelectedLead(l) }}/>}
              {page === 'leads'        && selectedLead && <LeadDetail lead={selectedLead} staff={staff} user={user} isPM={isPM} isMarketer={isMarketer} sb={sb} onAssign={assignLead} onStatusChange={updateStatus} onRegLink={sendRegLink} onRefresh={() => loadAll(user)}/>}
              {page === 'my_leads'     && <MyLeads leads={myLeads} user={user} staff={staff} onSelect={l => { setSelectedLead(l); setPage('leads') }} onAddPersonal={() => nav('add_personal')} nav={nav}/>}
              {page === 'add'          && <AddLead courses={courses} onSubmit={addLead} onDone={() => nav('leads')} isPM={isPM}/>}
              {page === 'add_personal' && <AddLead courses={courses} onSubmit={addPersonalLead} onDone={() => nav('my_leads')} personal/>}
              {page === 'analytics'    && <Analytics leads={leads} staff={staff} user={user} isPM={isPM}/>}
              {page === 'finance'      && <Finance sb={sb} staff={staff} leads={leads} user={user}/>}
              {page === 'admission'    && <Admission sb={sb} staff={staff} leads={leads} user={user}/>}
              {page === 'staff'        && isPM && <StaffManager staff={staff} sb={sb} onRefresh={() => loadAll(user)}/>}
              {page === 'courses'      && isPM && <CourseManager courses={courses} sb={sb} onRefresh={() => loadAll(user)}/>}
              {page === 'integrations' && isPM && <Integrations sb={sb}/>}
              {page === 'classes'      && isPM && <CohortManager sb={sb} staff={staff} courses={courses} user={user}/>}
              {page === 'instructor'  && user?.role === 'instructor' && <InstructorDashboard sb={sb} user={user}/>}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ user, isPM, isMarketer, leads, myLeads, staff, nav }) {
  const data = isPM ? leads : myLeads
  const now = new Date()
  const thisMonth = data.filter(l => {
    const d = new Date(l.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const registered = data.filter(l => l.status === 'registered')
  const convRate = data.length ? Math.round((registered.length / data.length) * 100) : 0

  const stats = [
    { label: 'Total Leads', value: data.length, icon: '👥', sub: `${thisMonth.length} this month` },
    { label: 'Registered', value: registered.length, icon: '🎓', color: 'text-emerald-600', sub: `${convRate}% conversion` },
    { label: 'Follow Up', value: data.filter(l => l.status === 'follow_up').length, icon: '📞', color: 'text-amber-600' },
    { label: 'Pending Reg.', value: data.filter(l => l.status === 'pending_registration').length, icon: '⏳', color: 'text-orange-600' },
    ...(isPM ? [
      { label: 'Unassigned', value: leads.filter(l => !l.assigned_to).length, icon: '⚠️', color: 'text-red-500' },
      { label: 'Not Qualified', value: data.filter(l => l.status === 'not_qualified').length, icon: '✗', color: 'text-red-500' },
    ] : [
      { label: 'My Conversion', value: `${convRate}%`, icon: '🎯', color: convRate >= 30 ? 'text-emerald-600' : 'text-amber-600' },
      { label: 'Personal Leads', value: myLeads.filter(l => l.source === 'personal').length, icon: '💼', color: 'text-violet-600' },
    ]),
  ]

  const marketers = isPM ? staff.filter(s => s.role === 'marketer').map(m => ({
    ...m,
    total: leads.filter(l => l.assigned_to === m.id).length,
    registered: leads.filter(l => l.assigned_to === m.id && l.status === 'registered').length,
  })).sort((a, b) => b.registered - a.registered) : []

  const sources = SOURCES.map(s => ({ label: s, value: data.filter(l => l.source === s).length })).filter(s => s.value > 0)

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-slate-400 mt-0.5">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => <StatCard key={s.label} {...s}/>)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Leads</h2>
            <button onClick={() => nav('leads')} className="text-xs text-blue-600 font-medium">View all →</button>
          </div>
          <div className="divide-y divide-slate-50">
            {(isPM ? leads : myLeads).slice(0, 8).map(l => (
              <div key={l.id} onClick={() => nav('leads', l)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition">
                <Avatar name={l.name} size={32}/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{l.name}</div>
                  <div className="text-[11px] text-slate-400">{l.phone} · {l.assignee?.name || 'Unassigned'}</div>
                </div>
                <div className="text-right shrink-0"><Badge status={l.status}/><div className="text-[10px] text-slate-300 mt-1">{timeAgo(l.created_at)}</div></div>
              </div>
            ))}
            {(isPM ? leads : myLeads).length === 0 && <EmptyState title="No leads yet" icon="📋" action={<button onClick={() => nav('add')} className="btn btn-primary btn-sm">Add Lead</button>}/>}
          </div>
        </div>
        <div className="space-y-4">
          {sources.length > 0 && (
            <div className="card p-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Lead Sources</h2>
              <div className="space-y-2">
                {sources.map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="text-[11px] text-slate-500 w-16 capitalize">{s.label}</div>
                    <ProgressBar value={s.value} max={data.length}/>
                    <div className="text-[11px] font-bold text-slate-700 w-5 text-right">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isPM && marketers.length > 0 && (
            <div className="card p-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Marketer Leaderboard</h2>
              <div className="space-y-2.5">
                {marketers.slice(0, 5).map((m, i) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <div className="text-[10px] text-slate-300 w-3 font-bold">{i+1}</div>
                    <Avatar name={m.name} size={26}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-700 truncate">{m.name}</div>
                      <div className="text-[10px] text-slate-400">{m.total} leads</div>
                    </div>
                    <div className="text-xs font-bold text-emerald-600">{m.registered} 🎓</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isPM && leads.filter(l => !l.assigned_to).length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="text-xs font-bold text-amber-800 mb-1">⚠️ Unassigned Leads</div>
              <div className="text-xl font-bold text-amber-900">{leads.filter(l => !l.assigned_to).length}</div>
              <div className="text-[11px] text-amber-600 mb-2">leads need assignment</div>
              <button onClick={() => nav('leads')} className="text-[11px] font-semibold text-amber-800 underline">Assign now →</button>
            </div>
          )}
          {isMarketer && (
            <div className="card p-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">My Pipeline</h2>
              <div className="space-y-2">
                {['assigned','contacted','follow_up','pending_registration','registered'].map(s => {
                  const count = myLeads.filter(l => l.status === s).length
                  if (!count) return null
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <Badge status={s} className="w-28 justify-center shrink-0"/>
                      <ProgressBar value={count} max={myLeads.length}/>
                      <span className="text-xs font-bold text-slate-700 w-4 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Lead List ─────────────────────────────────────────────────────────────────
function LeadList({ leads, isPM, staff, onSelect }) {
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [sourceF, setSourceF] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')

  const filtered = leads.filter(l => {
    if (statusF !== 'all' && l.status !== statusF) return false
    if (sourceF !== 'all' && l.source !== sourceF) return false
    if (search) {
      const q = search.toLowerCase()
      return l.name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.email?.toLowerCase().includes(q) || l.course_interest?.toLowerCase().includes(q)
    }
    return true
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'status') return a.status.localeCompare(b.status)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <div className="fade-up space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, course…" className="inp pl-9 h-9 text-xs"/>
        </div>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className="inp h-9 text-xs w-auto">
          <option value="all">All Statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={sourceF} onChange={e => setSourceF(e.target.value)} className="inp h-9 text-xs w-auto">
          <option value="all">All Sources</option>
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="inp h-9 text-xs w-auto">
          <option value="created_at">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="status">By Status</option>
        </select>
      </div>
      <div className="text-xs text-slate-400">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</div>
      <div className="card overflow-hidden">
        {filtered.length === 0 ? <EmptyState icon="📋" title="No leads match your filters"/> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th className="hidden sm:table-cell">Phone</th><th>Status</th><th className="hidden md:table-cell">Source</th><th className="hidden lg:table-cell">Course</th><th className="hidden md:table-cell">Marketer</th><th className="hidden lg:table-cell">Date</th></tr></thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} onClick={() => onSelect(l)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={l.name} size={30}/>
                      <div>
                        <div className="font-medium text-slate-900">{l.name}</div>
                        <div className="flex gap-1 mt-0.5">
                          {l.whatsapp_sent && <span className="text-[9px] text-emerald-500 font-semibold">WA ✓</span>}
                          {l.source === 'personal' && <span className="text-[9px] text-violet-500 font-semibold">Personal</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell text-slate-500 text-xs">{l.phone}</td>
                  <td><Badge status={l.status}/></td>
                  <td className="hidden md:table-cell"><span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded capitalize">{l.source}</span></td>
                  <td className="hidden lg:table-cell text-slate-500 text-xs max-w-[140px] truncate">{l.course_interest || '—'}</td>
                  <td className="hidden md:table-cell">
                    {l.assignee ? <div className="flex items-center gap-1.5"><Avatar name={l.assignee.name} size={22}/><span className="text-xs text-slate-600">{l.assignee.name}</span></div> : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="hidden lg:table-cell text-slate-400 text-xs">{timeAgo(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── My Leads (Marketer personal view) ────────────────────────────────────────
function MyLeads({ leads, user, staff, onSelect, nav }) {
  const now = new Date()
  const registered = leads.filter(l => l.status === 'registered')
  const thisMonth = leads.filter(l => {
    const d = new Date(l.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const convRate = leads.length ? Math.round((registered.length / leads.length) * 100) : 0
  const monthConv = thisMonth.length ? Math.round((thisMonth.filter(l => l.status === 'registered').length / thisMonth.length) * 100) : 0
  const personalLeads = leads.filter(l => l.source === 'personal')

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Leads</h1>
          <p className="text-sm text-slate-400 mt-0.5">Your assigned & personal leads + conversion stats</p>
        </div>
        <button onClick={() => nav('add_personal')} className="btn btn-primary">+ Personal Lead</button>
      </div>

      {/* My conversion stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card"><div className="stat-value">{leads.length}</div><div className="stat-label">Total Assigned</div></div>
        <div className="stat-card"><div className={`stat-value ${convRate >= 30 ? 'text-emerald-600' : convRate >= 15 ? 'text-amber-600' : 'text-red-500'}`}>{convRate}%</div><div className="stat-label">Overall Conversion</div></div>
        <div className="stat-card"><div className="stat-value text-blue-600">{monthConv}%</div><div className="stat-label">This Month's Rate</div></div>
        <div className="stat-card"><div className="stat-value text-violet-600">{personalLeads.length}</div><div className="stat-label">Personal Leads</div></div>
      </div>

      {/* Registered leads = paid — their commission evidence */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Registered (Paid) — {registered.length}</h2>
            <p className="text-xs text-slate-400 mt-0.5">These leads have paid registration fees</p>
          </div>
        </div>
        {registered.length === 0 ? (
          <EmptyState icon="🎓" title="No registrations yet" sub="Keep pushing — you're doing great!"/>
        ) : (
          <table className="data-table">
            <thead><tr><th>Student</th><th>Course</th><th className="hidden sm:table-cell">Reg Fee</th><th className="hidden md:table-cell">Date</th><th>Source</th></tr></thead>
            <tbody>
              {registered.map(l => (
                <tr key={l.id} onClick={() => onSelect(l)}>
                  <td><div className="flex items-center gap-2.5"><Avatar name={l.name} size={30}/><div><div className="font-medium text-slate-900">{l.name}</div><div className="text-[10px] text-slate-400">{l.phone}</div></div></div></td>
                  <td className="text-xs text-slate-600 max-w-[120px] truncate">{l.course_interest || '—'}</td>
                  <td className="hidden sm:table-cell font-semibold text-emerald-600 text-sm">{l.reg_fee_paid ? fmtCurrency(l.reg_fee_paid) : '—'}</td>
                  <td className="hidden md:table-cell text-xs text-slate-400">{fmtDate(l.reg_paid_at || l.updated_at)}</td>
                  <td><span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded capitalize">{l.source}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Personal leads section */}
      {personalLeads.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">My Personal Leads — {personalLeads.length}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Leads you sourced yourself</p>
          </div>
          <div className="divide-y divide-slate-50">
            {personalLeads.map(l => (
              <div key={l.id} onClick={() => onSelect(l)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition">
                <Avatar name={l.name} size={30}/>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-900">{l.name}</div><div className="text-[11px] text-slate-400">{l.phone} · {l.course_interest || '—'}</div></div>
                <Badge status={l.status}/>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Lead Detail ───────────────────────────────────────────────────────────────
function LeadDetail({ lead, staff, user, isPM, isMarketer, sb, onAssign, onStatusChange, onRegLink, onRefresh }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [newStatus, setNewStatus] = useState(lead.status)
  const [posting, setPosting] = useState(false)
  const [assigning, setAssigning] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({ name: lead.name, phone: lead.phone, email: lead.email, notes: lead.notes, city: lead.city })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    sb.from('lead_comments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: true })
      .then(({ data }) => setComments(data || []))
  }, [lead.id])

  const addComment = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    const statusChanged = newStatus !== lead.status
    await onStatusChange(lead.id, statusChanged ? newStatus : lead.status, newComment.trim())
    setNewComment('')
    const { data } = await sb.from('lead_comments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: true })
    setComments(data || [])
    await onRefresh()
    setPosting(false)
  }

  const handleAssign = async (mid) => { setAssigning(mid); await onAssign(lead.id, mid); setAssigning(null) }

  const saveEdit = async () => {
    await sb.from('leads').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', lead.id)
    await onRefresh(); setEditMode(false)
  }

  const copyRegLink = () => {
    const link = marketerRegLink(lead.assigned_to, lead.id)
    navigator.clipboard.writeText(link)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const marketers = staff.filter(s => s.role === 'marketer')
  const phone = formatPhone(lead.phone)
  const regLink = lead.assigned_to ? marketerRegLink(lead.assigned_to, lead.id) : null

  return (
    <div className="fade-up">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Avatar name={lead.name} size={44}/>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{lead.name}</h2>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge status={lead.status}/>
                    {lead.whatsapp_sent && <span className="badge bg-green-50 text-green-600">WA Sent</span>}
                    {lead.scholarship_interest && <span className="badge bg-purple-50 text-purple-600">Scholarship</span>}
                    {lead.source === 'personal' && <span className="badge bg-violet-50 text-violet-600">Personal Lead</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => setEditMode(!editMode)} className="btn btn-ghost btn-sm">{Icon.edit} Edit</button>
            </div>
            {editMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Full Name</Label><input value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="inp"/></div>
                <div><Label>Phone</Label><input value={editData.phone||''} onChange={e => setEditData({...editData, phone: e.target.value})} className="inp"/></div>
                <div><Label>Email</Label><input value={editData.email||''} onChange={e => setEditData({...editData, email: e.target.value})} className="inp"/></div>
                <div><Label>City</Label><input value={editData.city||''} onChange={e => setEditData({...editData, city: e.target.value})} className="inp"/></div>
                <div className="col-span-2"><Label>Notes</Label><textarea value={editData.notes||''} onChange={e => setEditData({...editData, notes: e.target.value})} className="inp" rows="2"/></div>
                <div className="col-span-2 flex gap-2">
                  <button onClick={saveEdit} className="btn btn-primary btn-sm">{Icon.check} Save</button>
                  <button onClick={() => setEditMode(false)} className="btn btn-ghost btn-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                {[
                  { label: 'Phone', value: lead.phone },
                  { label: 'Email', value: lead.email || '—' },
                  { label: 'City', value: lead.city || '—' },
                  { label: 'Source', value: lead.source },
                  { label: 'Course', value: lead.course_interest || '—' },
                  { label: 'Mode', value: lead.mode_preference || '—' },
                  { label: 'Assigned To', value: lead.assignee?.name || 'Unassigned' },
                  { label: 'Created', value: fmtDate(lead.created_at) },
                  { label: 'Updated', value: timeAgo(lead.updated_at) },
                ].map(f => (
                  <div key={f.label}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{f.label}</div>
                    <div className="font-medium text-slate-700 capitalize">{f.value}</div>
                  </div>
                ))}
                {lead.notes && <div className="col-span-2 md:col-span-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Notes</div><div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{lead.notes}</div></div>}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Activity Log</h3>
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-3">
              <div className="flex items-center gap-2">
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="inp h-9 text-xs w-auto">
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {newStatus !== lead.status && <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded">Status will change</span>}
              </div>
              <div className="flex gap-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
                  placeholder="Add a note or update…" className="inp flex-1 text-sm"/>
                <button onClick={addComment} disabled={!newComment.trim() || posting} className="btn btn-primary press">{posting ? '…' : 'Post'}</button>
              </div>
            </div>
            <div className="space-y-4">
              {comments.length === 0 ? <p className="text-xs text-slate-300 text-center py-6">No activity yet.</p> :
                comments.map(c => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={c.staff_name} size={28}/>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-800">{c.staff_name}</span>
                        {c.status_change && <Badge status={c.status_change}/>}
                        <span className="text-[10px] text-slate-300 ml-auto">{timeAgo(c.created_at)}</span>
                      </div>
                      <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{c.comment}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="card p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</h3>
            <div className="space-y-1.5">
              {lead.phone && <>
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                  <span className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">{Icon.phone}</span>Call {lead.phone}
                </a>
                <a href={`https://wa.me/${phone}?text=${encodeURIComponent(WA_ASSIGN_MSG(lead.name, lead.assignee?.name || 'CCE'))}`} target="_blank" rel="noopener"
                  className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                  <span className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center text-green-600">{Icon.wa}</span>WhatsApp
                </a>
              </>}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                <span className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center text-violet-600">{Icon.mail}</span>Email
              </a>}
            </div>
          </div>

          {/* Registration link */}
          {(isPM || isMarketer) && lead.assigned_to && lead.status !== 'registered' && (
            <div className="card p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Registration Link</h3>
              <p className="text-[10px] text-slate-400 mb-3">Send this unique link to the lead to complete registration & payment.</p>
              {regLink && (
                <div className="bg-slate-50 rounded-lg p-2 mb-3">
                  <div className="text-[10px] font-mono text-slate-500 truncate">{regLink}</div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => onRegLink(lead)}
                  className="btn btn-primary flex-1 btn-sm">
                  {Icon.wa} Send via WA
                </button>
                <button onClick={copyRegLink} className="btn btn-ghost btn-sm">
                  {copied ? Icon.check : Icon.copy}
                </button>
              </div>
            </div>
          )}

          {/* Registered info */}
          {lead.status === 'registered' && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="text-xs font-bold text-emerald-800 mb-2">🎓 Registered & Paid</div>
              {lead.reg_fee_paid && <div className="text-lg font-bold text-emerald-700">{fmtCurrency(lead.reg_fee_paid)}</div>}
              <div className="text-[11px] text-emerald-600">{fmtDate(lead.reg_paid_at)}</div>
            </div>
          )}

          {/* Assign (PM only) */}
          {isPM && (
            <div className="card p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Assign to Marketer</h3>
              <p className="text-[10px] text-slate-400 mb-3">Auto-sends WhatsApp intro to the lead on assignment.</p>
              {marketers.length === 0 ? <p className="text-xs text-slate-300 text-center py-4">No marketers added yet.</p> : (
                <div className="space-y-1.5">
                  {marketers.map(m => (
                    <button key={m.id} onClick={() => handleAssign(m.id)} disabled={assigning === m.id}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition press ${lead.assigned_to === m.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                      <Avatar name={m.name} size={28}/>
                      <span className="flex-1 text-sm font-medium text-slate-700">{m.name}</span>
                      {assigning === m.id && <div className="w-3 h-3 border border-slate-300 border-t-blue-600 rounded-full animate-spin"/>}
                      {lead.assigned_to === m.id && <span className="text-[10px] text-blue-600 font-bold">Current</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add Lead ──────────────────────────────────────────────────────────────────
function AddLead({ courses, onSubmit, onDone, isPM = false, personal = false }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: personal ? 'personal' : 'manual',
    course_interest: '', mode_preference: '', scholarship_interest: false, notes: '', city: '', country: 'Ghana'
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true); await onSubmit(form); setSaving(false); onDone()
  }

  return (
    <div className="fade-up max-w-xl">
      <h1 className="text-lg font-bold text-slate-900 mb-5">{personal ? '+ Add Personal Lead' : '+ Add New Lead'}</h1>
      {personal && <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 mb-4 text-xs text-violet-700">This lead will be added as your personal lead — it will be assigned directly to you.</div>}
      <div className="card p-5 space-y-4">
        <div><Label>Full Name *</Label><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Kwame Asante" className="inp"/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0244 000 000" type="tel" className="inp"/></div>
          <div><Label>Email</Label><input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" type="email" className="inp"/></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!personal && <div><Label>Source</Label>
            <select value={form.source} onChange={e => set('source', e.target.value)} className="inp">
              {SOURCES.filter(s => s !== 'personal').map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>}
          <div><Label>City</Label><input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Accra" className="inp"/></div>
        </div>
        <div><Label>Course Interest</Label>
          <select value={form.course_interest} onChange={e => set('course_interest', e.target.value)} className="inp">
            <option value="">Select a course…</option>
            {courses.map(c => <option key={c.id} value={c.name}>{c.name} ({c.mode})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div><Label>Mode Preference</Label>
            <select value={form.mode_preference} onChange={e => set('mode_preference', e.target.value)} className="inp">
              <option value="">No preference</option>
              <option value="in-person">In-Person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 pb-2 cursor-pointer">
            <input type="checkbox" checked={form.scholarship_interest} onChange={e => set('scholarship_interest', e.target.checked)} className="w-4 h-4 accent-blue-600"/>
            Needs scholarship
          </label>
        </div>
        <div><Label>Notes</Label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…" className="inp" rows="3"/></div>
        <button onClick={submit} disabled={!form.name.trim() || saving} className="btn btn-primary w-full press">
          {saving ? 'Adding…' : personal ? 'Add My Lead' : 'Add Lead'}
        </button>
      </div>
    </div>
  )
}

// ─── Staff Manager ─────────────────────────────────────────────────────────────
function StaffManager({ staff, sb, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    const { id, created_at, ...data } = editing
    if (id) await sb.from('staff').update(data).eq('id', id)
    else await sb.from('staff').insert(data)
    setSaving(false); setEditing(null); onRefresh()
  }
  const del = async (id) => { if (!confirm('Deactivate this staff member?')) return; await sb.from('staff').update({ is_active: false }).eq('id', id); onRefresh() }

  return (
    <div className="fade-up max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-900">Staff ({staff.length})</h1>
        <button onClick={() => setEditing({ name: '', email: '', phone: '', role: 'marketer', is_active: true })} className="btn btn-primary btn-sm">+ Add Staff</button>
      </div>
      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'New'} Staff`} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <div><Label>Full Name *</Label><input value={editing.name||''} onChange={e => setEditing({...editing,name:e.target.value})} className="inp"/></div>
            <div><Label>Email</Label><input value={editing.email||''} onChange={e => setEditing({...editing,email:e.target.value})} type="email" className="inp"/></div>
            <div><Label>Phone</Label><input value={editing.phone||''} onChange={e => setEditing({...editing,phone:e.target.value})} type="tel" className="inp"/></div>
            <div><Label>Role</Label>
              <select value={editing.role} onChange={e => setEditing({...editing,role:e.target.value})} className="inp">
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={save} disabled={!editing.name||saving} className="btn btn-primary flex-1">{saving?'Saving…':'Save'}</button>
            <button onClick={() => setEditing(null)} className="btn btn-ghost flex-1">Cancel</button>
          </div>
        </Modal>
      )}
      <div className="card overflow-hidden">
        {staff.length === 0 ? <EmptyState icon="👤" title="No staff yet"/> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th className="hidden sm:table-cell">Contact</th><th>Actions</th></tr></thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td><div className="flex items-center gap-2.5"><Avatar name={s.name} size={32}/><span className="font-medium text-slate-900">{s.name}</span></div></td>
                  <td><span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded capitalize">{s.role}</span></td>
                  <td className="hidden sm:table-cell text-xs text-slate-500">{s.email||s.phone||'—'}</td>
                  <td><div className="flex gap-1.5"><button onClick={() => setEditing(s)} className="btn btn-ghost btn-sm">{Icon.edit}</button><button onClick={() => del(s.id)} className="btn btn-danger btn-sm">{Icon.trash}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Course Manager ────────────────────────────────────────────────────────────
function CourseManager({ courses, sb, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    const { id, created_at, ...data } = editing
    if (id) await sb.from('courses').update(data).eq('id', id)
    else await sb.from('courses').insert(data)
    setSaving(false); setEditing(null); onRefresh()
  }
  const del = async (id) => { if (!confirm('Delete this course?')) return; await sb.from('courses').delete().eq('id', id); onRefresh() }

  return (
    <div className="fade-up max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-900">Courses ({courses.length})</h1>
        <button onClick={() => setEditing({ name:'',description:'',mode:'in-person',duration:'',fee:0,reg_fee:150,scholarship_available:false,is_active:true })} className="btn btn-primary btn-sm">+ Add Course</button>
      </div>
      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'New'} Course`} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <div><Label>Course Name *</Label><input value={editing.name||''} onChange={e => setEditing({...editing,name:e.target.value})} className="inp"/></div>
            <div><Label>Description</Label><textarea value={editing.description||''} onChange={e => setEditing({...editing,description:e.target.value})} className="inp" rows="2"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mode</Label>
                <select value={editing.mode} onChange={e => setEditing({...editing,mode:e.target.value})} className="inp">
                  <option value="in-person">In-Person</option><option value="online">Online</option><option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div><Label>Duration</Label><input value={editing.duration||''} onChange={e => setEditing({...editing,duration:e.target.value})} placeholder="e.g. 3 months" className="inp"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Course Fee (GH₵)</Label><input type="number" value={editing.fee||''} onChange={e => setEditing({...editing,fee:Number(e.target.value)})} className="inp"/></div>
              <div><Label>Registration Fee (GH₵)</Label><input type="number" value={editing.reg_fee||150} onChange={e => setEditing({...editing,reg_fee:Number(e.target.value)})} className="inp"/></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={editing.scholarship_available} onChange={e => setEditing({...editing,scholarship_available:e.target.checked})} className="accent-blue-600"/>
              Scholarship available
            </label>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={save} disabled={!editing.name||saving} className="btn btn-primary flex-1">{saving?'Saving…':'Save'}</button>
            <button onClick={() => setEditing(null)} className="btn btn-ghost flex-1">Cancel</button>
          </div>
        </Modal>
      )}
      <div className="card overflow-hidden">
        {courses.length === 0 ? <EmptyState icon="📚" title="No courses yet"/> : (
          <table className="data-table">
            <thead><tr><th>Course</th><th>Mode</th><th className="hidden sm:table-cell">Duration</th><th>Course Fee</th><th>Reg. Fee</th><th>Actions</th></tr></thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.id}>
                  <td><div className="font-medium text-slate-900">{c.name}</div>{c.scholarship_available && <div className="text-[10px] text-purple-500 font-semibold">🎓 Scholarship</div>}</td>
                  <td><span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{c.mode}</span></td>
                  <td className="hidden sm:table-cell text-xs text-slate-500">{c.duration||'—'}</td>
                  <td className="font-semibold text-slate-900 text-sm">{fmtCurrency(c.fee)}</td>
                  <td className="font-semibold text-blue-700 text-sm">{fmtCurrency(c.reg_fee||150)}</td>
                  <td><div className="flex gap-1.5"><button onClick={() => setEditing(c)} className="btn btn-ghost btn-sm">{Icon.edit}</button><button onClick={() => del(c.id)} className="btn btn-danger btn-sm">{Icon.trash}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Integrations ──────────────────────────────────────────────────────────────
function Integrations({ sb }) {
  const [fbConfig, setFbConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState('')
  const [form, setForm] = useState({ page_id:'', page_access_token:'', form_id:'', verify_token:'cce_webhook_2026' })

  useEffect(() => {
    sb.from('fb_config').select('*').limit(1).then(({ data }) => {
      if (data?.[0]) { setFbConfig(data[0]); setForm(data[0]) }
      setLoading(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    if (fbConfig?.id) await sb.from('fb_config').update(form).eq('id', fbConfig.id)
    else { const { data } = await sb.from('fb_config').insert(form).select().single(); setFbConfig(data) }
    setSaving(false)
  }

  const copyUrl = (url, key) => { navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(''), 2000) }

  const fbWebhook = `${window.location.origin}/api/webhook/facebook`
  const psWebhook = `${window.location.origin}/api/webhook/paystack`

  return (
    <div className="fade-up max-w-2xl space-y-5">
      <h1 className="text-lg font-bold text-slate-900">Integrations</h1>

      {/* Paystack */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center text-white text-sm font-bold">₵</div>
          <div><div className="font-bold text-slate-900">Paystack Payments</div><div className="text-xs text-slate-400">Registration fee collection via Paystack</div></div>
          <div className={`ml-auto badge ${import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ? 'Configured' : 'Needs Key'}
          </div>
        </div>
        <div className="space-y-3 text-xs text-slate-600">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="font-bold text-slate-800 mb-1">Paystack Webhook URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-slate-200 rounded px-2 py-1.5 font-mono text-[11px] truncate">{psWebhook}</code>
              <button onClick={() => copyUrl(psWebhook,'ps')} className="btn btn-ghost btn-sm shrink-0">{copied==='ps' ? Icon.check : Icon.copy}</button>
            </div>
            <div className="text-slate-400 mt-1">Add this in Paystack Dashboard → Settings → Webhooks</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 space-y-1">
            <div className="font-bold text-blue-800">Setup:</div>
            <div>1. Add <code>VITE_PAYSTACK_PUBLIC_KEY</code> to Vercel env vars</div>
            <div>2. Add <code>PAYSTACK_SECRET_KEY</code> to Vercel env vars (server only)</div>
            <div>3. Set registration fees per course in the Courses section</div>
            <div>4. Add the webhook URL above in Paystack Dashboard</div>
          </div>
        </div>
      </div>

      {/* Facebook */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white">{Icon.fb}</div>
          <div><div className="font-bold text-slate-900">Facebook Lead Ads</div><div className="text-xs text-slate-400">Auto-capture leads from Facebook ad forms</div></div>
          <div className={`ml-auto badge ${fbConfig ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{fbConfig ? 'Connected' : 'Not set up'}</div>
        </div>
        {loading ? <Spinner size={16}/> : (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="font-bold text-slate-800 text-xs mb-1">Webhook URL</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-slate-200 rounded px-2 py-1.5 font-mono text-[11px] truncate">{fbWebhook}</code>
                <button onClick={() => copyUrl(fbWebhook,'fb')} className="btn btn-ghost btn-sm shrink-0">{copied==='fb' ? Icon.check : Icon.copy}</button>
              </div>
            </div>
            <div><Label>Facebook Page ID</Label><input value={form.page_id||''} onChange={e => setForm({...form,page_id:e.target.value})} className="inp"/></div>
            <div><Label>Page Access Token</Label><input value={form.page_access_token||''} onChange={e => setForm({...form,page_access_token:e.target.value})} type="password" className="inp"/></div>
            <div><Label>Verify Token</Label><input value={form.verify_token||''} onChange={e => setForm({...form,verify_token:e.target.value})} className="inp"/></div>
            <button onClick={save} disabled={saving} className="btn btn-primary">{saving?'Saving…':'Save FB Config'}</button>
          </div>
        )}
      </div>

      {/* Google Sheets */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center text-white text-sm font-bold">G</div>
          <div><div className="font-bold text-slate-900">Google Sheets Sync</div><div className="text-xs text-slate-400">Auto-log every registration to a shared sheet</div></div>
          <div className="ml-auto badge bg-slate-100 text-slate-400">Via Webhook</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 space-y-2">
          <div className="font-bold text-slate-800">How to set up:</div>
          <div>1. Open Google Sheets → Extensions → Apps Script</div>
          <div>2. Create a <code>doPost(e)</code> function that writes to your sheet</div>
          <div>3. Deploy as Web App → Anyone (with link) → Copy the URL</div>
          <div>4. Add <code>VITE_SHEETS_WEBHOOK_URL</code> to your Vercel environment</div>
          <div>Every successful registration payment will POST the student data to your sheet automatically.</div>
        </div>
      </div>
    </div>
  )
}
