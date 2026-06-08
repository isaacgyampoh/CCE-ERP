import { useState, useMemo } from 'react'
import { Avatar, StatCard, ProgressBar, EmptyState } from '@/components/ui'
import { pct, fmtDate, fmtCurrency } from '@/lib/helpers'
import { STATUS } from '@/lib/constants'

export default function Analytics({ leads, staff, user, isPM }) {
  const [detailMarketer, setDetailMarketer] = useState(null)

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
      const mine    = leads.filter(l => l.assigned_to === m.id)
      const myMonth = thisMonth.filter(l => l.assigned_to === m.id)
      const registered = mine.filter(l => l.status === 'registered')
      const regMonth   = myMonth.filter(l => l.status === 'registered')
      const pendingReg = mine.filter(l => l.status === 'pending_registration')
      const revenue    = registered.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)

      // Avg response time: assigned_at → first status change after assignment
      // Approximated as: assigned leads with updated_at > assigned_at
      const responseLeads = mine.filter(
        l => l.assigned_at && l.updated_at && l.updated_at > l.assigned_at && l.status !== 'assigned'
      )
      const avgResponseHours = responseLeads.length
        ? Math.round(
            responseLeads.reduce((s, l) => {
              const hrs = (new Date(l.updated_at) - new Date(l.assigned_at)) / 3600000
              return s + Math.min(hrs, 72) // cap at 72h to avoid outliers
            }, 0) / responseLeads.length
          )
        : null

      // Funnel: Assigned → Contacted → Interested → Registered
      const funnel = {
        assigned:  mine.length,
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
        personal: mine.filter(l => l.source === 'personal').length,
        followUp: mine.filter(l => l.status === 'follow_up').length,
        avgResponseHours,
        mine,
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

  // Source breakdown
  const sources = ['facebook','linkedin','website','manual','referral','walk-in','personal']
    .map(s => ({ label: s, count: leads.filter(l => l.source === s).length }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)

  // Selected marketer detail view
  const dm = detailMarketer ? marketers.find(m => m.id === detailMarketer) : null

  if (dm) {
    return (
      <div className="fade-up space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailMarketer(null)} className="btn btn-ghost btn-sm">← Back</button>
          <Avatar name={dm.name} size={36}/>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{dm.name}</h1>
            <p className="text-xs text-slate-400">Marketer Performance Detail</p>
          </div>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Assigned" value={dm.total} icon="👥"/>
          <StatCard label="Registered" value={dm.registered} icon="🎓" color="text-emerald-600"
            sub={`${dm.convRate}% conversion`}/>
          <StatCard label="Revenue" value={fmtCurrency(dm.revenue)} icon="💰" color="text-blue-700"/>
          <StatCard label="Avg Response"
            value={dm.avgResponseHours != null ? `${dm.avgResponseHours}h` : '—'}
            icon="⚡"
            color={dm.avgResponseHours != null && dm.avgResponseHours < 4 ? 'text-emerald-600' : 'text-amber-600'}
            sub="time from assign → first action"/>
        </div>

        {/* Funnel visualization */}
        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-5">Conversion Funnel</h2>
          <div className="space-y-3">
            {[
              { label: 'Assigned',    count: dm.funnel.assigned,   color: 'bg-violet-500' },
              { label: 'Contacted',   count: dm.funnel.contacted,  color: 'bg-cyan-500' },
              { label: 'Interested',  count: dm.funnel.interested, color: 'bg-orange-500' },
              { label: 'Registered',  count: dm.funnel.registered, color: 'bg-emerald-500' },
            ].map((stage, i, arr) => {
              const dropPct = i > 0 && arr[i - 1].count > 0
                ? Math.round(((arr[i - 1].count - stage.count) / arr[i - 1].count) * 100)
                : 0
              return (
                <div key={stage.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{stage.label}</span>
                    <div className="flex items-center gap-3">
                      {i > 0 && dropPct > 0 && (
                        <span className="text-[10px] text-red-400">-{dropPct}% drop</span>
                      )}
                      <span className="text-sm font-bold text-slate-900">{stage.count}</span>
                    </div>
                  </div>
                  <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-lg transition-all flex items-center justify-end pr-2`}
                      style={{ width: dm.funnel.assigned > 0 ? `${Math.max(3, (stage.count / dm.funnel.assigned) * 100)}%` : '3%' }}
                    >
                      {stage.count > 0 && dm.funnel.assigned > 0 && (
                        <span className="text-[10px] font-bold text-white">
                          {Math.round((stage.count / dm.funnel.assigned) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* This month vs all time */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card"><div className="stat-value">{dm.totalMonth}</div><div className="stat-label">This Month Leads</div></div>
          <div className="stat-card"><div className="stat-value text-emerald-600">{dm.regMonth}</div><div className="stat-label">This Month Reg.</div></div>
          <div className="stat-card"><div className="stat-value text-amber-600">{dm.followUp}</div><div className="stat-label">Follow-up Needed</div></div>
          <div className="stat-card"><div className="stat-value text-orange-600">{dm.pendingReg}</div><div className="stat-label">Pending Reg.</div></div>
        </div>

        {/* Lead status breakdown for this marketer */}
        <div className="card p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">Lead Status Breakdown</h2>
          <div className="space-y-2">
            {Object.entries(STATUS).map(([key, s]) => {
              const count = dm.mine.filter(l => l.status === key).length
              if (!count) return null
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className={`badge ${s.cls} w-32 justify-center shrink-0`}>{s.label}</span>
                  <ProgressBar value={count} max={dm.total} color="bg-blue-500"/>
                  <span className="text-xs font-bold text-slate-700 w-6 text-right">{count}</span>
                  <span className="text-[10px] text-slate-400 w-8">{pct(count, dm.total)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-up space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-400 mt-0.5">Conversion rates, pipeline health, marketer performance</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Leads" value={leads.length} icon="👥" sub={`${thisMonth.length} this month`}/>
        <StatCard label="Registered" value={totalReg} icon="🎓" color="text-emerald-600"
          sub={`${pct(totalReg, leads.length)}% conversion`}/>
        <StatCard label="Pending Reg." value={leads.filter(l => l.status === 'pending_registration').length}
          icon="⏳" color="text-orange-600"/>
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
                    <div className="w-full bg-emerald-500 rounded-t absolute bottom-0"
                      style={{ height: `${(t.registered / t.total) * 100}%` }}/>
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
          {sources.length === 0 ? <EmptyState title="No data" icon="📊"/> : (
            <div className="space-y-3">
              {sources.map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="text-xs capitalize text-slate-500 w-20">{s.label}</span>
                  <ProgressBar value={s.count} max={leads.length} color="bg-indigo-400"/>
                  <span className="text-xs font-bold text-slate-700 w-5 text-right">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Marketer performance cards + table */}
      {isPM && marketers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Marketer Performance</h2>
              <p className="text-xs text-slate-400 mt-0.5">Click a row to see full funnel detail</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {marketers.map((m, i) => (
              <button key={m.id} onClick={() => setDetailMarketer(m.id)}
                className="card p-4 text-left hover:shadow-md transition press">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="text-[10px] text-slate-300 font-bold w-4">#{i + 1}</div>
                  <Avatar name={m.name} size={32}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{m.name}</div>
                    <div className="text-[10px] text-slate-400">{m.total} leads</div>
                  </div>
                  <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.convRate >= 30 ? 'bg-emerald-100 text-emerald-700' : m.convRate >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                    {m.convRate}%
                  </div>
                </div>

                {/* Mini funnel */}
                <div className="space-y-1.5">
                  {[
                    { l: 'Assigned',   v: m.funnel.assigned,   c: 'bg-violet-300' },
                    { l: 'Contacted',  v: m.funnel.contacted,  c: 'bg-cyan-400' },
                    { l: 'Interested', v: m.funnel.interested, c: 'bg-orange-400' },
                    { l: 'Registered', v: m.funnel.registered, c: 'bg-emerald-500' },
                  ].map(stage => (
                    <div key={stage.l} className="flex items-center gap-2">
                      <div className="w-16 text-[9px] text-slate-400">{stage.l}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className={`${stage.c} h-1.5 rounded-full`}
                          style={{ width: m.funnel.assigned > 0 ? `${Math.max(2, (stage.v / m.funnel.assigned) * 100)}%` : '2%' }}/>
                      </div>
                      <div className="text-[9px] font-bold text-slate-600 w-4 text-right">{stage.v}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="bg-emerald-50 rounded-lg px-2 py-1.5">
                    <div className="text-xs font-bold text-emerald-700">{fmtCurrency(m.revenue)}</div>
                    <div className="text-[9px] text-emerald-600">Revenue</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg px-2 py-1.5">
                    <div className="text-xs font-bold text-slate-700">
                      {m.avgResponseHours != null ? `${m.avgResponseHours}h` : '—'}
                    </div>
                    <div className="text-[9px] text-slate-400">Avg response</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Full table */}
          <div className="border-t border-slate-100 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Marketer</th>
                  <th>Total</th>
                  <th>This Month</th>
                  <th>Registered</th>
                  <th>Pending</th>
                  <th>Personal</th>
                  <th>Conv. Rate</th>
                  <th>Avg Resp.</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {marketers.map((m, i) => (
                  <tr key={m.id} onClick={() => setDetailMarketer(m.id)}
                    className={!isPM && m.id === user.id ? 'bg-blue-50/30' : ''}>
                    <td className="text-slate-400 font-bold text-xs">{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={m.name} size={30}/>
                        <span className="font-medium text-slate-900 text-sm">{m.name}</span>
                      </div>
                    </td>
                    <td className="font-semibold text-slate-700">{m.total}</td>
                    <td className="text-slate-500">{m.totalMonth}</td>
                    <td><span className="font-bold text-emerald-600">{m.registered}</span></td>
                    <td className="text-orange-600">{m.pendingReg}</td>
                    <td className="text-violet-600">{m.personal}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={m.registered} max={m.total}
                          color={m.convRate >= 30 ? 'bg-emerald-500' : m.convRate >= 15 ? 'bg-amber-400' : 'bg-red-400'}/>
                        <span className={`text-xs font-bold w-10 ${m.convRate >= 30 ? 'text-emerald-600' : m.convRate >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                          {m.convRate}%
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs">
                      {m.avgResponseHours != null ? `${m.avgResponseHours}h` : '—'}
                    </td>
                    <td className="text-sm font-semibold text-slate-900">{fmtCurrency(m.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Non-PM: show own stats */}
      {!isPM && marketers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">My Performance</h2>
          </div>
          {marketers.map(m => (
            <div key={m.id} className="p-5 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Assigned" value={m.total} icon="👥"/>
                <StatCard label="Registered" value={m.registered} icon="🎓" color="text-emerald-600"
                  sub={`${m.convRate}% conversion`}/>
                <StatCard label="Revenue" value={fmtCurrency(m.revenue)} icon="💰" color="text-blue-700"/>
                <StatCard label="Avg Response"
                  value={m.avgResponseHours != null ? `${m.avgResponseHours}h` : '—'}
                  icon="⚡" color="text-amber-600"/>
              </div>

              {/* My funnel */}
              <div className="card p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-4">My Conversion Funnel</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Assigned',   count: m.funnel.assigned,   color: 'bg-violet-500' },
                    { label: 'Contacted',  count: m.funnel.contacted,  color: 'bg-cyan-500' },
                    { label: 'Interested', count: m.funnel.interested, color: 'bg-orange-500' },
                    { label: 'Registered', count: m.funnel.registered, color: 'bg-emerald-500' },
                  ].map((stage, i, arr) => {
                    const dropPct = i > 0 && arr[i - 1].count > 0
                      ? Math.round(((arr[i - 1].count - stage.count) / arr[i - 1].count) * 100)
                      : 0
                    return (
                      <div key={stage.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700">{stage.label}</span>
                          <div className="flex items-center gap-3">
                            {i > 0 && dropPct > 0 && (
                              <span className="text-[10px] text-red-400">-{dropPct}% drop</span>
                            )}
                            <span className="text-sm font-bold text-slate-900">{stage.count}</span>
                          </div>
                        </div>
                        <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
                          <div className={`h-full ${stage.color} rounded-lg transition-all flex items-center justify-end pr-2`}
                            style={{ width: m.funnel.assigned > 0 ? `${Math.max(3, (stage.count / m.funnel.assigned) * 100)}%` : '3%' }}>
                            {stage.count > 0 && m.funnel.assigned > 0 && (
                              <span className="text-[10px] font-bold text-white">
                                {Math.round((stage.count / m.funnel.assigned) * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
