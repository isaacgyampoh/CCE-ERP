import { useState, useEffect } from 'react'
import { Avatar, Badge, EmptyState, Spinner } from '@/components/ui'
import { fmtCurrency, fmtDateTime, fmtDate } from '@/lib/helpers'
import { Icon } from '@/components/ui'

export default function Finance({ sb, staff, leads, user }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // marketer id or 'all'
  const [range, setRange] = useState('all') // 'month' | 'all'

  useEffect(() => {
    sb.from('payments')
      .select('*, lead:lead_id(id,name,phone,email,course_interest,assigned_to, assignee:assigned_to(id,name))')
      .order('paid_at', { ascending: false })
      .then(({ data }) => { setPayments(data || []); setLoading(false) })
  }, [])

  const marketers = staff.filter(s => s.role === 'marketer')
  const now = new Date()

  const filtered = payments.filter(p => {
    if (filter !== 'all' && p.lead?.assigned_to !== filter) return false
    if (range === 'month') {
      const d = new Date(p.paid_at)
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false
    }
    return true
  })

  const totalRevenue = filtered.reduce((s, p) => s + Number(p.amount || 0), 0)

  // Per-marketer breakdown
  const byMarketer = marketers.map(m => {
    const mPayments = filtered.filter(p => p.lead?.assigned_to === m.id)
    return {
      ...m,
      count: mPayments.length,
      revenue: mPayments.reduce((s, p) => s + Number(p.amount || 0), 0),
      payments: mPayments,
    }
  }).filter(m => m.count > 0).sort((a, b) => b.revenue - a.revenue)

  const exportCSV = () => {
    const rows = [
      ['Date', 'Lead Name', 'Phone', 'Course', 'Marketer', 'Amount (GHS)', 'Reference', 'Status'],
      ...filtered.map(p => [
        fmtDate(p.paid_at),
        p.lead?.name || '',
        p.lead?.phone || '',
        p.lead?.course_interest || '',
        p.lead?.assignee?.name || '',
        p.amount,
        p.reference,
        p.status,
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `cce-payments-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  if (loading) return <Spinner size={24}/>

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Finance</h1>
          <p className="text-sm text-slate-400 mt-0.5">Registration fee payments & marketer commissions</p>
        </div>
        <button onClick={exportCSV} className="btn btn-ghost btn-sm">
          {Icon.download} Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="text-2xl mb-1">💰</div>
          <div className="stat-value text-emerald-600">{fmtCurrency(totalRevenue)}</div>
          <div className="stat-label">Total Revenue</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl mb-1">🧾</div>
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-label">Payments</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl mb-1">👤</div>
          <div className="stat-value">{byMarketer.length}</div>
          <div className="stat-label">Active Marketers</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl mb-1">📊</div>
          <div className="stat-value">{byMarketer.length > 0 ? fmtCurrency(totalRevenue / byMarketer.length) : fmtCurrency(0)}</div>
          <div className="stat-label">Avg / Marketer</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="inp h-9 text-xs w-auto">
          <option value="all">All Marketers</option>
          {marketers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {[['all', 'All Time'], ['month', 'This Month']].map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)}
              className={`px-3 py-1.5 text-xs font-medium transition ${range === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Marketer breakdown */}
      {byMarketer.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {byMarketer.map((m, i) => (
            <div key={m.id} className="card p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="text-[10px] text-slate-300 font-bold w-4">#{i+1}</div>
                <Avatar name={m.name} size={32}/>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                  <div className="text-[10px] text-slate-400">Marketer</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-emerald-50 rounded-lg p-2">
                  <div className="text-sm font-bold text-emerald-700">{fmtCurrency(m.revenue)}</div>
                  <div className="text-[10px] text-emerald-600">Revenue</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-blue-700">{m.count}</div>
                  <div className="text-[10px] text-blue-600">Registrations</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment ledger */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Payment Ledger</h2>
          <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="💳" title="No payments yet" sub="Payments appear here once leads complete registration"/>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Marketer</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className="text-xs text-slate-500">{fmtDateTime(p.paid_at)}</td>
                    <td>
                      <div className="font-medium text-slate-900 text-sm">{p.lead?.name}</div>
                      <div className="text-[10px] text-slate-400">{p.lead?.phone}</div>
                    </td>
                    <td className="text-xs text-slate-600 max-w-[140px] truncate">{p.lead?.course_interest || '—'}</td>
                    <td>
                      {p.lead?.assignee ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={p.lead.assignee.name} size={22}/>
                          <span className="text-xs text-slate-600">{p.lead.assignee.name}</span>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="font-bold text-emerald-700">{fmtCurrency(p.amount)}</td>
                    <td className="font-mono text-[11px] text-slate-400">{p.reference}</td>
                    <td>
                      <span className={`badge ${p.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
