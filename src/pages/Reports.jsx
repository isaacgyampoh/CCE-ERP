import { useState } from 'react'
import { Icon, Badge } from '@/components/ui'
import { fmtDate, fmtCurrency, pct } from '@/lib/helpers'
import { STATUS } from '@/lib/constants'

function downloadCSV(rows, filename) {
  const csv = rows
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

export default function Reports({ leads, staff, sb }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [exporting, setExporting] = useState('')

  const inRange = (ts) => {
    if (!ts) return true
    const d = new Date(ts)
    if (dateFrom && d < new Date(dateFrom)) return false
    if (dateTo   && d > new Date(dateTo + 'T23:59:59')) return false
    return true
  }

  const filtered   = leads.filter(l => inRange(l.created_at))
  const registered = filtered.filter(l => l.status === 'registered')
  const revenue    = registered.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)
  const marketers  = staff.filter(s => s.role === 'marketer')

  const exportLeads = async () => {
    setExporting('leads')
    downloadCSV([
      ['Name', 'Phone', 'Email', 'Source', 'Status', 'Course Interest', 'Mode', 'City', 'Marketer', 'Scholarship', 'WA Sent', 'Created'],
      ...filtered.map(l => [
        l.name, l.phone || '', l.email || '',
        l.source, STATUS[l.status]?.label || l.status,
        l.course_interest || '', l.mode_preference || '', l.city || '',
        l.assignee?.name || 'Unassigned',
        l.scholarship_interest ? 'Yes' : 'No',
        l.whatsapp_sent ? 'Yes' : 'No',
        fmtDate(l.created_at),
      ]),
    ], 'cce-all-leads')
    setExporting('')
  }

  const exportRegistered = async () => {
    setExporting('registered')
    downloadCSV([
      ['Name', 'Phone', 'Email', 'Course', 'Marketer', 'Reg Fee Paid (GHS)', 'Paid At'],
      ...registered.map(l => [
        l.name, l.phone || '', l.email || '',
        l.course_interest || '',
        l.assignee?.name || 'Unassigned',
        l.reg_fee_paid || 0,
        fmtDate(l.reg_paid_at),
      ]),
    ], 'cce-registered-students')
    setExporting('')
  }

  const exportMarketerPerf = async () => {
    setExporting('perf')
    downloadCSV([
      ['Marketer', 'Total Assigned', 'Contacted', 'Follow-up', 'Pending Reg', 'Registered', 'Conv. Rate %', 'Revenue (GHS)'],
      ...marketers.map(m => {
        const mine       = filtered.filter(l => l.assigned_to === m.id)
        const contacted  = mine.filter(l => ['contacted','follow_up','pending_registration','registered'].includes(l.status)).length
        const followUp   = mine.filter(l => l.status === 'follow_up').length
        const pendingReg = mine.filter(l => l.status === 'pending_registration').length
        const reg        = mine.filter(l => l.status === 'registered')
        const convRate   = pct(reg.length, mine.length)
        const rev        = reg.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)
        return [m.name, mine.length, contacted, followUp, pendingReg, reg.length, convRate, rev]
      }),
    ], 'cce-marketer-performance')
    setExporting('')
  }

  const exportPipeline = async () => {
    setExporting('pipeline')
    const { data: comments } = await sb
      .from('lead_comments')
      .select('lead_id, staff_name, comment, status_change, created_at')
      .order('created_at', { ascending: true })

    const commentsByLead = {}
    ;(comments || []).forEach(c => {
      if (!commentsByLead[c.lead_id]) commentsByLead[c.lead_id] = []
      commentsByLead[c.lead_id].push(c)
    })

    downloadCSV([
      ['Name', 'Phone', 'Email', 'Source', 'Status', 'Course', 'Marketer', 'Created', 'Last Activity', 'Comment Count'],
      ...filtered.map(l => [
        l.name, l.phone || '', l.email || '',
        l.source, STATUS[l.status]?.label || l.status,
        l.course_interest || '', l.assignee?.name || 'Unassigned',
        fmtDate(l.created_at), fmtDate(l.updated_at),
        (commentsByLead[l.id] || []).length,
      ]),
    ], 'cce-pipeline-full')
    setExporting('')
  }

  const exportOptions = [
    {
      key: 'leads',
      title: 'All Leads',
      sub: `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`,
      desc: 'Name, phone, email, source, status, course, marketer, city, dates',
      action: exportLeads,
    },
    {
      key: 'registered',
      title: 'Registered Students',
      sub: `${registered.length} record${registered.length !== 1 ? 's' : ''} · ${fmtCurrency(revenue)}`,
      desc: 'Paid students with course, marketer, reg fee, and payment date',
      action: exportRegistered,
    },
    {
      key: 'perf',
      title: 'Marketer Performance',
      sub: `${marketers.length} marketer${marketers.length !== 1 ? 's' : ''}`,
      desc: 'Per-marketer: leads, contacted, follow-up, registered, conversion rate, revenue',
      action: exportMarketerPerf,
    },
    {
      key: 'pipeline',
      title: 'Full Pipeline + Activity',
      sub: `${filtered.length} leads + comments`,
      desc: 'All lead data plus activity count — detailed export for deep analysis',
      action: exportPipeline,
    },
  ]

  return (
    <div className="fade-up space-y-5 max-w-3xl">
      <div>
        <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Reports & Exports</h1>
        <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>Export leads, registrations, and performance data as CSV</p>
      </div>

      {/* Date range */}
      <div className="card p-5">
        <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:12 }}>Date Range</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color:'var(--ink-3)', display:'block', marginBottom:6 }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="inp"/>
          </div>
          <div>
            <label style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', color:'var(--ink-3)', display:'block', marginBottom:6 }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="inp"/>
          </div>
        </div>
        {(dateFrom || dateTo) && (
          <div style={{ marginTop:12, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:12, color:'var(--ink-2)' }}>
              {filtered.length} leads · {registered.length} registered · {fmtCurrency(revenue)} revenue
            </span>
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ fontSize:12, color:'var(--accent)', fontWeight:500, background:'none', border:'none', cursor:'pointer', padding:0 }}>
              Clear filter
            </button>
          </div>
        )}
      </div>

      {/* Export cards */}
      <div className="grid md:grid-cols-2 gap-3">
        {exportOptions.map(opt => (
          <div key={opt.key} style={{ borderRadius:'var(--r)', border:'1px solid var(--border)', padding:16, background:'var(--panel)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{opt.title}</div>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--ink-2)', marginBottom:6 }}>{opt.sub}</div>
            <div style={{ fontSize:11, color:'var(--ink-3)', marginBottom:16, lineHeight:1.5 }}>{opt.desc}</div>
            <button
              onClick={opt.action}
              disabled={!!exporting}
              className="btn btn-primary btn-sm w-full press"
            >
              {exporting === opt.key
                ? <><div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin"/> Exporting…</>
                : <>{Icon.download} Download CSV</>
              }
            </button>
          </div>
        ))}
      </div>

      {/* Pipeline summary table */}
      <div className="card overflow-hidden">
        <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
          <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Pipeline Summary</h2>
          {(dateFrom || dateTo) && (
            <p style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>Filtered period</p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
                <th>% of Total</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(STATUS).map(([k, v]) => {
                const count = filtered.filter(l => l.status === k).length
                if (!count) return null
                const rev = filtered
                  .filter(l => l.status === k)
                  .reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)
                return (
                  <tr key={k} className="cursor-default">
                    <td><Badge status={k}/></td>
                    <td style={{ fontWeight:700, color:'var(--ink)' }}>{count}</td>
                    <td style={{ fontSize:12, color:'var(--ink-3)' }}>{pct(count, filtered.length)}%</td>
                    <td style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{rev > 0 ? fmtCurrency(rev) : '—'}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr className="cursor-default">
                  <td colSpan={4} style={{ textAlign:'center', fontSize:12, color:'var(--ink-3)', padding:32 }}>No data for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
