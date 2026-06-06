import { useMemo } from 'react'
import { Avatar, StatCard, ProgressBar, EmptyState } from '@/components/ui'
import { pct, fmtDate, fmtCurrency } from '@/lib/helpers'
import { STATUS } from '@/lib/constants'

export default function Analytics({ leads, staff, user, isPM }) {
  const now = new Date()
  const thisMonth = leads.filter(l => {
    const d = new Date(l.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const marketers = useMemo(() => {
    const mkts = isPM
      ? staff.filter(s => s.role === 'marketer')
      : staff.filter(s => s.id === user.id)

    return mkts.map(m => {
      const mine = leads.filter(l => l.assigned_to === m.id)
      const myMonth = thisMonth.filter(l => l.assigned_to === m.id)
      const registered = mine.filter(l => l.status === 'registered')
      const regMonth = myMonth.filter(l => l.status === 'registered')
      const pendingReg = mine.filter(l => l.status === 'pending_registration')
      const revenue = registered.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)

      // Funnel counts
      const funnel = {
        assigned: mine.length,
        contacted: mine.filter(l => ['contacted','follow_up','pending_registration','registered'].includes(l.status)).length,
        interested: mine.filter(l => ['pending_registration','registered'].includes(l.status)).length,
        registered: registered.length,
      }

      return {
        ...m,
        total: mine.length,
        totalMonth: myMonth.length,
        registered: registered.length,
        regMonth: regMonth.length,
        pendingReg: pendingReg.length,
        revenue,
        convRate: pct(registered.length, mine.length),
        convRateMonth: pct(regMonth.length, myMonth.length),
        funnel,
        // personal leads (self-sourced)
        personal: mine.filter(l => l.source === 'personal').length,
      }
    }).sort((a, b) => b.registered - a.registered)
  }, [leads, staff, user, isPM])

  // Status pipeline totals
  const pipeline = Object.entries(STATUS).map(([key, s]) => ({
    key, label: s.label,
    count: leads.filter(l => l.status === key).length,
    cls: s.cls,
  }))

  // Monthly trend — last 6 months
  const trend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const label = d.toLocaleDateString('en-GB', { month: 'short' })
    const monthLeads = leads.filter(l => {
      const ld = new Date(l.created_at)
      return ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear()
    })
    return {
      label,
      total: monthLeads.length,
      registered: monthLeads.filter(l => l.status === 'registered').length,
    }
  })
  const maxTrend = Math.max(...trend.map(t => t.total), 1)

  // Overall stats
  const totalReg = leads.filter(l => l.status === 'registered').length
  const totalRev = leads.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-400 mt-0.5">Conversion rates, pipeline health, marketer performance</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Leads" value={leads.length} icon="👥" sub={`${thisMonth.length} this month`}/>
        <StatCard label="Registered" value={totalReg} icon="🎓" color="text-emerald-600" sub={`${pct(totalReg, leads.length)}% conversion`}/>
        <StatCard label="Pending Reg." value={leads.filter(l => l.status === 'pending_registration').length} icon="⏳" color="text-orange-600"/>
        <StatCard label="Revenue (Reg. Fees)" value={fmtCurrency(totalRev)} icon="💰" color="text-blue-700"/>
      </div>

      {/* Monthly trend bar chart */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-5">Lead Volume — Last 6 Months</h2>
        <div className="flex items-end gap-3 h-32">
          {trend.map(t => (
            <div key={t.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-[10px] font-bold text-emerald-600">{t.registered > 0 && t.registered}</div>
              <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                <div className="w-full bg-blue-100 rounded-t relative" style={{ height: `${(t.total / maxTrend) * 96}px` }}>
                  {t.registered > 0 && (
                    <div className="w-full bg-emerald-500 rounded-t absolute bottom-0" style={{ height: `${(t.registered / t.total) * 100}%` }}/>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">{t.label}</div>
              <div className="text-[10px] font-semibold text-slate-600">{t.total}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-200 rounded-sm"/>Total leads</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-sm"/>Registered</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Pipeline funnel */}
        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Lead Pipeline</h2>
          <div className="space-y-2">
            {pipeline.filter(p => p.count > 0).map(p => (
              <div key={p.key} className="flex items-center gap-3">
                <span className={`badge ${p.cls} w-28 justify-center shrink-0`}>{p.label}</span>
                <ProgressBar value={p.count} max={leads.length} color="bg-blue-500"/>
                <span className="text-xs font-bold text-slate-700 w-8 text-right">{p.count}</span>
                <span className="text-[10px] text-slate-400 w-8">{pct(p.count, leads.length)}%</span>
              </div>
            ))}
            {leads.length === 0 && <EmptyState title="No leads yet" icon="📊"/>}
          </div>
        </div>

        {/* Source breakdown */}
        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Lead Sources</h2>
          {(() => {
            const sources = ['facebook','linkedin','website','manual','referral','walk-in','personal']
              .map(s => ({ label: s, count: leads.filter(l => l.source === s).length }))
              .filter(s => s.count > 0)
              .sort((a,b) => b.count - a.count)
            return sources.length === 0 ? <EmptyState title="No data" icon="📊"/> : (
              <div className="space-y-3">
                {sources.map(s => (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="text-xs capitalize text-slate-500 w-20">{s.label}</span>
                    <ProgressBar value={s.count} max={leads.length} color="bg-indigo-400"/>
                    <span className="text-xs font-bold text-slate-700 w-5 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Marketer conversion table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Marketer Performance</h2>
          <p className="text-xs text-slate-400 mt-0.5">Conversion rate = Registered ÷ Total Assigned × 100</p>
        </div>
        {marketers.length === 0 ? <EmptyState title="No marketers" icon="👤"/> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Marketer</th>
                  <th>Total Leads</th>
                  <th>This Month</th>
                  <th>Registered</th>
                  <th>Pending</th>
                  <th>Personal</th>
                  <th>Conv. Rate</th>
                  <th>Monthly Conv.</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {marketers.map((m, i) => (
                  <tr key={m.id} className={!isPM && m.id === user.id ? 'bg-blue-50/30' : ''}>
                    <td className="text-slate-400 font-bold text-xs">{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={m.name} size={30}/>
                        <div>
                          <div className="font-medium text-slate-900 text-sm">{m.name}</div>
                          {!isPM && <div className="text-[10px] text-blue-600">You</div>}
                        </div>
                      </div>
                    </td>
                    <td className="font-semibold text-slate-700">{m.total}</td>
                    <td className="text-slate-500">{m.totalMonth}</td>
                    <td>
                      <span className="font-bold text-emerald-600">{m.registered}</span>
                    </td>
                    <td className="text-orange-600">{m.pendingReg}</td>
                    <td className="text-violet-600">{m.personal}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={m.registered} max={m.total} color={m.convRate >= 30 ? 'bg-emerald-500' : m.convRate >= 15 ? 'bg-amber-400' : 'bg-red-400'}/>
                        <span className={`text-xs font-bold w-10 ${m.convRate >= 30 ? 'text-emerald-600' : m.convRate >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                          {m.convRate}%
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs">{m.convRateMonth}%</td>
                    <td className="text-sm font-semibold text-slate-900">{fmtCurrency(m.revenue)}</td>
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
