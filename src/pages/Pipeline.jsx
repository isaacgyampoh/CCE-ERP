import { useState } from 'react'
import { Avatar, Badge, ScoreBadge, EmptyState } from '@/components/ui'
import { STATUS } from '@/lib/constants'
import { timeAgo, leadScore } from '@/lib/helpers'

const STAGES = [
  'new', 'assigned', 'contacted', 'follow_up',
  'pending_registration', 'registered', 'next_session',
]

export default function Pipeline({ leads, isPM, onStatusChange, onSelect }) {
  const [moving, setMoving] = useState(null)

  const move = async (lead, toStatus, e) => {
    e.stopPropagation()
    if (lead.status === toStatus || moving) return
    setMoving(lead.id)
    await onStatusChange(lead.id, toStatus, `Pipeline: moved to ${STATUS[toStatus]?.label}`)
    setMoving(null)
  }

  const total = leads.length

  return (
    <div className="fade-up space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Lead Pipeline</h1>
          <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>
            Click a card to open · use ← → arrows to move between stages
          </p>
        </div>
        <div style={{ fontSize:12, color:'var(--ink-3)', fontWeight:500 }}>{total} total leads</div>
      </div>

      {/* Summary row */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STAGES.map(stage => {
          const count = leads.filter(l => l.status === stage).length
          return (
            <div key={stage} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[11px] font-semibold"
              style={{ background:'var(--panel)', color:'var(--ink-2)' }}>
              <Badge status={stage}/>
              <span style={{ color:'var(--ink-3)', marginLeft:4 }}>{count}</span>
            </div>
          )
        })}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[480px]">
        {STAGES.map((stage, si) => {
          const stageLeads = leads.filter(l => l.status === stage)
          return (
            <div key={stage} className="flex-shrink-0 w-56">
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <Badge status={stage}/>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--ink-3)' }}>{stageLeads.length}</span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {stageLeads.length === 0 && (
                  <div style={{ borderRadius:'var(--r)', border:'2px dashed var(--border)', height:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ fontSize:10, color:'var(--ink-3)' }}>Empty</span>
                  </div>
                )}

                {stageLeads.map(lead => {
                  const score = leadScore(lead)
                  const isMoving = moving === lead.id
                  return (
                    <div
                      key={lead.id}
                      onClick={() => !isMoving && onSelect(lead)}
                      className="card p-3 hover:shadow-md transition cursor-pointer group select-none"
                    >
                      {/* Lead info */}
                      <div className="flex items-start gap-2 mb-2">
                        <Avatar name={lead.name} size={24}/>
                        <div className="flex-1 min-w-0">
                          <div style={{ fontSize:11, fontWeight:600, color:'var(--ink)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.3 }}>
                            {lead.name}
                          </div>
                          <div style={{ fontSize:10, color:'var(--ink-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {lead.phone || 'No phone'}
                          </div>
                        </div>
                      </div>

                      <ScoreBadge score={score}/>

                      {/* Assignee + time */}
                      <div className="flex items-center justify-between mt-1.5">
                        <span style={{ fontSize:9, color:'var(--ink-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:80 }}>
                          {lead.assignee?.name || 'Unassigned'}
                        </span>
                        <span style={{ fontSize:9, color:'var(--ink-3)' }}>{timeAgo(lead.updated_at)}</span>
                      </div>

                      {/* Move buttons */}
                      <div className={`flex gap-1 mt-2 transition-opacity ${isMoving ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {si > 0 && (
                          <button
                            onClick={e => move(lead, STAGES[si - 1], e)}
                            disabled={!!moving}
                            title={`Move to ${STATUS[STAGES[si - 1]]?.label}`}
                            style={{ flex:1, height:24, borderRadius:4, background:'var(--bg)', border:'1px solid var(--border)', color:'var(--ink-2)', fontSize:12, fontWeight:700, cursor:'pointer', transition:'background .1s', opacity: moving ? 0.4 : 1 }}
                          >
                            ←
                          </button>
                        )}
                        {si < STAGES.length - 1 && (
                          <button
                            onClick={e => move(lead, STAGES[si + 1], e)}
                            disabled={!!moving}
                            title={`Move to ${STATUS[STAGES[si + 1]]?.label}`}
                            style={{ flex:1, height:24, borderRadius:4, background:'var(--accent-wash)', border:'1px solid var(--border)', color:'var(--accent)', fontSize:12, fontWeight:700, cursor:'pointer', transition:'background .1s', opacity: moving ? 0.4 : 1 }}
                          >
                            →
                          </button>
                        )}
                        {isMoving && (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="w-3 h-3 border border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin"/>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {leads.length === 0 && (
        <EmptyState title="No leads in pipeline" sub="Add leads to see them here"/>
      )}
    </div>
  )
}
