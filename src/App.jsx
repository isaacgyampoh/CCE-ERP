import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON, STATUS, SOURCES, ROLES, WA_ASSIGN_MSG, WA_REG_MSG } from '@/lib/constants'
import { formatPhone, timeAgo, fmtCurrency, fmtDate, marketerRegLink, sendSMS, leadScore } from '@/lib/helpers'
import { Avatar, Badge, Modal, EmptyState, Spinner, Label, Icon, ScoreBadge } from '@/components/ui'
import Analytics from '@/pages/Analytics'
import Finance from '@/pages/Finance'
import Admission from '@/pages/Admission'
import RegisterPage from '@/pages/RegisterPage'
import CohortManager from '@/pages/CohortManager'
import InstructorDashboard from '@/pages/InstructorDashboard'
import AttendPage from '@/pages/AttendPage'
import Pipeline from '@/pages/Pipeline'
import BulkSMS from '@/pages/BulkSMS'
import CalendarView from '@/pages/CalendarView'
import Reports from '@/pages/Reports'
import LeadImport from '@/pages/LeadImport'
import MarketerTargets from '@/pages/MarketerTargets'
import Documents from '@/pages/Documents'
import Dashboard from '@/pages/Dashboard'
import LeadDetail from '@/pages/LeadDetail'
import CommandPalette from '@/components/CommandPalette'

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
  const [toast, setToast] = useState(null)   // { msg, type }
  const [showPalette, setShowPalette] = useState(false)
  const [autoAssignWA, setAutoAssignWA] = useState(null) // [{lead, marketer, phone, waMsg}]
  const realtimeRef = useRef(null)

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const saved = sessionStorage.getItem('cce_user')
    if (saved) { const u = JSON.parse(saved); setUser(u); loadAll(u) }
    else loadStaff()
  }, [])

  // ── Ctrl+K Command Palette ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowPalette(p => !p) }
      if (e.key === 'Escape') setShowPalette(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    // Clean up any previous channel
    if (realtimeRef.current) sb.removeChannel(realtimeRef.current)

    const channel = sb
      .channel('cce-realtime-' + user.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `staff_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev])
          showToast(payload.new.message || payload.new.title, 'info')
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const isPMRole = user.role === 'pm' || user.role === 'admin'
          if (isPMRole) {
            setLeads(prev => [{ ...payload.new, assignee: null }, ...prev])
            showToast(`New lead: ${payload.new.name} (${payload.new.source})`, 'new_lead')
          }
        }
      )
      .subscribe()

    realtimeRef.current = channel
    return () => { sb.removeChannel(channel); realtimeRef.current = null }
  }, [user?.id])

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

    const course = lead.course_interest || ''
    await sb.from('leads').update({ assigned_to: marketerId, assigned_at: new Date().toISOString(), status: 'assigned', updated_at: new Date().toISOString() }).eq('id', leadId)
    await sb.from('notifications').insert({
      staff_id: marketer.id,
      title: '📋 New Lead Assigned to You',
      message: `${lead.name}${lead.phone ? ' · ' + lead.phone : ''}${course ? ' · ' + course : ''} — assigned by ${user.name}`,
      type: 'assignment',
      lead_id: leadId,
    })
    await sb.from('lead_comments').insert({ lead_id: leadId, staff_id: user.id, staff_name: user.name, comment: `Assigned to ${marketer.name}`, status_change: 'assigned' })

    const phone = formatPhone(lead.phone)
    if (phone) {
      const firstName = lead.name.split(' ')[0]
      const smsMsg = `Hi ${firstName}! This is Cambridge Center of Excellence. Thank you for your interest${course ? ' in ' + course : ''}. ${marketer.name.split(' ')[0]} will call you shortly. Cambridge Centre of Excellence`
      await sendSMS(phone, smsMsg)

      // Open WhatsApp with personalised pre-filled message (in marketer's name)
      const waMsg = WA_ASSIGN_MSG(lead.name, marketer.name, course)
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, '_blank')
      await sb.from('whatsapp_log').insert({ lead_id: leadId, phone: lead.phone, message: waMsg, marketer_name: marketer.name, status: 'sent' })
      await sb.from('leads').update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() }).eq('id', leadId)
    }

    // Also notify the marketer via SMS if they have a phone
    if (marketer.phone) {
      await sendSMS(
        formatPhone(marketer.phone),
        `CCE: New lead assigned to you — ${lead.name}${lead.phone ? ', ' + lead.phone : ''}${course ? ' (' + course + ')' : ''}. Login to follow up. Cambridge Centre of Excellence`
      )
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

  const autoAssign = async () => {
    const unassigned = leads.filter(l => !l.assigned_to && l.status === 'new')
    const marketers = staff.filter(s => s.role === 'marketer')
    if (!unassigned.length || !marketers.length) return showToast(unassigned.length ? 'No marketers to assign to' : 'No unassigned leads', 'info')

    const counts = marketers.map(m => ({ ...m, count: leads.filter(l => l.assigned_to === m.id).length }))
      .sort((a, b) => a.count - b.count)

    const waQueue = [] // collect WA links to send after loop

    for (let i = 0; i < unassigned.length; i++) {
      const marketer = counts[i % counts.length]
      const lead = unassigned[i]
      const course = lead.course_interest || ''

      await sb.from('leads').update({ assigned_to: marketer.id, assigned_at: new Date().toISOString(), status: 'assigned', updated_at: new Date().toISOString() }).eq('id', lead.id)
      await sb.from('notifications').insert({
        staff_id: marketer.id,
        title: '📋 New Lead Assigned to You',
        message: `${lead.name}${lead.phone ? ' · ' + lead.phone : ''}${course ? ' · ' + course : ''} — auto-assigned`,
        type: 'assignment',
        lead_id: lead.id,
      })

      if (lead.phone) {
        const phone = formatPhone(lead.phone)
        const smsMsg = `Hi ${lead.name.split(' ')[0]}! This is Cambridge Center of Excellence. Thank you for your interest${course ? ' in ' + course : ''}. ${marketer.name.split(' ')[0]} will call you shortly. Cambridge Centre of Excellence`
        await sendSMS(phone, smsMsg)
        const waMsg = WA_ASSIGN_MSG(lead.name, marketer.name, course)
        waQueue.push({ lead, marketer, phone, waMsg })
        await sb.from('leads').update({ whatsapp_sent: false }).eq('id', lead.id) // mark pending WA
      }

      // SMS the marketer too
      if (marketer.phone) {
        await sendSMS(
          formatPhone(marketer.phone),
          `CCE: New lead — ${lead.name}${lead.phone ? ', ' + lead.phone : ''}${course ? ' (' + course + ')' : ''}. Login to follow up. Cambridge Centre of Excellence`
        )
      }

      counts[i % counts.length].count++
    }

    await loadAll(user)
    // Show WA batch modal so PM can send WA messages one-by-one
    if (waQueue.length) setAutoAssignWA(waQueue)
    else showToast(`${unassigned.length} leads auto-assigned`, 'info')
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
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      {/* Left panel */}
      <div style={{ width:280, background:'var(--accent)', padding:'40px 32px', display:'flex', flexDirection:'column', justifyContent:'center', flexShrink:0 }} className="hidden md:flex">
        <div style={{ width:32, height:32, background:'rgba(255,255,255,.15)', borderRadius:6, display:'grid', placeItems:'center', color:'#fff', fontWeight:600, fontSize:13, marginBottom:24 }}>CC</div>
        <h1 style={{ color:'#fff', fontSize:20, fontWeight:600, lineHeight:1.3, letterSpacing:'-.01em' }}>Cambridge Center<br/>of Excellence</h1>
        <p style={{ color:'rgba(255,255,255,.65)', fontSize:12.5, marginTop:10, lineHeight:1.6 }}>Integrated CRM, Lead Pipeline, Payments &amp; Admissions.</p>
        <div style={{ marginTop:28, display:'flex', flexDirection:'column', gap:8 }}>
          {['Role-based dashboards','Lead assignment & tracking','Marketer registration links','Paystack payment integration','Finance & Admissions portals'].map(f => (
            <div key={f} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'rgba(255,255,255,.7)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>{f}
            </div>
          ))}
        </div>
      </div>
      {/* Right — account picker */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div className="fade-up" style={{ width:'100%', maxWidth:360 }}>
          <div style={{ marginBottom:8, display:'flex', alignItems:'center', gap:8 }} className="md:hidden">
            <div style={{ width:28, height:28, background:'var(--accent)', borderRadius:5, display:'grid', placeItems:'center', color:'#fff', fontWeight:600, fontSize:11 }}>CC</div>
            <span style={{ fontWeight:600, fontSize:14, color:'var(--ink)' }}>CCE ERP</span>
          </div>
          <h2 style={{ fontSize:16, fontWeight:600, color:'var(--ink)', marginBottom:3 }}>Welcome back</h2>
          <p style={{ color:'var(--ink-3)', fontSize:12.5, marginBottom:20 }}>Select your account to continue</p>
          {loading ? <Spinner size={20}/> : staff.length === 0 ? (
            <div className="panel" style={{ padding:16, textAlign:'center' }}>
              <p style={{ fontSize:12.5, color:'var(--ink-2)' }}>No staff found. Run the SQL schema first.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {staff.map(s => (
                <button key={s.id} onClick={() => login(s)} className="panel press"
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'10px 14px', cursor:'pointer', border:'1px solid var(--border)', borderRadius:'var(--r)', background:'var(--panel)', transition:'border-color .12s', textAlign:'left' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
                >
                  <Avatar name={s.name} size={34}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{s.name}</div>
                    <div style={{ fontSize:10.5, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.04em', marginTop:1 }}>{s.role}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color:'var(--ink-3)' }}><polyline points="9 18 15 12 9 6"/></svg>
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
    { id: 'dashboard',    label: 'Dashboard',    icon: Icon.dashboard,    roles: 'all' },
    { id: 'leads',        label: 'Leads',         count: myLeads.length, icon: Icon.leads, roles: 'all' },
    { id: 'pipeline',     label: 'Pipeline',      icon: Icon.pipeline,     roles: 'all' },
    { id: 'add',          label: 'Add Lead',      icon: Icon.add,          roles: ['pm','admin','marketer','receptionist'] },
    { id: 'my_leads',     label: 'My Leads',      icon: Icon.target,       roles: ['marketer'] },
    { id: 'analytics',    label: 'Analytics',     icon: Icon.analytics,    roles: 'all' },
    { id: 'calendar',     label: 'Calendar',      icon: Icon.calendar,     roles: ['pm','admin','marketer'] },
    { id: 'finance',      label: 'Finance',       icon: Icon.finance,      roles: ['pm','admin','finance'] },
    { id: 'admission',    label: 'Admissions',    icon: Icon.admission,    roles: ['pm','admin','admission'] },
    { id: 'bulk_sms',     label: 'Bulk SMS',      icon: Icon.bulksms,      roles: ['pm','admin'] },
    { id: 'reports',      label: 'Reports',       icon: Icon.reports,      roles: ['pm','admin'] },
    { id: 'import',       label: 'Import Leads',  icon: Icon.import,       roles: ['pm','admin'] },
    { id: 'targets',      label: 'Targets',       icon: Icon.targets,      roles: ['pm','admin'] },
    { id: 'documents',    label: 'Documents',     icon: Icon.docs,         roles: ['pm','admin'] },
    { id: 'classes',      label: 'Classes',       icon: Icon.courses,      roles: ['pm','admin'] },
    { id: 'instructor',   label: 'My Classes',    icon: Icon.courses,      roles: ['instructor'] },
    { id: 'staff',        label: 'Staff',         icon: Icon.staff,        roles: ['pm','admin'] },
    { id: 'courses',      label: 'Courses',       icon: Icon.courses,      roles: ['pm','admin'] },
    { id: 'integrations', label: 'Integrations',  icon: Icon.integrations, roles: ['pm','admin'] },
  ].filter(item => item.roles === 'all' || item.roles.includes(user?.role))

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', display:'flex' }}>
      {sidebarOpen && <div className="fixed inset-0 z-40 md:hidden" style={{ background:'rgba(20,20,22,.28)' }} onClick={() => setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside style={{ position:'fixed', top:0, left:0, height:'100vh', width:208, background:'var(--panel)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', zIndex:50, transition:'transform .2s', transform: sidebarOpen ? 'translateX(0)' : undefined }} className={sidebarOpen ? '' : '-translate-x-full md:translate-x-0'}>
        {/* Brand */}
        <div style={{ height:48, display:'flex', alignItems:'center', padding:'0 14px', borderBottom:'1px solid var(--border)', gap:9, flexShrink:0 }}>
          <div style={{ width:26, height:26, background:'var(--accent)', borderRadius:5, display:'grid', placeItems:'center', color:'#fff', fontWeight:600, fontSize:11, flexShrink:0 }}>CC</div>
          <div>
            <div style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)', letterSpacing:'-.01em' }}>CCE ERP</div>
            <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:1 }}>Cambridge Centre</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{ flex:1, padding:8, overflowY:'auto', display:'flex', flexDirection:'column', gap:1 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => nav(item.id)}
              className={`nav-item w-full ${page === item.id && !selectedLead ? 'active' : ''}`}
              style={{ border:'none', background:'none', textAlign:'left' }}>
              {item.icon}
              <span style={{ flex:1 }}>{item.label}</span>
              {item.count != null && <span style={{ fontSize:10.5, color:'var(--ink-3)', fontFamily:'IBM Plex Mono,monospace' }}>{item.count}</span>}
            </button>
          ))}
        </nav>
        {/* User footer */}
        <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:9 }}>
          <Avatar name={user.name} size={26}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:500, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.name}</div>
            <div style={{ fontSize:10, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.04em' }}>{user.role}</div>
          </div>
          <button onClick={logout} title="Logout" className="press" style={{ color:'var(--ink-3)', background:'none', border:'none', cursor:'pointer', lineHeight:1, padding:4 }}
            onMouseEnter={e => e.currentTarget.style.color='var(--bad)'}
            onMouseLeave={e => e.currentTarget.style.color='var(--ink-3)'}
          >{Icon.logout}</button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:'100vh' }} className="md:ml-[208px]" id="main-col">
        {/* Topbar */}
        <header style={{ height:48, background:'var(--panel)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:12, position:'sticky', top:0, zIndex:30, flexShrink:0 }}>
          <button className="md:hidden press" onClick={() => setSidebarOpen(true)} style={{ color:'var(--ink-2)', background:'none', border:'none', cursor:'pointer', lineHeight:1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          {/* Breadcrumb */}
          <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, color:'var(--ink-3)' }}>
            <span>CCE</span>
            <span style={{ color:'var(--border-strong)' }}>/</span>
            {selectedLead ? (
              <>
                <button onClick={() => setSelectedLead(null)} style={{ color:'var(--ink-2)', background:'none', border:'none', cursor:'pointer', fontSize:12.5 }}>{navItems.find(n => n.id === page)?.label}</button>
                <span style={{ color:'var(--border-strong)' }}>/</span>
                <span style={{ color:'var(--ink)', fontWeight:600 }} className="truncate">{selectedLead.name}</span>
              </>
            ) : (
              <b style={{ color:'var(--ink)', fontWeight:600 }}>{navItems.find(n => n.id === page)?.label || 'Dashboard'}</b>
            )}
          </div>
          {/* Search */}
          <button onClick={() => setShowPalette(true)}
            className="hidden md:flex"
            style={{ marginLeft:8, flex:1, maxWidth:300, height:30, border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'0 10px 0 28px', fontSize:12.5, color:'var(--ink-3)', background:'var(--bg)', cursor:'text', alignItems:'center', position:'relative', gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span style={{ flex:1 }}>Search…</span>
            <kbd style={{ fontSize:9, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:3, padding:'1px 4px', fontFamily:'IBM Plex Mono,monospace' }}>⌘K</kbd>
          </button>
          <div style={{ flex:1 }} className="hidden md:block"/>
          {/* Notifications */}
          <div style={{ position:'relative' }}>
            <button onClick={() => setShowNotifs(!showNotifs)} className="press"
              style={{ width:30, height:30, border:'1px solid var(--border)', borderRadius:'var(--r)', background:'var(--panel)', display:'grid', placeItems:'center', cursor:'pointer', color:'var(--ink-2)', position:'relative' }}>
              {Icon.bell}
              {unread > 0 && <span style={{ position:'absolute', top:3, right:3, width:7, height:7, background:'var(--bad)', borderRadius:'50%' }}/>}
            </button>
            {showNotifs && (
              <div className="panel fade-up" style={{ position:'absolute', right:0, top:38, width:300, zIndex:50, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,.1)' }}>
                <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>Notifications {unread > 0 && <span style={{ color:'var(--accent)' }}>({unread})</span>}</span>
                  <div style={{ display:'flex', gap:8 }}>
                    {unread > 0 && <button onClick={markAllRead} style={{ fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer' }}>Mark all read</button>}
                    <button onClick={() => setShowNotifs(false)} style={{ color:'var(--ink-3)', background:'none', border:'none', cursor:'pointer', lineHeight:1 }}>{Icon.x}</button>
                  </div>
                </div>
                <div style={{ maxHeight:320, overflowY:'auto' }}>
                  {notifications.length === 0
                    ? <div style={{ padding:'28px 14px', textAlign:'center', fontSize:12, color:'var(--ink-3)' }}>No notifications</div>
                    : notifications.map(n => (
                      <div key={n.id}
                        onClick={() => { markNotifRead(n.id); setShowNotifs(false); if (n.lead_id) { const l = leads.find(x => x.id === n.lead_id); if (l) nav('leads', l) } }}
                        style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: !n.is_read ? 'var(--accent-wash)' : undefined }}>
                        <div style={{ display:'flex', gap:8 }}>
                          {!n.is_read && <div className="live-dot" style={{ marginTop:4, flexShrink:0 }}/>}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12.5, fontWeight:500, color:'var(--ink)' }}>{n.title}</div>
                            <div style={{ fontSize:11.5, color:'var(--ink-2)', marginTop:2 }}>{n.message}</div>
                            <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:3 }}>{timeAgo(n.created_at)}</div>
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
        <main style={{ flex:1, padding:18 }}>
          {loading ? <Spinner size={24}/> : (
            <>
              {page === 'dashboard'    && <Dashboard user={user} isPM={isPM} isMarketer={isMarketer} leads={leads} myLeads={myLeads} staff={staff} nav={nav} onAutoAssign={autoAssign}/>}
              {page === 'leads'        && !selectedLead && <LeadList leads={myLeads} isPM={isPM} staff={staff} onSelect={l => { setSelectedLead(l) }}/>}
              {page === 'leads'        && selectedLead && <LeadDetail lead={selectedLead} staff={staff} user={user} isPM={isPM} isMarketer={isMarketer} sb={sb} onAssign={assignLead} onStatusChange={updateStatus} onRegLink={sendRegLink} onRefresh={() => loadAll(user)}/>}
              {page === 'pipeline'     && <Pipeline leads={myLeads} isPM={isPM} onStatusChange={updateStatus} onSelect={l => nav('leads', l)}/>}
              {page === 'my_leads'     && <MyLeads leads={myLeads} user={user} staff={staff} onSelect={l => { setSelectedLead(l); setPage('leads') }} onAddPersonal={() => nav('add_personal')} nav={nav}/>}
              {page === 'add'          && <AddLead courses={courses} onSubmit={addLead} onDone={() => nav('leads')} isPM={isPM}/>}
              {page === 'add_personal' && <AddLead courses={courses} onSubmit={addPersonalLead} onDone={() => nav('my_leads')} personal/>}
              {page === 'analytics'    && <Analytics leads={leads} staff={staff} user={user} isPM={isPM}/>}
              {page === 'calendar'     && <CalendarView leads={myLeads} sb={sb}/>}
              {page === 'finance'      && <Finance sb={sb} staff={staff} leads={leads} user={user}/>}
              {page === 'admission'    && <Admission sb={sb} staff={staff} leads={leads} user={user}/>}
              {page === 'bulk_sms'     && isPM && <BulkSMS leads={leads} staff={staff} sb={sb} user={user}/>}
              {page === 'reports'      && isPM && <Reports leads={leads} staff={staff} sb={sb}/>}
              {page === 'import'       && isPM && <LeadImport sb={sb} leads={leads} user={user} onDone={() => { loadAll(user); nav('leads') }}/>}
              {page === 'targets'      && isPM && <MarketerTargets sb={sb} staff={staff} leads={leads}/>}
              {page === 'documents'    && isPM && <Documents sb={sb} user={user} leads={leads}/>}
              {page === 'staff'        && isPM && <StaffManager staff={staff} sb={sb} onRefresh={() => loadAll(user)}/>}
              {page === 'courses'      && isPM && <CourseManager courses={courses} sb={sb} onRefresh={() => loadAll(user)}/>}
              {page === 'integrations' && isPM && <Integrations sb={sb}/>}
              {page === 'classes'      && isPM && <CohortManager sb={sb} staff={staff} courses={courses} user={user}/>}
              {page === 'instructor'   && user?.role === 'instructor' && <InstructorDashboard sb={sb} user={user}/>}
            </>
          )}
        </main>
      </div>

      {/* Command Palette */}
      {showPalette && (
        <CommandPalette
          leads={leads}
          staff={staff}
          nav={(p, lead) => { nav(p, lead); setShowPalette(false) }}
          onClose={() => setShowPalette(false)}
        />
      )}

      {/* Auto-assign WhatsApp batch modal */}
      {autoAssignWA && (
        <div style={{ position:'fixed', inset:0, zIndex:150, background:'rgba(20,20,22,.28)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="panel" style={{ width:'100%', maxWidth:420, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,.12)' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--ink)' }}>Send WhatsApp Messages</div>
              <div style={{ fontSize:11.5, color:'var(--ink-3)', marginTop:2 }}>{autoAssignWA.length} lead{autoAssignWA.length > 1 ? 's' : ''} assigned · SMS sent automatically</div>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {autoAssignWA.map(({ lead, marketer, phone, waMsg }) => (
                <div key={lead.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 16px', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:500, color:'var(--ink)' }}>{lead.name}</div>
                    <div style={{ fontSize:11.5, color:'var(--ink-3)' }}>{lead.phone}{lead.course_interest ? ` · ${lead.course_interest}` : ''}</div>
                    <div style={{ fontSize:11, color:'var(--accent)', marginTop:1 }}>→ {marketer.name}</div>
                  </div>
                  <a href={`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noreferrer"
                    className="btn btn-primary btn-sm press">WA</a>
                </div>
              ))}
            </div>
            <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
              <button onClick={() => autoAssignWA.forEach(({ phone, waMsg }) => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, '_blank'))}
                className="btn btn-primary press" style={{ flex:1 }}>Open All ({autoAssignWA.length})</button>
              <button onClick={() => { setAutoAssignWA(null); showToast(`${autoAssignWA.length} leads auto-assigned`, 'info') }}
                className="btn press" style={{ flex:1 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fade-up" style={{ position:'fixed', bottom:16, right:16, zIndex:200, maxWidth:300, padding:'10px 14px', borderRadius:'var(--r)', boxShadow:'0 4px 16px rgba(0,0,0,.14)', fontSize:12.5, fontWeight:500, color:'#fff', display:'flex', alignItems:'flex-start', gap:9, background: toast.type === 'new_lead' ? 'var(--accent)' : 'var(--ink)' }}>
          <div className="live-dot" style={{ marginTop:4, flexShrink:0 }}/>
          <div style={{ flex:1, lineHeight:1.5 }}>{toast.msg}</div>
          <button onClick={() => setToast(null)} style={{ color:'rgba(255,255,255,.6)', background:'none', border:'none', cursor:'pointer', fontSize:13, lineHeight:1 }}>✕</button>
        </div>
      )}
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
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        <div style={{ position:'relative', flex:1, minWidth:192 }}>
          <svg style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--ink-3)' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, course…" className="inp" style={{ paddingLeft:28 }}/>
        </div>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className="inp" style={{ width:'auto' }}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={sourceF} onChange={e => setSourceF(e.target.value)} className="inp" style={{ width:'auto' }}>
          <option value="all">All Sources</option>
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="inp" style={{ width:'auto' }}>
          <option value="created_at">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="status">By Status</option>
        </select>
      </div>
      <div style={{ fontSize:11.5, color:'var(--ink-3)' }}>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</div>
      <div className="panel" style={{ overflow:'hidden' }}>
        {filtered.length === 0 ? <EmptyState title="No leads match your filters"/> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th className="hidden sm:table-cell">Phone</th><th>Status</th><th className="hidden md:table-cell">Score</th><th className="hidden md:table-cell">Source</th><th className="hidden lg:table-cell">Course</th><th className="hidden md:table-cell">Marketer</th><th className="hidden lg:table-cell">Date</th></tr></thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} onClick={() => onSelect(l)}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <Avatar name={l.name} size={30}/>
                      <div>
                        <div style={{ fontWeight:500, color:'var(--ink)' }}>{l.name}</div>
                        <div style={{ display:'flex', gap:5, marginTop:2 }}>
                          {l.whatsapp_sent && <span style={{ fontSize:9, color:'var(--ok)', fontWeight:600 }}>WA ✓</span>}
                          {l.source === 'personal' && <span style={{ fontSize:9, color:'var(--accent)', fontWeight:600 }}>Personal</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell" style={{ color:'var(--ink-2)', fontSize:12 }}>{l.phone}</td>
                  <td><Badge status={l.status}/></td>
                  <td className="hidden md:table-cell"><ScoreBadge score={leadScore(l)}/></td>
                  <td className="hidden md:table-cell"><span className="tag">{l.source}</span></td>
                  <td className="hidden lg:table-cell" style={{ color:'var(--ink-2)', fontSize:12, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.course_interest || '—'}</td>
                  <td className="hidden md:table-cell">
                    {l.assignee
                      ? <div style={{ display:'flex', alignItems:'center', gap:6 }}><Avatar name={l.assignee.name} size={22}/><span style={{ fontSize:12, color:'var(--ink-2)' }}>{l.assignee.name}</span></div>
                      : <span style={{ fontSize:12, color:'var(--ink-3)' }}>—</span>}
                  </td>
                  <td className="hidden lg:table-cell" style={{ color:'var(--ink-3)', fontSize:11.5 }}>{timeAgo(l.created_at)}</td>
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
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)', letterSpacing:'-.01em' }}>My Leads</h1>
          <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>Your assigned &amp; personal leads + conversion stats</p>
        </div>
        <button onClick={() => nav('add_personal')} className="btn btn-primary">+ Personal Lead</button>
      </div>

      {/* My conversion stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
        <div className="stat-card"><div className="stat-value">{leads.length}</div><div className="stat-label">Total Assigned</div></div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: convRate >= 30 ? 'var(--ok)' : convRate >= 15 ? 'var(--warn)' : 'var(--bad)' }}>{convRate}%</div>
          <div className="stat-label">Overall Conversion</div>
        </div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--info)' }}>{monthConv}%</div><div className="stat-label">This Month's Rate</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--accent)' }}>{personalLeads.length}</div><div className="stat-label">Personal Leads</div></div>
      </div>

      {/* Registered leads */}
      <div className="panel" style={{ overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Registered (Paid) — {registered.length}</div>
            <div style={{ fontSize:11.5, color:'var(--ink-3)', marginTop:2 }}>These leads have paid registration fees</div>
          </div>
        </div>
        {registered.length === 0 ? (
          <EmptyState title="No registrations yet" sub="Keep pushing — you're doing great!"/>
        ) : (
          <table className="data-table">
            <thead><tr><th>Student</th><th>Course</th><th className="hidden sm:table-cell">Reg Fee</th><th className="hidden md:table-cell">Date</th><th>Source</th></tr></thead>
            <tbody>
              {registered.map(l => (
                <tr key={l.id} onClick={() => onSelect(l)}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <Avatar name={l.name} size={30}/>
                      <div>
                        <div style={{ fontWeight:500, color:'var(--ink)' }}>{l.name}</div>
                        <div style={{ fontSize:10.5, color:'var(--ink-3)' }}>{l.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize:12, color:'var(--ink-2)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.course_interest || '—'}</td>
                  <td className="hidden sm:table-cell" style={{ fontWeight:600, color:'var(--ok)', fontSize:13 }}>{l.reg_fee_paid ? fmtCurrency(l.reg_fee_paid) : '—'}</td>
                  <td className="hidden md:table-cell" style={{ fontSize:12, color:'var(--ink-3)' }}>{fmtDate(l.reg_paid_at || l.updated_at)}</td>
                  <td><span className="tag">{l.source}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Personal leads section */}
      {personalLeads.length > 0 && (
        <div className="panel" style={{ overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>My Personal Leads — {personalLeads.length}</div>
            <div style={{ fontSize:11.5, color:'var(--ink-3)', marginTop:2 }}>Leads you sourced yourself</div>
          </div>
          {personalLeads.map(l => (
            <div key={l.id} onClick={() => onSelect(l)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--row-hover)'}
              onMouseLeave={e => e.currentTarget.style.background=''}>
              <Avatar name={l.name} size={30}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:500, color:'var(--ink)' }}>{l.name}</div>
                <div style={{ fontSize:11, color:'var(--ink-3)' }}>{l.phone} · {l.course_interest || '—'}</div>
              </div>
              <Badge status={l.status}/>
            </div>
          ))}
        </div>
      )}
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
    <div className="fade-up" style={{ maxWidth:520 }}>
      <h1 style={{ fontSize:16, fontWeight:600, color:'var(--ink)', marginBottom:16 }}>{personal ? '+ Add Personal Lead' : '+ Add New Lead'}</h1>
      {personal && (
        <div style={{ background:'var(--accent-wash)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:12, marginBottom:14, fontSize:12, color:'var(--accent-ink)' }}>
          This lead will be added as your personal lead — it will be assigned directly to you.
        </div>
      )}
      <div className="panel" style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
        <div><Label required>Full Name</Label><input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Kwame Asante" className="inp"/></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><Label>Phone</Label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0244 000 000" type="tel" className="inp"/></div>
          <div><Label>Email</Label><input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" type="email" className="inp"/></div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {!personal && (
            <div><Label>Source</Label>
              <select value={form.source} onChange={e => set('source', e.target.value)} className="inp">
                {SOURCES.filter(s => s !== 'personal').map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          )}
          <div><Label>City</Label><input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Accra" className="inp"/></div>
        </div>
        <div><Label>Course Interest</Label>
          <select value={form.course_interest} onChange={e => set('course_interest', e.target.value)} className="inp">
            <option value="">Select a course…</option>
            {courses.map(c => <option key={c.id} value={c.name}>{c.name} ({c.mode})</option>)}
          </select>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, alignItems:'end' }}>
          <div><Label>Mode Preference</Label>
            <select value={form.mode_preference} onChange={e => set('mode_preference', e.target.value)} className="inp">
              <option value="">No preference</option>
              <option value="in-person">In-Person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--ink-2)', paddingBottom:4, cursor:'pointer' }}>
            <input type="checkbox" checked={form.scholarship_interest} onChange={e => set('scholarship_interest', e.target.checked)} style={{ width:14, height:14, accentColor:'var(--accent)' }}/>
            Needs scholarship
          </label>
        </div>
        <div><Label>Notes</Label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…" className="inp" rows="3"/></div>
        <button onClick={submit} disabled={!form.name.trim() || saving} className="btn btn-primary press" style={{ width:'100%' }}>
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
    <div className="fade-up" style={{ maxWidth:640 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontSize:16, fontWeight:600, color:'var(--ink)' }}>Staff ({staff.length})</h1>
        <button onClick={() => setEditing({ name: '', email: '', phone: '', role: 'marketer', is_active: true })} className="btn btn-primary btn-sm">+ Add Staff</button>
      </div>
      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'New'} Staff`} onClose={() => setEditing(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div><Label required>Full Name</Label><input value={editing.name||''} onChange={e => setEditing({...editing,name:e.target.value})} className="inp"/></div>
            <div><Label>Email</Label><input value={editing.email||''} onChange={e => setEditing({...editing,email:e.target.value})} type="email" className="inp"/></div>
            <div><Label>Phone</Label><input value={editing.phone||''} onChange={e => setEditing({...editing,phone:e.target.value})} type="tel" className="inp"/></div>
            <div><Label>Role</Label>
              <select value={editing.role} onChange={e => setEditing({...editing,role:e.target.value})} className="inp">
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button onClick={save} disabled={!editing.name||saving} className="btn btn-primary" style={{ flex:1 }}>{saving?'Saving…':'Save'}</button>
            <button onClick={() => setEditing(null)} className="btn btn-ghost" style={{ flex:1 }}>Cancel</button>
          </div>
        </Modal>
      )}
      <div className="panel" style={{ overflow:'hidden' }}>
        {staff.length === 0 ? <EmptyState title="No staff yet"/> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th className="hidden sm:table-cell">Contact</th><th>Actions</th></tr></thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td><div style={{ display:'flex', alignItems:'center', gap:10 }}><Avatar name={s.name} size={30}/><span style={{ fontWeight:500, color:'var(--ink)' }}>{s.name}</span></div></td>
                  <td><span className="tag">{s.role}</span></td>
                  <td className="hidden sm:table-cell" style={{ fontSize:12, color:'var(--ink-2)' }}>{s.email||s.phone||'—'}</td>
                  <td><div style={{ display:'flex', gap:6 }}><button onClick={() => setEditing(s)} className="btn btn-ghost btn-sm">{Icon.edit}</button><button onClick={() => del(s.id)} className="btn btn-danger btn-sm">{Icon.trash}</button></div></td>
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
    <div className="fade-up" style={{ maxWidth:640 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h1 style={{ fontSize:16, fontWeight:600, color:'var(--ink)' }}>Courses ({courses.length})</h1>
        <button onClick={() => setEditing({ name:'',description:'',mode:'in-person',duration:'',fee:0,reg_fee:150,scholarship_available:false,is_active:true })} className="btn btn-primary btn-sm">+ Add Course</button>
      </div>
      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'New'} Course`} onClose={() => setEditing(null)}>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div><Label required>Course Name</Label><input value={editing.name||''} onChange={e => setEditing({...editing,name:e.target.value})} className="inp"/></div>
            <div><Label>Description</Label><textarea value={editing.description||''} onChange={e => setEditing({...editing,description:e.target.value})} className="inp" rows="2"/></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><Label>Mode</Label>
                <select value={editing.mode} onChange={e => setEditing({...editing,mode:e.target.value})} className="inp">
                  <option value="in-person">In-Person</option><option value="online">Online</option><option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div><Label>Duration</Label><input value={editing.duration||''} onChange={e => setEditing({...editing,duration:e.target.value})} placeholder="e.g. 3 months" className="inp"/></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><Label>Course Fee (GH₵)</Label><input type="number" value={editing.fee||''} onChange={e => setEditing({...editing,fee:Number(e.target.value)})} className="inp"/></div>
              <div><Label>Registration Fee (GH₵)</Label><input type="number" value={editing.reg_fee||150} onChange={e => setEditing({...editing,reg_fee:Number(e.target.value)})} className="inp"/></div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--ink-2)', cursor:'pointer' }}>
              <input type="checkbox" checked={editing.scholarship_available} onChange={e => setEditing({...editing,scholarship_available:e.target.checked})} style={{ accentColor:'var(--accent)' }}/>
              Scholarship available
            </label>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button onClick={save} disabled={!editing.name||saving} className="btn btn-primary" style={{ flex:1 }}>{saving?'Saving…':'Save'}</button>
            <button onClick={() => setEditing(null)} className="btn btn-ghost" style={{ flex:1 }}>Cancel</button>
          </div>
        </Modal>
      )}
      <div className="panel" style={{ overflow:'hidden' }}>
        {courses.length === 0 ? <EmptyState title="No courses yet"/> : (
          <table className="data-table">
            <thead><tr><th>Course</th><th>Mode</th><th className="hidden sm:table-cell">Duration</th><th>Course Fee</th><th>Reg. Fee</th><th>Actions</th></tr></thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight:500, color:'var(--ink)' }}>{c.name}</div>
                    {c.scholarship_available && <div style={{ fontSize:10, color:'var(--accent)', fontWeight:600, marginTop:1 }}>Scholarship</div>}
                  </td>
                  <td><span className="tag">{c.mode}</span></td>
                  <td className="hidden sm:table-cell" style={{ fontSize:12, color:'var(--ink-2)' }}>{c.duration||'—'}</td>
                  <td style={{ fontWeight:600, color:'var(--ink)', fontSize:13 }}>{fmtCurrency(c.fee)}</td>
                  <td style={{ fontWeight:600, color:'var(--info)', fontSize:13 }}>{fmtCurrency(c.reg_fee||150)}</td>
                  <td><div style={{ display:'flex', gap:6 }}><button onClick={() => setEditing(c)} className="btn btn-ghost btn-sm">{Icon.edit}</button><button onClick={() => del(c.id)} className="btn btn-danger btn-sm">{Icon.trash}</button></div></td>
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
    <div className="fade-up" style={{ maxWidth:640, display:'flex', flexDirection:'column', gap:14 }}>
      <h1 style={{ fontSize:16, fontWeight:600, color:'var(--ink)' }}>Integrations</h1>

      {/* Paystack */}
      <div className="panel" style={{ padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{ width:36, height:36, background:'#0f766e', borderRadius:'var(--r)', display:'grid', placeItems:'center', color:'#fff', fontWeight:700, fontSize:14, flexShrink:0 }}>₵</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Paystack Payments</div>
            <div style={{ fontSize:11.5, color:'var(--ink-3)' }}>Registration fee collection via Paystack</div>
          </div>
          <span className="badge" style={{ marginLeft:'auto' }}>
            <span className="dot" style={{ background: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ? 'var(--ok)' : 'var(--warn)' }}/>
            {import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ? 'Configured' : 'Needs Key'}
          </span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, fontSize:12 }}>
          <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:12 }}>
            <div style={{ fontWeight:600, color:'var(--ink)', marginBottom:6 }}>Paystack Webhook URL</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <code style={{ flex:1, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:4, padding:'4px 8px', fontFamily:'IBM Plex Mono,monospace', fontSize:10.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{psWebhook}</code>
              <button onClick={() => copyUrl(psWebhook,'ps')} className="btn btn-ghost btn-sm" style={{ flexShrink:0 }}>{copied==='ps' ? Icon.check : Icon.copy}</button>
            </div>
            <div style={{ color:'var(--ink-3)', marginTop:4 }}>Add this in Paystack Dashboard → Settings → Webhooks</div>
          </div>
          <div style={{ background:'var(--accent-wash)', borderRadius:'var(--r)', padding:12, display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ fontWeight:600, color:'var(--accent-ink)' }}>Setup:</div>
            <div style={{ color:'var(--ink-2)' }}>1. Add <code>VITE_PAYSTACK_PUBLIC_KEY</code> to Vercel env vars</div>
            <div style={{ color:'var(--ink-2)' }}>2. Add <code>PAYSTACK_SECRET_KEY</code> to Vercel env vars (server only)</div>
            <div style={{ color:'var(--ink-2)' }}>3. Set registration fees per course in the Courses section</div>
            <div style={{ color:'var(--ink-2)' }}>4. Add the webhook URL above in Paystack Dashboard</div>
          </div>
        </div>
      </div>

      {/* Facebook */}
      <div className="panel" style={{ padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <div style={{ width:36, height:36, background:'#1d4ed8', borderRadius:'var(--r)', display:'grid', placeItems:'center', color:'#fff', flexShrink:0 }}>{Icon.fb}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Facebook Lead Ads</div>
            <div style={{ fontSize:11.5, color:'var(--ink-3)' }}>Auto-capture leads from Facebook ad forms</div>
          </div>
          <span className="badge" style={{ marginLeft:'auto' }}>
            <span className="dot" style={{ background: fbConfig ? 'var(--ok)' : 'var(--muted)' }}/>
            {fbConfig ? 'Connected' : 'Not set up'}
          </span>
        </div>
        {loading ? <Spinner size={16}/> : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:12 }}>
              <div style={{ fontWeight:600, color:'var(--ink)', fontSize:12, marginBottom:6 }}>Webhook URL</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <code style={{ flex:1, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:4, padding:'4px 8px', fontFamily:'IBM Plex Mono,monospace', fontSize:10.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fbWebhook}</code>
                <button onClick={() => copyUrl(fbWebhook,'fb')} className="btn btn-ghost btn-sm" style={{ flexShrink:0 }}>{copied==='fb' ? Icon.check : Icon.copy}</button>
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
      <div className="panel" style={{ padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <div style={{ width:36, height:36, background:'#16a34a', borderRadius:'var(--r)', display:'grid', placeItems:'center', color:'#fff', fontWeight:700, fontSize:13, flexShrink:0 }}>G</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Google Sheets Sync</div>
            <div style={{ fontSize:11.5, color:'var(--ink-3)' }}>Auto-log every registration to a shared sheet</div>
          </div>
          <span className="badge" style={{ marginLeft:'auto' }}>
            <span className="dot" style={{ background:'var(--muted)' }}/>Via Webhook
          </span>
        </div>
        <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:12, fontSize:12, color:'var(--ink-2)', display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ fontWeight:600, color:'var(--ink)' }}>How to set up:</div>
          <div>1. Open Google Sheets → Extensions → Apps Script</div>
          <div>2. Create a <code>doPost(e)</code> function that writes to your sheet</div>
          <div>3. Deploy as Web App → Anyone (with link) → Copy the URL</div>
          <div>4. Add <code>VITE_SHEETS_WEBHOOK_URL</code> to your Vercel environment</div>
          <div style={{ color:'var(--ink-3)' }}>Every successful registration payment will POST student data to your sheet automatically.</div>
        </div>
      </div>
    </div>
  )
}
