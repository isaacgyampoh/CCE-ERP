import { SOURCES } from '@/lib/constants'
import { timeAgo, fmtDate, leadScore } from '@/lib/helpers'
import { Avatar, Badge, KpiStrip, Kpi, EmptyState, ProgressBar, Icon } from '@/components/ui'

function SmartAlerts({ leads, nav, onAutoAssign }) {
  const now = Date.now()
  const ago = (h) => new Date(now - h * 3600000)

  const hotUncontacted = leads.filter(l => ['new','inquiry','assigned'].includes(l.status) && leadScore(l) >= 65)
  const stale = leads.filter(l => ['assigned','contacted','follow_up'].includes(l.status) && new Date(l.updated_at) < ago(48))
  const atRisk = leads.filter(l => l.status === 'pending_registration' && new Date(l.updated_at) < ago(72))
  const unassigned = leads.filter(l => !l.assigned_to).length

  if (!hotUncontacted.length && !stale.length && !atRisk.length) return null

  const AlertCard = ({ title, sub, dotColor, items }) => (
    <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:dotColor, flexShrink:0, display:'inline-block' }}/>
        <span style={{ fontSize:12.5, fontWeight:600, color:'var(--ink)' }}>{title}</span>
        <span style={{ fontSize:12, color:'var(--ink-3)' }}>({items.length})</span>
      </div>
      <div style={{ fontSize:11, color:'var(--ink-3)', marginBottom:10 }}>{sub}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {items.slice(0, 4).map(l => (
          <button key={l.id} onClick={() => nav('leads', l)}
            style={{ display:'flex', alignItems:'center', gap:8, textAlign:'left', background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:4, transition:'background .1s' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background='none'}>
            <Avatar name={l.name} size={22}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name}</div>
              <div style={{ fontSize:10.5, color:'var(--ink-3)' }}>{timeAgo(l.updated_at)}</div>
            </div>
          </button>
        ))}
        {items.length > 4 && <div style={{ fontSize:10.5, color:'var(--ink-3)', paddingLeft:6 }}>+{items.length - 4} more</div>}
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:600, color:'var(--ink)' }}>{Icon.alert} Smart Alerts</div>
        {unassigned > 0 && (
          <button onClick={onAutoAssign} className="btn btn-primary btn-sm">
            Auto-Assign {unassigned} leads
          </button>
        )}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
        {hotUncontacted.length > 0 && <AlertCard title="Hot & Uncontacted" sub="Score ≥65, still early-stage" dotColor="var(--bad)" items={hotUncontacted}/>}
        {stale.length > 0 && <AlertCard title="Stale Leads" sub="No activity in 48+ hours" dotColor="var(--warn)" items={stale}/>}
        {atRisk.length > 0 && <AlertCard title="At-Risk Registrations" sub="Pending reg. 72+ hours" dotColor="var(--warn)" items={atRisk}/>}
      </div>
    </div>
  )
}

export default function Dashboard({ user, isPM, isMarketer, leads, myLeads, staff, nav, onAutoAssign }) {
  const data = isPM ? leads : myLeads
  const now = new Date()
  const thisMonth = data.filter(l => {
    const d = new Date(l.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const registered = data.filter(l => l.status === 'registered')
  const convRate = data.length ? Math.round((registered.length / data.length) * 100) : 0

  const unassignedCount = leads.filter(l => !l.assigned_to).length
  const followUpCount   = data.filter(l => l.status === 'follow_up').length
  const pendingCount    = data.filter(l => l.status === 'pending_registration').length

  const marketers = isPM ? staff.filter(s => s.role === 'marketer').map(m => ({
    ...m,
    total: leads.filter(l => l.assigned_to === m.id).length,
    registered: leads.filter(l => l.assigned_to === m.id && l.status === 'registered').length,
  })).sort((a, b) => b.registered - a.registered) : []

  const sources = SOURCES.map(s => ({ label: s, value: data.filter(l => l.source === s).length })).filter(s => s.value > 0)

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)', letterSpacing:'-.01em' }}>Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user.name.split(' ')[0]}</h1>
        <p style={{ fontSize:12.5, color:'var(--ink-2)', marginTop:2 }}>{new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
      </div>

      {/* KPI strip */}
      <KpiStrip cols={isPM ? 4 : 4}>
        <Kpi label="Total Leads" value={data.length} delta="this month" up={`+${thisMonth.length}`}/>
        <Kpi label="Registered" value={registered.length} delta="conversion rate" up={convRate >= 20 ? `${convRate}%` : undefined} down={convRate < 20 ? `${convRate}%` : undefined}/>
        {isPM ? (
          <Kpi label="Unassigned" value={unassignedCount} delta="need assignment" down={unassignedCount > 0 ? `${unassignedCount}` : undefined}/>
        ) : (
          <Kpi label="Follow Up" value={followUpCount}/>
        )}
        <Kpi label="Pending Reg." value={pendingCount}/>
      </KpiStrip>
      {isPM && <SmartAlerts leads={leads} nav={nav} onAutoAssign={onAutoAssign}/>}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, alignItems:'start' }}>
        {/* Recent leads table */}
        <div className="panel" style={{ overflow:'hidden' }}>
          <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Recent Leads</span>
            <button onClick={() => nav('leads')} style={{ fontSize:12, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>View all →</button>
          </div>
          {(isPM ? leads : myLeads).length === 0
            ? <EmptyState title="No leads yet" action={<button onClick={() => nav('add')} className="btn btn-primary btn-sm">Add Lead</button>}/>
            : (isPM ? leads : myLeads).slice(0, 8).map(l => (
                <div key={l.id} onClick={() => nav('leads', l)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--row-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  <Avatar name={l.name} size={28}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:500, color:'var(--ink)' }}>{l.name}</div>
                    <div style={{ fontSize:11.5, color:'var(--ink-3)' }}>{l.phone} · {l.assignee?.name || 'Unassigned'}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <Badge status={l.status}/>
                    <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{timeAgo(l.created_at)}</div>
                  </div>
                </div>
              ))
          }
        </div>

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {sources.length > 0 && (
            <div className="panel" style={{ padding:14 }}>
              <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:12 }}>Lead Sources</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {sources.map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:11.5, color:'var(--ink-2)', width:60, textTransform:'capitalize', flexShrink:0 }}>{s.label}</span>
                    <ProgressBar value={s.value} max={data.length}/>
                    <span className="mono" style={{ fontSize:11, color:'var(--ink)', width:18, textAlign:'right', flexShrink:0 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isPM && marketers.length > 0 && (
            <div className="panel" style={{ padding:14 }}>
              <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:12 }}>Marketer Leaderboard</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {marketers.slice(0, 5).map((m, i) => (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <span className="mono" style={{ fontSize:10, color:'var(--ink-3)', width:12, flexShrink:0 }}>{i+1}</span>
                    <Avatar name={m.name} size={24}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:500, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize:11, color:'var(--ink-3)' }}>{m.total} leads</div>
                    </div>
                    <span className="mono" style={{ fontSize:12, fontWeight:500, color:'var(--ok)' }}>{m.registered}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isPM && unassignedCount > 0 && (
            <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:'var(--r)', padding:14 }}>
              <div style={{ fontSize:10.5, fontWeight:600, color:'#92400e', marginBottom:4 }}>Unassigned Leads</div>
              <div className="mono" style={{ fontSize:22, fontWeight:500, color:'#78350f' }}>{unassignedCount}</div>
              <div style={{ fontSize:11, color:'#b45309', margin:'3px 0 10px' }}>leads need assignment</div>
              <button onClick={() => nav('leads')} style={{ fontSize:11.5, fontWeight:600, color:'#92400e', background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'underline' }}>Assign now →</button>
            </div>
          )}

          {isMarketer && (
            <div className="panel" style={{ padding:14 }}>
              <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:12 }}>My Pipeline</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {['assigned','contacted','follow_up','pending_registration','registered'].map(s => {
                  const count = myLeads.filter(l => l.status === s).length
                  if (!count) return null
                  return (
                    <div key={s} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Badge status={s} style={{ width:110, flexShrink:0 }}/>
                      <ProgressBar value={count} max={myLeads.length}/>
                      <span className="mono" style={{ fontSize:11, color:'var(--ink)', width:18, textAlign:'right', flexShrink:0 }}>{count}</span>
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
