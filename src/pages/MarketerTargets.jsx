import { useState, useEffect } from 'react'
import { Avatar, Modal, Spinner, EmptyState, Label } from '@/components/ui'
import { fmtCurrency } from '@/lib/helpers'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function MarketerTargets({ sb, staff, leads }) {
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())

  useEffect(() => { loadTargets() }, [month, year])

  const loadTargets = async () => {
    setLoading(true)
    const { data } = await sb.from('marketer_targets').select('*').eq('month', month).eq('year', year)
    setTargets(data || [])
    setLoading(false)
  }

  const marketers = staff.filter(s => s.role === 'marketer')

  const monthLeads = leads.filter(l => {
    const d = new Date(l.created_at)
    return d.getMonth() + 1 === month && d.getFullYear() === year
  })

  const getTarget = (mid) => targets.find(t => t.marketer_id === mid)
  const getLeads  = (mid) => monthLeads.filter(l => l.assigned_to === mid).length
  const getRegs   = (mid) => monthLeads.filter(l => l.assigned_to === mid && l.status === 'registered').length
  const getComm   = (mid) => {
    const t = getTarget(mid)
    return t?.commission_rate ? getRegs(mid) * t.commission_rate : 0
  }

  const totLeads = monthLeads.length
  const totRegs  = monthLeads.filter(l => l.status === 'registered').length
  const totComm  = marketers.reduce((s, m) => s + getComm(m.id), 0)

  const saveTarget = async () => {
    setSaving(true)
    const existing = getTarget(editing.marketer_id)
    if (existing?.id) {
      await sb.from('marketer_targets').update({
        target_leads: editing.target_leads,
        target_registrations: editing.target_registrations,
        commission_rate: editing.commission_rate,
      }).eq('id', existing.id)
    } else {
      await sb.from('marketer_targets').insert({
        marketer_id: editing.marketer_id,
        month, year,
        target_leads: editing.target_leads,
        target_registrations: editing.target_registrations,
        commission_rate: editing.commission_rate,
      })
    }
    await loadTargets()
    setSaving(false)
    setEditing(null)
  }

  const openEdit = (m) => {
    const t = getTarget(m.id)
    setEditing({
      marketer_id: m.id,
      marketer_name: m.name,
      target_leads: t?.target_leads ?? 20,
      target_registrations: t?.target_registrations ?? 5,
      commission_rate: t?.commission_rate ?? 50,
    })
  }

  const Bar = ({ value, target }) => {
    if (!target) return <span style={{ fontSize:10, color:'var(--ink-3)' }}>no target set</span>
    const pct = Math.min(100, Math.round((value / target) * 100))
    const barColor = pct >= 100 ? 'var(--ok)' : 'var(--accent)'
    const textColor = pct >= 100 ? 'var(--ok)' : 'var(--ink-2)'
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
        <div style={{ flex:1, height:8, background:'var(--bg)', borderRadius:4, overflow:'hidden', border:'1px solid var(--border)' }}>
          <div style={{ height:'100%', borderRadius:4, background:barColor, width:`${pct}%`, transition:'width .3s' }}/>
        </div>
        <span style={{ fontSize:11, fontWeight:700, width:36, textAlign:'right', color:textColor }}>{pct}%</span>
      </div>
    )
  }

  return (
    <div className="fade-up space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Targets & Commission</h1>
          <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>Monthly goals and commission tracking per marketer</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="inp h-9 text-xs w-auto">
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="inp h-9 text-xs w-auto">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card"><div className="stat-value">{totLeads}</div><div className="stat-label">Leads This Month</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--ok)' }}>{totRegs}</div><div className="stat-label">Registrations</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--info)' }}>{marketers.length}</div><div className="stat-label">Active Marketers</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--accent)' }}>{fmtCurrency(totComm)}</div><div className="stat-label">Total Commission</div></div>
      </div>

      {/* Marketer cards */}
      {loading ? <Spinner size={24}/> : marketers.length === 0 ? (
        <EmptyState title="No marketers found" sub="Add marketer accounts in Staff Management"/>
      ) : (
        <div className="space-y-3">
          {marketers.map(m => {
            const t       = getTarget(m.id)
            const aLeads  = getLeads(m.id)
            const aRegs   = getRegs(m.id)
            const comm    = getComm(m.id)
            const convPct = aLeads ? Math.round((aRegs / aLeads) * 100) : 0

            return (
              <div key={m.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={m.name} size={42}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div>
                        <div style={{ fontWeight:600, color:'var(--ink)' }}>{m.name}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:8, marginTop:4 }}>
                          <span style={{ fontSize:10, fontWeight:600, color:'var(--ink-3)' }}>{convPct}% conversion</span>
                          {comm > 0 && (
                            <span style={{ fontSize:11, fontWeight:700, color:'var(--ok)', background:'var(--accent-wash)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 8px' }}>
                              Commission: {fmtCurrency(comm)}
                            </span>
                          )}
                          {t?.commission_rate && (
                            <span style={{ fontSize:10, color:'var(--ink-3)' }}>{fmtCurrency(t.commission_rate)}/reg</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => openEdit(m)} className="btn btn-ghost btn-sm shrink-0">
                        {t ? 'Edit Target' : '+ Set Target'}
                      </button>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:11, color:'var(--ink-2)', fontWeight:500 }}>Leads Assigned</span>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--ink)' }}>
                            {aLeads}{t?.target_leads ? ` / ${t.target_leads}` : ''}
                          </span>
                        </div>
                        <Bar value={aLeads} target={t?.target_leads}/>
                      </div>
                      <div>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:11, color:'var(--ink-2)', fontWeight:500 }}>Registrations</span>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--ink)' }}>
                            {aRegs}{t?.target_registrations ? ` / ${t.target_registrations}` : ''}
                          </span>
                        </div>
                        <Bar value={aRegs} target={t?.target_registrations}/>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title={`Target — ${editing.marketer_name}`} onClose={() => setEditing(null)}>
          <p style={{ fontSize:12, color:'var(--ink-3)', marginBottom:16 }}>{MONTHS[month-1]} {year}</p>
          <div className="space-y-4">
            <div>
              <Label>Lead Target (monthly)</Label>
              <input
                type="number" min="0"
                value={editing.target_leads}
                onChange={e => setEditing(x => ({ ...x, target_leads: Number(e.target.value) }))}
                className="inp"
              />
            </div>
            <div>
              <Label>Registration Target</Label>
              <input
                type="number" min="0"
                value={editing.target_registrations}
                onChange={e => setEditing(x => ({ ...x, target_registrations: Number(e.target.value) }))}
                className="inp"
              />
            </div>
            <div>
              <Label>Commission per Registration (GH₵)</Label>
              <input
                type="number" min="0"
                value={editing.commission_rate}
                onChange={e => setEditing(x => ({ ...x, commission_rate: Number(e.target.value) }))}
                className="inp"
              />
              <p style={{ fontSize:11, color:'var(--ink-3)', marginTop:4 }}>
                Estimated: {fmtCurrency(getRegs(editing.marketer_id) * editing.commission_rate)}
                {' '}({getRegs(editing.marketer_id)} regs × {fmtCurrency(editing.commission_rate)})
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={saveTarget} disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'Saving…' : 'Save Target'}
            </button>
            <button onClick={() => setEditing(null)} className="btn btn-ghost flex-1">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
