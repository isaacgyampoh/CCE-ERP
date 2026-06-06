import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://PLACEHOLDER.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUS = {
  new: { label: 'New', cls: 'bg-sky-50 text-sky-700' },
  assigned: { label: 'Assigned', cls: 'bg-violet-50 text-violet-700' },
  contacted: { label: 'Contacted', cls: 'bg-cyan-50 text-cyan-700' },
  follow_up: { label: 'Follow Up', cls: 'bg-amber-50 text-amber-700' },
  pending_registration: { label: 'Pending Reg.', cls: 'bg-orange-50 text-orange-700' },
  registered: { label: 'Registered', cls: 'bg-emerald-50 text-emerald-700' },
  next_session: { label: 'Next Session', cls: 'bg-indigo-50 text-indigo-700' },
  not_qualified: { label: 'Not Qualified', cls: 'bg-red-50 text-red-600' },
  inquiry: { label: 'Inquiry', cls: 'bg-slate-100 text-slate-500' },
}

const SOURCES = ['facebook', 'linkedin', 'website', 'manual', 'referral', 'walk-in']
const ROLES = ['marketer', 'pm', 'admin', 'finance', 'admission', 'receptionist']

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  leads: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  add: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>,
  staff: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  courses: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
  integrations: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
  bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  logout: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.52 9.81 19.79 19.79 0 01.44 1.18 2 2 0 012.42 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.91a16 16 0 006.17 6.17l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  wa: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
  mail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  edit: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  fb: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  li: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>,
  copy: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const avatar = (name, size = 32, cls = '') => (
  <div style={{ width: size, height: size, minWidth: size, fontSize: size * 0.38 }}
    className={`rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold ${cls}`}>
    {name?.charAt(0)?.toUpperCase() || '?'}
  </div>
)

const Badge = ({ status }) => {
  const s = STATUS[status] || { label: status, cls: 'bg-slate-100 text-slate-500' }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

const formatPhone = (p) => {
  if (!p) return ''
  const clean = p.replace(/\s/g, '').replace(/^0/, '233')
  return clean.startsWith('+') ? clean.slice(1) : clean
}

const timeAgo = (ts) => {
  const d = new Date(ts)
  const now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const WA_MESSAGE = (leadName, marketerName) =>
  `Hello ${leadName}! 👋\n\nThank you for your interest in Cambridge Center of Excellence.\n\nMy name is ${marketerName}, and I'll be your dedicated consultant. I'll be reaching out to you shortly to discuss how we can help you achieve your educational goals.\n\nFeel free to reply here if you have any questions in the meantime!\n\nBest regards,\n${marketerName}\nCambridge Center of Excellence`

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
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
    if (saved) {
      const u = JSON.parse(saved)
      setUser(u)
      loadAll(u)
    } else {
      loadStaff()
    }
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
      sb.from('notifications').select('*').eq('staff_id', u.id).order('created_at', { ascending: false }).limit(30),
    ])
    setLeads(l || [])
    setStaff(s || [])
    setCourses(c || [])
    setNotifications(n || [])
    setLoading(false)
  }

  const login = (s) => {
    setUser(s)
    sessionStorage.setItem('cce_user', JSON.stringify(s))
    loadAll(s)
  }

  const logout = () => {
    setUser(null)
    sessionStorage.removeItem('cce_user')
    setPage('dashboard')
    setSelectedLead(null)
    loadStaff()
  }

  const isPM = user?.role === 'pm' || user?.role === 'admin'
  const myLeads = isPM ? leads : leads.filter(l => l.assigned_to === user?.id)
  const unread = notifications.filter(n => !n.is_read).length

  const assignLead = async (leadId, marketerId) => {
    const marketer = staff.find(s => s.id === marketerId)
    const lead = leads.find(l => l.id === leadId)
    if (!marketer || !lead) return

    await sb.from('leads').update({
      assigned_to: marketerId,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)

    await sb.from('notifications').insert({
      staff_id: marketerId,
      title: 'New Lead Assigned',
      message: `${lead.name} has been assigned to you by ${user.name}`,
      type: 'assignment',
      lead_id: leadId,
    })

    await sb.from('lead_comments').insert({
      lead_id: leadId,
      staff_id: user.id,
      staff_name: user.name,
      comment: `Assigned to ${marketer.name}`,
      status_change: 'assigned',
    })

    // WhatsApp auto-message
    const msg = WA_MESSAGE(lead.name, marketer.name)
    const phone = formatPhone(lead.phone)
    if (phone) {
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      window.open(waUrl, '_blank')

      await sb.from('whatsapp_log').insert({
        lead_id: leadId,
        phone: lead.phone,
        message: msg,
        marketer_name: marketer.name,
        status: 'sent',
      })

      await sb.from('leads').update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() }).eq('id', leadId)
    }

    await loadAll(user)
  }

  const updateStatus = async (leadId, newStatus, comment = '') => {
    await sb.from('leads').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', leadId)
    if (comment) {
      await sb.from('lead_comments').insert({
        lead_id: leadId, staff_id: user.id, staff_name: user.name, comment, status_change: newStatus,
      })
    }
    await loadAll(user)
  }

  const addLead = async (data) => {
    const { data: inserted } = await sb.from('leads').insert({ ...data, source: data.source || 'manual', status: 'new' }).select().single()
    const pms = staff.filter(s => s.role === 'pm' || s.role === 'admin')
    for (const pm of pms) {
      await sb.from('notifications').insert({
        staff_id: pm.id,
        title: 'New Lead',
        message: `${data.name} via ${data.source || 'manual'}`,
        type: 'new_lead',
        lead_id: inserted?.id,
      })
    }
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

  const navigate = (p, lead = null) => {
    setPage(p)
    setSelectedLead(lead)
    setSidebarOpen(false)
    window.scrollTo(0, 0)
  }

  // ─── Login Screen ─────────────────────────────────────────────────────────
  if (!user) return (
    <div className="min-h-screen flex bg-slate-50">
      <div className="hidden md:flex flex-col justify-center w-96 bg-gradient-to-b from-blue-700 to-blue-900 p-10 text-white">
        <div className="mb-10">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl font-black mb-6">C</div>
          <h1 className="text-3xl font-black leading-tight">Cambridge Center<br/>of Excellence</h1>
          <p className="text-blue-200 text-sm mt-3 leading-relaxed">CRM & Lead Management System for your admissions and marketing team.</p>
        </div>
        <div className="space-y-3 text-sm text-blue-200">
          {['Role-based access control','Lead assignment & tracking','WhatsApp auto-messaging','Facebook & LinkedIn integration'].map(f => (
            <div key={f} className="flex items-center gap-2"><div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-[9px]">✓</div>{f}</div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm fade-up">
          <div className="mb-8 md:hidden">
            <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center text-xl font-black text-white mb-4">C</div>
            <h1 className="text-2xl font-black text-slate-900">CCE ERP</h1>
            <p className="text-slate-400 text-sm">Cambridge Center of Excellence</p>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-6">Select your account to continue</p>
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"/></div>
          ) : staff.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-slate-400">No staff accounts found.</p>
              <p className="text-xs text-slate-300 mt-1">Run the SQL schema in Supabase first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {staff.map(s => (
                <button key={s.id} onClick={() => login(s)}
                  className="w-full flex items-center gap-3 p-3.5 card hover:border-blue-300 hover:shadow-sm transition press text-left group">
                  {avatar(s.name, 38)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{s.role} {s.email && `· ${s.email}`}</div>
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

  // ─── Nav items ────────────────────────────────────────────────────────────
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icon.dashboard },
    { id: 'leads', label: `Leads`, count: myLeads.length, icon: Icon.leads },
    { id: 'add', label: 'Add Lead', icon: Icon.add },
    ...(isPM ? [
      { id: 'staff', label: 'Staff', icon: Icon.staff },
      { id: 'courses', label: 'Courses', icon: Icon.courses },
      { id: 'integrations', label: 'Integrations', icon: Icon.integrations },
    ] : []),
  ]

  // ─── Main Layout ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-[220px] bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-slate-100">
          <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center text-white text-xs font-black mr-2.5">C</div>
          <div>
            <div className="text-xs font-bold text-slate-900 leading-tight">CCE ERP</div>
            <div className="text-[9px] text-slate-400 leading-tight">Cambridge Centre</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => navigate(item.id)}
              className={`nav-item w-full ${page === item.id && !selectedLead ? 'active' : ''}`}>
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.count != null && <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{item.count}</span>}
            </button>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-2.5 p-2 rounded-lg">
            {avatar(user.name, 30)}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">{user.name}</div>
              <div className="text-[10px] text-slate-400 uppercase">{user.role}</div>
            </div>
            <button onClick={logout} title="Logout" className="text-slate-300 hover:text-red-500 transition p-1 press">
              {Icon.logout}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 md:ml-[220px] flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 sticky top-0 z-30">
          <button className="md:hidden p-2 -ml-1" onClick={() => setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>

          {/* Breadcrumb */}
          <div className="flex-1 text-sm font-semibold text-slate-800">
            {selectedLead ? (
              <span className="flex items-center gap-1.5">
                <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-slate-700 transition">{Icon.back}</button>
                <span className="text-slate-300">/</span>
                <span className="truncate">{selectedLead.name}</span>
              </span>
            ) : navItems.find(n => n.id === page)?.label || 'Dashboard'}
          </div>

          {/* Notification bell */}
          <div className="relative">
            <button onClick={() => setShowNotifs(!showNotifs)}
              className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 transition text-slate-500">
              {Icon.bell}
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unread}</span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-11 w-80 card shadow-xl z-50 fade-up overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Notifications {unread > 0 && <span className="text-blue-600">({unread})</span>}</span>
                  <div className="flex items-center gap-2">
                    {unread > 0 && <button onClick={markAllRead} className="text-[10px] text-blue-600 font-medium">Mark all read</button>}
                    <button onClick={() => setShowNotifs(false)} className="text-slate-300 hover:text-slate-600">{Icon.x}</button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-300">No notifications yet</div>
                  ) : notifications.map(n => (
                    <div key={n.id} onClick={() => { markNotifRead(n.id); setShowNotifs(false); if (n.lead_id) { navigate('leads', leads.find(l => l.id === n.lead_id)) } }}
                      className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${!n.is_read ? 'bg-blue-50/40' : ''}`}>
                      <div className="flex items-start gap-2">
                        {!n.is_read && <div className="live-dot mt-1.5 shrink-0"/>}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800">{n.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{n.message}</div>
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

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"/>
            </div>
          ) : (
            <>
              {page === 'dashboard' && <Dashboard user={user} isPM={isPM} leads={leads} myLeads={myLeads} staff={staff} navigate={navigate}/>}
              {page === 'leads' && !selectedLead && <LeadList leads={myLeads} isPM={isPM} staff={staff} onSelect={l => { setSelectedLead(l); setPage('leads') }}/>}
              {page === 'leads' && selectedLead && <LeadDetail lead={selectedLead} staff={staff} user={user} isPM={isPM} sb={sb} onAssign={assignLead} onStatusChange={updateStatus} onRefresh={() => loadAll(user)}/>}
              {page === 'add' && <AddLead courses={courses} onSubmit={addLead} onDone={() => navigate('leads')}/>}
              {page === 'staff' && isPM && <StaffManager staff={staff} sb={sb} onRefresh={() => loadAll(user)}/>}
              {page === 'courses' && isPM && <CourseManager courses={courses} sb={sb} onRefresh={() => loadAll(user)}/>}
              {page === 'integrations' && isPM && <Integrations sb={sb}/>}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ user, isPM, leads, myLeads, staff, navigate }) {
  const data = isPM ? leads : myLeads
  const stats = [
    { label: 'Total Leads', value: data.length, color: 'text-blue-700 bg-blue-50', icon: '👥' },
    { label: 'New', value: data.filter(l => l.status === 'new').length, color: 'text-sky-700 bg-sky-50', icon: '✨' },
    { label: 'Follow Up', value: data.filter(l => l.status === 'follow_up').length, color: 'text-amber-700 bg-amber-50', icon: '📞' },
    { label: 'Registered', value: data.filter(l => l.status === 'registered').length, color: 'text-emerald-700 bg-emerald-50', icon: '🎓' },
    { label: 'Pending Reg.', value: data.filter(l => l.status === 'pending_registration').length, color: 'text-orange-700 bg-orange-50', icon: '⏳' },
    { label: 'Not Qualified', value: data.filter(l => l.status === 'not_qualified').length, color: 'text-red-700 bg-red-50', icon: '✗' },
    { label: 'Inquiries', value: data.filter(l => l.status === 'inquiry').length, color: 'text-slate-600 bg-slate-100', icon: '💬' },
    ...(isPM ? [{ label: 'Unassigned', value: leads.filter(l => !l.assigned_to).length, color: 'text-violet-700 bg-violet-50', icon: '⚠️' }] : []),
  ]

  // Source breakdown
  const sources = SOURCES.map(s => ({ label: s, value: data.filter(l => l.source === s).length })).filter(s => s.value > 0)
  const recent = [...data].slice(0, 8)

  // Marketer leaderboard (PM only)
  const marketers = isPM ? staff.filter(s => s.role === 'marketer').map(m => ({
    ...m,
    total: leads.filter(l => l.assigned_to === m.id).length,
    registered: leads.filter(l => l.assigned_to === m.id && l.status === 'registered').length,
  })).sort((a, b) => b.registered - a.registered) : []

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-slate-400 mt-0.5">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className={`inline-flex w-8 h-8 rounded-lg items-center justify-center text-base mb-3 ${s.color}`}>{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent leads */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Leads</h2>
            <button onClick={() => navigate('leads')} className="text-xs text-blue-600 font-medium">View all →</button>
          </div>
          <div className="divide-y divide-slate-50">
            {recent.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-300">No leads yet. <button onClick={() => navigate('add')} className="text-blue-500">Add one</button></div>
            ) : recent.map(l => (
              <div key={l.id} onClick={() => navigate('leads', l)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition">
                {avatar(l.name, 32)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{l.name}</div>
                  <div className="text-[11px] text-slate-400">{l.phone} · {l.assignee?.name || 'Unassigned'}</div>
                </div>
                <div className="text-right shrink-0">
                  <Badge status={l.status}/>
                  <div className="text-[10px] text-slate-300 mt-1">{timeAgo(l.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar panels */}
        <div className="space-y-4">
          {/* Source breakdown */}
          {sources.length > 0 && (
            <div className="card p-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Lead Sources</h2>
              <div className="space-y-2">
                {sources.map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="text-[11px] text-slate-500 w-16 capitalize">{s.label}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${data.length ? (s.value/data.length*100) : 0}%` }}/>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-700 w-5 text-right">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Marketer leaderboard */}
          {isPM && marketers.length > 0 && (
            <div className="card p-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Marketer Performance</h2>
              <div className="space-y-2">
                {marketers.slice(0, 5).map((m, i) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <div className="text-[10px] text-slate-300 w-3 font-bold">{i+1}</div>
                    {avatar(m.name, 26)}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-700 truncate">{m.name}</div>
                      <div className="text-[10px] text-slate-400">{m.total} leads · {m.registered} registered</div>
                    </div>
                    <div className="text-xs font-bold text-emerald-600">{m.registered}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unassigned alert */}
          {isPM && leads.filter(l => !l.assigned_to).length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="text-xs font-bold text-amber-800 mb-1">⚠️ Unassigned Leads</div>
              <div className="text-sm font-bold text-amber-900">{leads.filter(l => !l.assigned_to).length} leads</div>
              <div className="text-[11px] text-amber-600 mb-2">need assignment</div>
              <button onClick={() => navigate('leads')} className="text-[11px] font-semibold text-amber-800 underline">View leads →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Lead List ────────────────────────────────────────────────────────────────
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
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email, course…"
            className="inp pl-9 h-9 text-xs"/>
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
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-300">No leads match your filters.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="hidden sm:table-cell">Contact</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Source</th>
                <th className="hidden lg:table-cell">Course</th>
                <th className="hidden md:table-cell">Assigned To</th>
                <th className="hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} onClick={() => onSelect(l)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      {avatar(l.name, 30)}
                      <div>
                        <div className="font-medium text-slate-900">{l.name}</div>
                        {l.whatsapp_sent && <div className="text-[9px] text-emerald-500 font-semibold">WA sent</div>}
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell text-slate-500 text-xs">{l.phone}</td>
                  <td><Badge status={l.status}/></td>
                  <td className="hidden md:table-cell">
                    <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded capitalize">{l.source}</span>
                  </td>
                  <td className="hidden lg:table-cell text-slate-500 text-xs max-w-[140px] truncate">{l.course_interest || '—'}</td>
                  <td className="hidden md:table-cell">
                    {l.assignee ? (
                      <div className="flex items-center gap-1.5">{avatar(l.assignee.name, 22)}<span className="text-xs text-slate-600">{l.assignee.name}</span></div>
                    ) : <span className="text-xs text-slate-300">—</span>}
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

// ─── Lead Detail ──────────────────────────────────────────────────────────────
function LeadDetail({ lead, staff, user, isPM, sb, onAssign, onStatusChange, onRefresh }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [newStatus, setNewStatus] = useState(lead.status)
  const [posting, setPosting] = useState(false)
  const [assigning, setAssigning] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({ name: lead.name, phone: lead.phone, email: lead.email, notes: lead.notes, city: lead.city })

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

  const handleAssign = async (mid) => {
    setAssigning(mid)
    await onAssign(lead.id, mid)
    setAssigning(null)
  }

  const saveEdit = async () => {
    await sb.from('leads').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', lead.id)
    await onRefresh()
    setEditMode(false)
  }

  const marketers = staff.filter(s => s.role === 'marketer')
  const phone = formatPhone(lead.phone)
  const waMsg = WA_MESSAGE(lead.name, lead.assignee?.name || 'our team')

  return (
    <div className="fade-up">
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Main panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Lead header card */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {avatar(lead.name, 44)}
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{lead.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge status={lead.status}/>
                    {lead.whatsapp_sent && <span className="badge bg-green-50 text-green-600">WA Sent</span>}
                    {lead.scholarship_interest && <span className="badge bg-purple-50 text-purple-600">Scholarship</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => setEditMode(!editMode)} className="btn btn-ghost btn-sm">{Icon.edit} Edit</button>
            </div>

            {editMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">Full Name</label><input value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="inp"/></div>
                <div><label className="label">Phone</label><input value={editData.phone || ''} onChange={e => setEditData({...editData, phone: e.target.value})} className="inp"/></div>
                <div><label className="label">Email</label><input value={editData.email || ''} onChange={e => setEditData({...editData, email: e.target.value})} className="inp"/></div>
                <div><label className="label">City</label><input value={editData.city || ''} onChange={e => setEditData({...editData, city: e.target.value})} className="inp"/></div>
                <div className="col-span-2"><label className="label">Notes</label><textarea value={editData.notes || ''} onChange={e => setEditData({...editData, notes: e.target.value})} className="inp" rows="2"/></div>
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
                  { label: 'Source', value: lead.source + (lead.source_campaign ? ` · ${lead.source_campaign}` : '') },
                  { label: 'Course', value: lead.course_interest || '—' },
                  { label: 'Mode', value: lead.mode_preference || '—' },
                  { label: 'Assigned To', value: lead.assignee?.name || 'Unassigned' },
                  { label: 'Created', value: new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
                  { label: 'Last Updated', value: timeAgo(lead.updated_at || lead.created_at) },
                ].map(f => (
                  <div key={f.label}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{f.label}</div>
                    <div className="font-medium text-slate-700 capitalize">{f.value}</div>
                  </div>
                ))}
                {lead.notes && (
                  <div className="col-span-2 md:col-span-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Notes</div>
                    <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 leading-relaxed">{lead.notes}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity / Comments */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Activity Log</h3>

            {/* Add update */}
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-3">
              <div className="flex items-center gap-2">
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="inp h-9 text-xs w-auto">
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {newStatus !== lead.status && (
                  <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded">Status will change</span>
                )}
              </div>
              <div className="flex gap-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
                  placeholder="Add a note or update…"
                  className="inp flex-1 text-sm"/>
                <button onClick={addComment} disabled={!newComment.trim() || posting} className="btn btn-primary press">
                  {posting ? '…' : 'Post'}
                </button>
              </div>
            </div>

            {/* Comment list */}
            <div className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-300 text-center py-6">No activity yet. Add the first note above.</p>
              ) : comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  {avatar(c.staff_name, 28)}
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
              {lead.phone && (
                <>
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                    <span className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">{Icon.phone}</span>
                    Call {lead.phone}
                  </a>
                  <a href={`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noopener"
                    className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                    <span className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center text-green-600">{Icon.wa}</span>
                    WhatsApp
                  </a>
                </>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                  <span className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center text-violet-600">{Icon.mail}</span>
                  Send Email
                </a>
              )}
            </div>
          </div>

          {/* Assign (PM only) */}
          {isPM && (
            <div className="card p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Assign to Marketer</h3>
              <p className="text-[10px] text-slate-400 mb-3">Assigning will auto-send a WhatsApp intro to the lead.</p>
              {marketers.length === 0 ? (
                <p className="text-xs text-slate-300 text-center py-4">No marketers. Add staff first.</p>
              ) : (
                <div className="space-y-1.5">
                  {marketers.map(m => (
                    <button key={m.id} onClick={() => handleAssign(m.id)} disabled={assigning === m.id}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition press
                        ${lead.assigned_to === m.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                      {avatar(m.name, 28)}
                      <span className="flex-1 text-sm font-medium text-slate-700">{m.name}</span>
                      {assigning === m.id && <div className="w-3 h-3 border border-slate-300 border-t-blue-600 rounded-full animate-spin"/>}
                      {lead.assigned_to === m.id && <span className="text-[10px] text-blue-600 font-bold">Current</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WA Log */}
          {lead.whatsapp_sent && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-600">{Icon.wa}</span>
                <span className="text-xs font-bold text-green-800">WhatsApp Sent</span>
              </div>
              <p className="text-[11px] text-green-600">{lead.whatsapp_sent_at ? new Date(lead.whatsapp_sent_at).toLocaleString() : 'Sent'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add Lead ─────────────────────────────────────────────────────────────────
function AddLead({ courses, onSubmit, onDone }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: 'manual', course_interest: '',
    mode_preference: '', scholarship_interest: false, notes: '', city: '', country: 'Ghana'
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSubmit(form)
    setSaving(false)
    onDone()
  }

  return (
    <div className="fade-up max-w-xl">
      <h1 className="text-lg font-bold text-slate-900 mb-5">Add New Lead</h1>
      <div className="card p-5 space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Full Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Kwame Asante" className="inp"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0244 000 000" type="tel" className="inp"/>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Email</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" type="email" className="inp"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Source</label>
            <select value={form.source} onChange={e => set('source', e.target.value)} className="inp">
              {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">City</label>
            <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Accra" className="inp"/>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Course Interest</label>
          <select value={form.course_interest} onChange={e => set('course_interest', e.target.value)} className="inp">
            <option value="">Select a course</option>
            {courses.map(c => <option key={c.id} value={c.name}>{c.name} ({c.mode})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Mode Preference</label>
            <select value={form.mode_preference} onChange={e => set('mode_preference', e.target.value)} className="inp">
              <option value="">No preference</option>
              <option value="in-person">In-Person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 pb-2 cursor-pointer">
            <input type="checkbox" checked={form.scholarship_interest} onChange={e => set('scholarship_interest', e.target.checked)}
              className="w-4 h-4 accent-blue-600"/>
            Needs scholarship
          </label>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…" className="inp" rows="3"/>
        </div>
        <button onClick={submit} disabled={!form.name.trim() || saving} className="btn btn-primary w-full press">
          {saving ? 'Adding lead…' : 'Add Lead'}
        </button>
      </div>
    </div>
  )
}

// ─── Staff Manager ────────────────────────────────────────────────────────────
function StaffManager({ staff, sb, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const { id, created_at, ...data } = editing
    if (id) await sb.from('staff').update(data).eq('id', id)
    else await sb.from('staff').insert(data)
    setSaving(false)
    setEditing(null)
    onRefresh()
  }

  const del = async (id) => {
    if (!confirm('Deactivate this staff member?')) return
    await sb.from('staff').update({ is_active: false }).eq('id', id)
    onRefresh()
  }

  return (
    <div className="fade-up max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-900">Staff ({staff.length})</h1>
        <button onClick={() => setEditing({ name: '', email: '', phone: '', role: 'marketer', is_active: true })} className="btn btn-primary btn-sm">
          + Add Staff
        </button>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal p-6">
            <h3 className="font-bold text-slate-900 mb-5">{editing.id ? 'Edit' : 'New'} Staff Member</h3>
            <div className="space-y-3">
              <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Full Name *</label>
                <input value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} className="inp"/></div>
              <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Email</label>
                <input value={editing.email || ''} onChange={e => setEditing({...editing, email: e.target.value})} type="email" className="inp"/></div>
              <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Phone</label>
                <input value={editing.phone || ''} onChange={e => setEditing({...editing, phone: e.target.value})} type="tel" className="inp"/></div>
              <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Role</label>
                <select value={editing.role} onChange={e => setEditing({...editing, role: e.target.value})} className="inp">
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={save} disabled={!editing.name || saving} className="btn btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(null)} className="btn btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {staff.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-300">No staff yet.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th className="hidden sm:table-cell">Contact</th><th>Actions</th></tr></thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      {avatar(s.name, 32)}
                      <span className="font-medium text-slate-900">{s.name}</span>
                    </div>
                  </td>
                  <td><span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded capitalize">{s.role}</span></td>
                  <td className="hidden sm:table-cell text-xs text-slate-500">{s.email || s.phone || '—'}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditing(s)} className="btn btn-ghost btn-sm">{Icon.edit}</button>
                      <button onClick={() => del(s.id)} className="btn btn-danger btn-sm">{Icon.trash}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Course Manager ───────────────────────────────────────────────────────────
function CourseManager({ courses, sb, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const { id, created_at, ...data } = editing
    if (id) await sb.from('courses').update(data).eq('id', id)
    else await sb.from('courses').insert(data)
    setSaving(false)
    setEditing(null)
    onRefresh()
  }

  const del = async (id) => {
    if (!confirm('Delete this course?')) return
    await sb.from('courses').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div className="fade-up max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-900">Courses ({courses.length})</h1>
        <button onClick={() => setEditing({ name: '', description: '', mode: 'in-person', duration: '', fee: 0, scholarship_available: false, is_active: true })} className="btn btn-primary btn-sm">+ Add Course</button>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal p-6">
            <h3 className="font-bold text-slate-900 mb-5">{editing.id ? 'Edit' : 'New'} Course</h3>
            <div className="space-y-3">
              <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Course Name *</label>
                <input value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} className="inp"/></div>
              <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Description</label>
                <textarea value={editing.description || ''} onChange={e => setEditing({...editing, description: e.target.value})} className="inp" rows="2"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Mode</label>
                  <select value={editing.mode} onChange={e => setEditing({...editing, mode: e.target.value})} className="inp">
                    <option value="in-person">In-Person</option>
                    <option value="online">Online</option>
                    <option value="hybrid">Hybrid</option>
                  </select></div>
                <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Duration</label>
                  <input value={editing.duration || ''} onChange={e => setEditing({...editing, duration: e.target.value})} placeholder="e.g. 6 months" className="inp"/></div>
              </div>
              <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Fee (GH₵)</label>
                <input type="number" value={editing.fee || ''} onChange={e => setEditing({...editing, fee: Number(e.target.value)})} className="inp"/></div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={editing.scholarship_available} onChange={e => setEditing({...editing, scholarship_available: e.target.checked})} className="accent-blue-600"/>
                Scholarship available
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={save} disabled={!editing.name || saving} className="btn btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(null)} className="btn btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {courses.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-300">No courses yet.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Course</th><th>Mode</th><th className="hidden sm:table-cell">Duration</th><th>Fee</th><th>Actions</th></tr></thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium text-slate-900">{c.name}</div>
                    {c.scholarship_available && <div className="text-[10px] text-purple-500 font-semibold">🎓 Scholarship</div>}
                  </td>
                  <td><span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{c.mode}</span></td>
                  <td className="hidden sm:table-cell text-xs text-slate-500">{c.duration || '—'}</td>
                  <td className="text-sm font-semibold text-slate-900">GH₵ {Number(c.fee).toLocaleString()}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditing(c)} className="btn btn-ghost btn-sm">{Icon.edit}</button>
                      <button onClick={() => del(c.id)} className="btn btn-danger btn-sm">{Icon.trash}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Integrations ─────────────────────────────────────────────────────────────
function Integrations({ sb }) {
  const [fbConfig, setFbConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ page_id: '', page_access_token: '', form_id: '', verify_token: 'cce_webhook_2026' })

  useEffect(() => {
    sb.from('fb_config').select('*').limit(1).then(({ data }) => {
      if (data?.[0]) { setFbConfig(data[0]); setForm(data[0]) }
      setLoading(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    if (fbConfig?.id) {
      await sb.from('fb_config').update(form).eq('id', fbConfig.id)
    } else {
      const { data } = await sb.from('fb_config').insert(form).select().single()
      setFbConfig(data)
    }
    setSaving(false)
  }

  const webhookUrl = `${window.location.origin}/api/webhook/facebook`
  const copy = () => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fade-up max-w-2xl space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Integrations</h1>

      {/* Facebook Lead Ads */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white">{Icon.fb}</div>
          <div>
            <div className="font-bold text-slate-900">Facebook Lead Ads</div>
            <div className="text-xs text-slate-400">Auto-capture leads from your Facebook ad forms</div>
          </div>
          <div className={`ml-auto badge ${fbConfig ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            {fbConfig ? 'Connected' : 'Not set up'}
          </div>
        </div>

        {loading ? <div className="h-20 flex items-center justify-center"><div className="w-4 h-4 border border-slate-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Webhook URL</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono truncate">{webhookUrl}</code>
                <button onClick={copy} className="btn btn-ghost btn-sm shrink-0">
                  {copied ? <span className="text-emerald-600">{Icon.check}</span> : Icon.copy}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="text-[10px] text-slate-400 mt-2">Paste this URL in Facebook Events Manager → Webhooks → Leads object.</div>
            </div>

            <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Facebook Page ID</label>
              <input value={form.page_id || ''} onChange={e => set('page_id', e.target.value)} placeholder="Enter your Page ID" className="inp"/></div>
            <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Page Access Token</label>
              <input value={form.page_access_token || ''} onChange={e => set('page_access_token', e.target.value)} type="password" placeholder="EAAxx… (from Graph API Explorer)" className="inp"/></div>
            <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Lead Form ID (optional)</label>
              <input value={form.form_id || ''} onChange={e => set('form_id', e.target.value)} placeholder="Leave blank to capture from all forms" className="inp"/></div>
            <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Verify Token</label>
              <input value={form.verify_token || ''} onChange={e => set('verify_token', e.target.value)} placeholder="cce_webhook_2026" className="inp"/></div>

            <button onClick={save} disabled={saving} className="btn btn-primary press">{saving ? 'Saving…' : 'Save Facebook Config'}</button>

            <div className="mt-4 bg-blue-50 rounded-xl p-4 text-xs text-blue-800 space-y-1 leading-relaxed">
              <div className="font-bold mb-2">Setup Steps:</div>
              <div>1. Deploy this app to Vercel (deploy tab coming soon)</div>
              <div>2. In Facebook Business → Events Manager → Webhooks, add the URL above</div>
              <div>3. Set the Verify Token to match what's saved here</div>
              <div>4. Subscribe to the <strong>leadgen</strong> field for your page</div>
              <div>5. Leads from your FB ads will now auto-appear in this system as "New" leads</div>
            </div>
          </div>
        )}
      </div>

      {/* LinkedIn */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-sky-700 rounded-xl flex items-center justify-center text-white">{Icon.li}</div>
          <div>
            <div className="font-bold text-slate-900">LinkedIn Lead Gen Forms</div>
            <div className="text-xs text-slate-400">Auto-capture leads from LinkedIn campaign forms</div>
          </div>
          <div className="ml-auto badge bg-slate-100 text-slate-400">Coming Soon</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-500">
          LinkedIn Lead Gen Form integration will be available once you connect your LinkedIn Campaign Manager account. This will auto-import form submissions as leads with source = "linkedin".
        </div>
      </div>

      {/* WhatsApp */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center text-white">{Icon.wa}</div>
          <div>
            <div className="font-bold text-slate-900">WhatsApp Auto-Message</div>
            <div className="text-xs text-slate-400">Sends personalized intro when PM assigns a lead</div>
          </div>
          <div className="ml-auto badge bg-emerald-50 text-emerald-600">Active</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
          <div className="font-bold text-slate-800 mb-2">How it works</div>
          <div>When a PM assigns a lead to a marketer, the system automatically opens WhatsApp with a pre-filled personalized message addressed to the lead by name, introducing the marketer. The message is logged in the WhatsApp log for tracking.</div>
          <div className="mt-3 font-bold text-slate-800">Message Preview</div>
          <div className="mt-1.5 bg-white border border-slate-200 rounded-lg p-3 font-mono text-[11px] text-slate-500 whitespace-pre-wrap">{WA_MESSAGE('[Lead Name]', '[Marketer Name]')}</div>
        </div>
      </div>
    </div>
  )
}
