import { useState } from 'react'
import { Icon } from '@/components/ui'
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

  const filtered  = leads.filter(l => inRange(l.created_at))
  const registered = filtered.filter(l => l.status === 'registered')
  const revenue    = registered.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)
  const marketers  = staff.filter(s => s.role === 'marketer')

  // Export handlers
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
        const mine        = filtered.filter(l => l.assigned_to === m.id)
        const contacted   = mine.filter(l => ['contacted','follow_up','pending_registration','registered'].includes(l.status)).length
        const followUp    = mine.filter(l => l.status === 'follow_up').length
        const pendingReg  = mine.filter(l => l.status === 'pending_registration').length
        const reg         = mine.filter(l => l.status === 'registered')
        const convRate    = pct(reg.length, mine.length)
        const rev         = reg.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)
        return [m.name, mine.length, contacted, followUp, pendingReg, reg.length, convRate, rev]
      }),
    ], 'cce-marketer-performance')
    setExporting('')
  }

  const exportPipeline = async () => {
    setExporting('pipeline')
    // Fetch all lead_comments for detailed export
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
      key: 'leads', icon: '👥', color: 'bg-blue-50 border-blue-200',
      title: 'All Leads',
      sub: `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`,
      desc: 'Name, phone, email, source, status, course, marketer, city, dates',
      action: exportLeads,
    },
    {
      key: 'registered', icon: '🎓', color: 'bg-emerald-50 border-emerald-200',
      title: 'Registered Students',
      sub: `${registered.length} record${registered.length !== 1 ? 's' : ''} · ${fmtCurrency(revenue)}`,
      desc: 'Paid students with course, marketer, reg fee, and payment date',
      action: exportRegistered,
    },
    {
      key: 'perf', icon: '📊', color: 'bg-violet-50 border-violet-200',
      title: 'Marketer Performance',
      sub: `${marketers.length} marketer${marketers.length !== 1 ? 's' : ''}`,
      desc: 'Per-marketer: leads, contacted, follow-up, registered, conversion rate, revenue',
      action: exportMarketerPerf,
    },
    {
      key: 'pipeline', icon: '🔍', color: 'bg-amber-50 border-amber-200',
      title: 'Full Pipeline + Activity',
      sub: `${filtered.length} leads + comments`,
      desc: 'All lead data plus activity count — detailed export for deep analysis',
      action: exportPipeline,
    },
  ]

  return (
    <div className="fade-up space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Reports & Exports</h1>
        <p className="text-sm text-slate-400 mt-0.5">Export leads, registrations, and performance data as CSV</p>
      </div>

      {/* Date range */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Date Range</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="inp"/>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="inp"/>
          </div>
        </div>
        {(dateFrom || dateTo) && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {filtered.length} leads · {registered.length} registered · {fmtCurrency(revenue)} revenue
            </span>
            <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-blue-600 font-medium">
              Clear filter
            </button>
          </div>
        )}
      </div>

      {/* Export cards */}
      <div className="grid md:grid-cols-2 gap-3">
        {exportOptions.map(opt => (
          <div key={opt.key} className={`rounded-xl border p-4 ${opt.color}`}>
            <div className="text-2xl mb-2">{opt.icon}</div>
            <div className="font-bold text-slate-900 text-sm">{opt.title}</div>
            <div className="text-[11px] font-semibold text-slate-500 mb-1.5">{opt.sub}</div>
            <div className="text-[11px] text-slate-500 mb-4 leading-relaxed">{opt.desc}</div>
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
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Pipeline Summary</h2>
          {(dateFrom || dateTo) && (
            <p className="text-xs text-slate-400 mt-0.5">Filtered period</p>
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
                    <td><span className={`badge ${v.cls}`}>{v.label}</span></td>
                    <td className="font-bold text-slate-700">{count}</td>
                    <td className="text-slate-400 text-xs">{pct(count, filtered.length)}%</td>
                    <td className="text-sm font-medium text-slate-700">{rev > 0 ? fmtCurrency(rev) : '—'}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr className="cursor-default">
                  <td colSpan={4} className="text-center text-xs text-slate-300 py-8">No data for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
