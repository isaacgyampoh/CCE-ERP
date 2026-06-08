import { SOURCES } from '@/lib/constants'
import { timeAgo, fmtDate, leadScore } from '@/lib/helpers'
import { Avatar, Badge, StatCard, EmptyState, ProgressBar, Icon } from '@/components/ui'

function SmartAlerts({ leads, nav, onAutoAssign }) {
  const now = Date.now()
  const ago = (h) => new Date(now - h * 3600000)

  const hotUncontacted = leads.filter(l => ['new','inquiry','assigned'].includes(l.status) && leadScore(l) >= 65)
  const stale = leads.filter(l => ['assigned','contacted','follow_up'].includes(l.status) && new Date(l.updated_at) < ago(48))
  const atRisk = leads.filter(l => l.status === 'pending_registration' && new Date(l.updated_at) < ago(72))
  const unassigned = leads.filter(l => !l.assigned_to).length

  if (!hotUncontacted.length && !stale.length && !atRisk.length) return null

  const AlertCard = ({ icon, title, sub, color, items }) => {
    const styles = {
      red:    { wrap: 'border-red-200 bg-red-50',     txt: 'text-red-800',    sub: 'text-red-600/70' },
      amber:  { wrap: 'border-amber-200 bg-amber-50', txt: 'text-amber-800',  sub: 'text-amber-600/70' },
      orange: { wrap: 'border-orange-200 bg-orange-50',txt: 'text-orange-800',sub: 'text-orange-600/70' },
    }
    const s = styles[color]
    return (
      <div className={`rounded-xl border p-4 ${s.wrap}`}>
        <div className={`text-xs font-bold mb-0.5 ${s.txt}`}>{icon} {title} <span className="font-normal">({items.length})</span></div>
        <div className={`text-[10px] mb-3 ${s.sub}`}>{sub}</div>
        <div className="space-y-1">
          {items.slice(0, 4).map(l => (
            <button key={l.id} onClick={() => nav('leads', l)}
              className="w-full flex items-center gap-2 text-left hover:bg-white/60 rounded-lg p-1.5 transition">
              <Avatar name={l.name} size={22}/>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold truncate ${s.txt}`}>{l.name}</div>
                <div className={`text-[10px] ${s.sub}`}>{timeAgo(l.updated_at)}</div>
              </div>
            </button>
          ))}
          {items.length > 4 && <div className={`text-[10px] pl-1 ${s.sub}`}>+{items.length - 4} more</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">{Icon.alert} Smart Alerts</h2>
        {unassigned > 0 && (
          <button onClick={onAutoAssign} className="btn btn-primary btn-sm">
            ⚡ Auto-Assign {unassigned} leads
          </button>
        )}
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {hotUncontacted.length > 0 && <AlertCard icon="🔥" title="Hot & Uncontacted" sub="Score ≥65, still early-stage" color="red" items={hotUncontacted}/>}
        {stale.length > 0 && <AlertCard icon="⏰" title="Stale Leads" sub="No activity in 48+ hours" color="amber" items={stale}/>}
        {atRisk.length > 0 && <AlertCard icon="⚠️" title="At-Risk Registrations" sub="Pending reg. 72+ hours" color="orange" items={atRisk}/>}
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
      {isPM && <SmartAlerts leads={leads} nav={nav} onAutoAssign={onAutoAssign}/>}
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
