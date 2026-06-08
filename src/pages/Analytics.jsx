import { useState, useMemo } from 'react'
import { Avatar, Badge, ProgressBar, EmptyState } from '@/components/ui'
import { pct, fmtDate, fmtCurrency } from '@/lib/helpers'
import { STATUS } from '@/lib/constants'

const FUNNEL_COLORS = ['#7c3aed', '#0891b2', '#ea580c', 'var(--ok)']

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
      const mine       = leads.filter(l => l.assigned_to === m.id)
      const myMonth    = thisMonth.filter(l => l.assigned_to === m.id)
      const registered = mine.filter(l => l.status === 'registered')
      const regMonth   = myMonth.filter(l => l.status === 'registered')
      const pendingReg = mine.filter(l => l.status === 'pending_registration')
      const revenue    = registered.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)

      const responseLeads = mine.filter(
        l => l.assigned_at && l.updated_at && l.updated_at > l.assigned_at && l.status !== 'assigned'
      )
      const avgResponseHours = responseLeads.length
        ? Math.round(
            responseLeads.reduce((s, l) => {
              const hrs = (new Date(l.updated_at) - new Date(l.assigned_at)) / 3600000
              return s + Math.min(hrs, 72)
            }, 0) / responseLeads.length
          )
        : null

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

  const pipeline = Object.entries(STATUS).map(([key, s]) => ({
    key, label: s.label,
    count: leads.filter(l => l.status === key).length,
  }))

  const trend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const label = d.toLocaleDateString('en-GB', { month: 'short' })
    const monthLeads = leads.filter(l => {
      const ld = new Date(l.created_at)
      return ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear()
    })
    return { label, total: monthLeads.length, registered: monthLeads.filter(l => l.status === 'registered').length }
  })
  const maxTrend = Math.max(...trend.map(t => t.total), 1)

  const totalReg = leads.filter(l => l.status === 'registered').length
  const totalRev = leads.reduce((s, l) => s + Number(l.reg_fee_paid || 0), 0)

  const sources = ['facebook','linkedin','website','manual','referral','walk-in','personal']
    .map(s => ({ label: s, count: leads.filter(l => l.source === s).length }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)

  const dm = detailMarketer ? marketers.find(m => m.id === detailMarketer) : null

  const FunnelChart = ({ funnel }) => (
    <div className="space-y-3">
      {[
        { label: 'Assigned',   count: funnel.assigned,   color: FUNNEL_COLORS[0] },
        { label: 'Contacted',  count: funnel.contacted,  color: FUNNEL_COLORS[1] },
        { label: 'Interested', count: funnel.interested, color: FUNNEL_COLORS[2] },
        { label: 'Registered', count: funnel.registered, color: FUNNEL_COLORS[3] },
      ].map((stage, i, arr) => {
        const dropPct = i > 0 && arr[i - 1].count > 0
          ? Math.round(((arr[i - 1].count - stage.count) / arr[i - 1].count) * 100)
          : 0
        return (
          <div key={stage.label}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize:12, fontWeight:600, color:'var(--ink)' }}>{stage.label}</span>
              <div className="flex items-center gap-3">
                {i > 0 && dropPct > 0 && (
                  <span style={{ fontSize:10, color:'var(--bad)' }}>-{dropPct}% drop</span>
                )}
                <span style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{stage.count}</span>
              </div>
            </div>
            <div style={{ height:28, background:'var(--bg)', borderRadius:'var(--r)', overflow:'hidden', border:'1px solid var(--border)' }}>
              <div
                style={{
                  height:'100%', borderRadius:'var(--r)', background:stage.color, transition:'width .3s',
                  display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:8,
                  width: funnel.assigned > 0 ? `${Math.max(3, (stage.count / funnel.assigned) * 100)}%` : '3%',
                }}
              >
                {stage.count > 0 && funnel.assigned > 0 && (
                  <span style={{ fontSize:10, fontWeight:700, color:'#fff' }}>
                    {Math.round((stage.count / funnel.assigned) * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  if (dm) {
    const convColor = dm.convRate >= 30 ? 'var(--ok)' : dm.convRate >= 15 ? 'var(--warn)' : 'var(--bad)'
    return (
      <div className="fade-up space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailMarketer(null)} className="btn btn-ghost btn-sm">← Back</button>
          <Avatar name={dm.name} size={36}/>
          <div>
            <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>{dm.name}</h1>
            <p style={{ fontSize:12, color:'var(--ink-3)' }}>Marketer Performance Detail</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card"><div className="stat-label">Total Assigned</div><div className="stat-value">{dm.total}</div></div>
          <div className="stat-card"><div className="stat-label">Registered</div><div className="stat-value" style={{ color:'var(--ok)' }}>{dm.registered}</div><div className="stat-sub">{dm.convRate}% conversion</div></div>
          <div className="stat-card"><div className="stat-label">Revenue</div><div className="stat-value" style={{ color:'var(--info)' }}>{fmtCurrency(dm.revenue)}</div></div>
          <div className="stat-card">
            <div className="stat-label">Avg Response</div>
            <div className="stat-value" style={{ color: dm.avgResponseHours != null && dm.avgResponseHours < 4 ? 'var(--ok)' : 'var(--warn)' }}>
              {dm.avgResponseHours != null ? `${dm.avgResponseHours}h` : '—'}
            </div>
            <div className="stat-sub">assign → first action</div>
          </div>
        </div>

        <div className="card p-5">
          <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:20 }}>Conversion Funnel</h2>
          <FunnelChart funnel={dm.funnel}/>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card"><div className="stat-value">{dm.totalMonth}</div><div className="stat-label">This Month Leads</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color:'var(--ok)' }}>{dm.regMonth}</div><div className="stat-label">This Month Reg.</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color:'var(--warn)' }}>{dm.followUp}</div><div className="stat-label">Follow-up Needed</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color:'var(--warn)' }}>{dm.pendingReg}</div><div className="stat-label">Pending Reg.</div></div>
        </div>

        <div className="card p-5">
          <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:16 }}>Lead Status Breakdown</h2>
          <div className="space-y-2">
            {Object.entries(STATUS).map(([key]) => {
              const count = dm.mine.filter(l => l.status === key).length
              if (!count) return null
              return (
                <div key={key} className="flex items-center gap-3">
                  <div style={{ width:112, flexShrink:0 }}><Badge status={key}/></div>
                  <ProgressBar value={count} max={dm.total}/>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)', width:24, textAlign:'right' }}>{count}</span>
                  <span style={{ fontSize:10, color:'var(--ink-3)', width:32 }}>{pct(count, dm.total)}%</span>
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
        <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Analytics</h1>
        <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>Conversion rates, pipeline health, marketer performance</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card"><div className="stat-label">Total Leads</div><div className="stat-value">{leads.length}</div><div className="stat-sub">{thisMonth.length} this month</div></div>
        <div className="stat-card"><div className="stat-label">Registered</div><div className="stat-value" style={{ color:'var(--ok)' }}>{totalReg}</div><div className="stat-sub">{pct(totalReg, leads.length)}% conversion</div></div>
        <div className="stat-card"><div className="stat-label">Pending Reg.</div><div className="stat-value" style={{ color:'var(--warn)' }}>{leads.filter(l => l.status === 'pending_registration').length}</div></div>
        <div className="stat-card"><div className="stat-label">Revenue (Reg. Fees)</div><div className="stat-value" style={{ color:'var(--info)' }}>{fmtCurrency(totalRev)}</div></div>
      </div>

      {/* Monthly trend bar chart */}
      <div className="card p-5">
        <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:20 }}>Lead Volume — Last 6 Months</h2>
        <div className="flex items-end gap-3 h-32">
          {trend.map(t => (
            <div key={t.label} className="flex-1 flex flex-col items-center gap-1">
              <div style={{ fontSize:10, fontWeight:700, color:'var(--ok)' }}>{t.registered > 0 && t.registered}</div>
              <div className="w-full flex flex-col justify-end" style={{ height:'96px' }}>
                <div className="w-full rounded-t relative" style={{ height:`${(t.total / maxTrend) * 96}px`, background:'var(--accent-wash)', border:'1px solid var(--border)' }}>
                  {t.registered > 0 && (
                    <div className="w-full absolute bottom-0 rounded-t"
                      style={{ height:`${(t.registered / t.total) * 100}%`, background:'var(--ok)' }}/>
                  )}
                </div>
              </div>
              <div style={{ fontSize:10, color:'var(--ink-3)', fontWeight:500 }}>{t.label}</div>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--ink)' }}>{t.total}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:12, fontSize:10, color:'var(--ink-3)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:'var(--accent-wash)', border:'1px solid var(--border)' }}/>Total leads
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:'var(--ok)' }}/>Registered
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Pipeline funnel */}
        <div className="card p-5">
          <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:16 }}>Lead Pipeline</h2>
          <div className="space-y-2">
            {pipeline.filter(p => p.count > 0).map(p => (
              <div key={p.key} className="flex items-center gap-3">
                <div style={{ width:112, flexShrink:0 }}><Badge status={p.key}/></div>
                <ProgressBar value={p.count} max={leads.length}/>
                <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)', width:32, textAlign:'right' }}>{p.count}</span>
                <span style={{ fontSize:10, color:'var(--ink-3)', width:32 }}>{pct(p.count, leads.length)}%</span>
              </div>
            ))}
            {leads.length === 0 && <EmptyState title="No leads yet"/>}
          </div>
        </div>

        {/* Source breakdown */}
        <div className="card p-5">
          <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:16 }}>Lead Sources</h2>
          {sources.length === 0 ? <EmptyState title="No data"/> : (
            <div className="space-y-3">
              {sources.map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <span style={{ fontSize:12, color:'var(--ink-2)', textTransform:'capitalize', width:80 }}>{s.label}</span>
                  <ProgressBar value={s.count} max={leads.length}/>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)', width:20, textAlign:'right' }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Marketer performance */}
      {isPM && marketers.length > 0 && (
        <div className="card overflow-hidden">
          <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Marketer Performance</h2>
            <p style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>Click a row to see full funnel detail</p>
          </div>

          {/* Summary cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {marketers.map((m, i) => {
              const convColor = m.convRate >= 30 ? 'var(--ok)' : m.convRate >= 15 ? 'var(--warn)' : 'var(--bad)'
              return (
                <button key={m.id} onClick={() => setDetailMarketer(m.id)}
                  className="card p-4 text-left hover:shadow-md transition press">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span style={{ fontSize:10, color:'var(--ink-3)', fontWeight:700, width:16 }}>#{i + 1}</span>
                    <Avatar name={m.name} size={32}/>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize:10, color:'var(--ink-3)' }}>{m.total} leads</div>
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:convColor, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:20, padding:'2px 8px' }}>
                      {m.convRate}%
                    </span>
                  </div>

                  {/* Mini funnel */}
                  <div className="space-y-1.5">
                    {[
                      { l: 'Assigned',   v: m.funnel.assigned,   c: FUNNEL_COLORS[0] },
                      { l: 'Contacted',  v: m.funnel.contacted,  c: FUNNEL_COLORS[1] },
                      { l: 'Interested', v: m.funnel.interested, c: FUNNEL_COLORS[2] },
                      { l: 'Registered', v: m.funnel.registered, c: FUNNEL_COLORS[3] },
                    ].map(stage => (
                      <div key={stage.l} className="flex items-center gap-2">
                        <div style={{ width:56, fontSize:9, color:'var(--ink-3)' }}>{stage.l}</div>
                        <div style={{ flex:1, height:6, background:'var(--bg)', borderRadius:3, overflow:'hidden', border:'1px solid var(--border)' }}>
                          <div style={{ height:'100%', borderRadius:3, background:stage.c,
                            width: m.funnel.assigned > 0 ? `${Math.max(2, (stage.v / m.funnel.assigned) * 100)}%` : '2%' }}/>
                        </div>
                        <div style={{ fontSize:9, fontWeight:700, color:'var(--ink-2)', width:16, textAlign:'right' }}>{stage.v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div style={{ borderRadius:4, padding:'6px 8px', background:'var(--accent-wash)', border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--ok)' }}>{fmtCurrency(m.revenue)}</div>
                      <div style={{ fontSize:9, color:'var(--ink-3)' }}>Revenue</div>
                    </div>
                    <div style={{ borderRadius:4, padding:'6px 8px', background:'var(--bg)', border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>
                        {m.avgResponseHours != null ? `${m.avgResponseHours}h` : '—'}
                      </div>
                      <div style={{ fontSize:9, color:'var(--ink-3)' }}>Avg response</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Full table */}
          <div style={{ borderTop:'1px solid var(--border)', overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th><th>Marketer</th><th>Total</th><th>This Month</th>
                  <th>Registered</th><th>Pending</th><th>Personal</th>
                  <th>Conv. Rate</th><th>Avg Resp.</th><th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {marketers.map((m, i) => {
                  const convColor = m.convRate >= 30 ? 'var(--ok)' : m.convRate >= 15 ? 'var(--warn)' : 'var(--bad)'
                  return (
                    <tr key={m.id} onClick={() => setDetailMarketer(m.id)}
                      style={!isPM && m.id === user.id ? { background:'var(--accent-wash)' } : {}}>
                      <td style={{ color:'var(--ink-3)', fontWeight:700, fontSize:12 }}>{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar name={m.name} size={30}/>
                          <span style={{ fontWeight:500, color:'var(--ink)', fontSize:13 }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight:600, color:'var(--ink)' }}>{m.total}</td>
                      <td style={{ color:'var(--ink-2)' }}>{m.totalMonth}</td>
                      <td style={{ fontWeight:700, color:'var(--ok)' }}>{m.registered}</td>
                      <td style={{ color:'var(--warn)' }}>{m.pendingReg}</td>
                      <td style={{ color:'var(--accent)' }}>{m.personal}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={m.registered} max={m.total}/>
                          <span style={{ fontSize:12, fontWeight:700, width:40, color:convColor }}>{m.convRate}%</span>
                        </div>
                      </td>
                      <td style={{ color:'var(--ink-2)', fontSize:12 }}>
                        {m.avgResponseHours != null ? `${m.avgResponseHours}h` : '—'}
                      </td>
                      <td style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{fmtCurrency(m.revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Non-PM: own stats */}
      {!isPM && marketers.length > 0 && (
        <div className="card overflow-hidden">
          <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>My Performance</h2>
          </div>
          {marketers.map(m => (
            <div key={m.id} className="p-5 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="stat-card"><div className="stat-label">Total Assigned</div><div className="stat-value">{m.total}</div></div>
                <div className="stat-card"><div className="stat-label">Registered</div><div className="stat-value" style={{ color:'var(--ok)' }}>{m.registered}</div><div className="stat-sub">{m.convRate}% conversion</div></div>
                <div className="stat-card"><div className="stat-label">Revenue</div><div className="stat-value" style={{ color:'var(--info)' }}>{fmtCurrency(m.revenue)}</div></div>
                <div className="stat-card"><div className="stat-label">Avg Response</div><div className="stat-value" style={{ color:'var(--warn)' }}>{m.avgResponseHours != null ? `${m.avgResponseHours}h` : '—'}</div></div>
              </div>
              <div className="card p-5">
                <h3 style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:16 }}>My Conversion Funnel</h3>
                <FunnelChart funnel={m.funnel}/>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
