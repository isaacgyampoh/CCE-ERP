import { useState } from 'react'
import { Avatar, ScoreBadge, EmptyState } from '@/components/ui'
import { STATUS } from '@/lib/constants'
import { timeAgo, leadScore } from '@/lib/helpers'

const STAGES = [
  'new', 'assigned', 'contacted', 'follow_up',
  'pending_registration', 'registered', 'next_session',
]

export default function Pipeline({ leads, isPM, onStatusChange, onSelect }) {
  const [moving, setMoving] = useState(null) // leadId being moved

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
          <h1 className="text-xl font-bold text-slate-900">Lead Pipeline</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Click a card to open · use ← → arrows to move between stages
          </p>
        </div>
        <div className="text-xs text-slate-400 font-medium">{total} total leads</div>
      </div>

      {/* Summary row */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STAGES.map(stage => {
          const count = leads.filter(l => l.status === stage).length
          const s = STATUS[stage]
          return (
            <div key={stage} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${s.cls}`}>
              <span>{s.label}</span>
              <span className="opacity-70">{count}</span>
            </div>
          )
        })}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[480px]">
        {STAGES.map((stage, si) => {
          const stageLeads = leads.filter(l => l.status === stage)
          const s = STATUS[stage]
          return (
            <div key={stage} className="flex-shrink-0 w-56">
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={`badge ${s.cls} text-[10px]`}>{s.label}</span>
                <span className="text-[11px] font-bold text-slate-300">{stageLeads.length}</span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {stageLeads.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-100 h-20 flex items-center justify-center">
                    <span className="text-[10px] text-slate-200">Empty</span>
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
                          <div className="text-[11px] font-semibold text-slate-900 truncate leading-tight">
                            {lead.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {lead.phone || 'No phone'}
                          </div>
                        </div>
                      </div>

                      {/* Score */}
                      <ScoreBadge score={score}/>

                      {/* Assignee + time */}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[9px] text-slate-300 truncate max-w-[80px]">
                          {lead.assignee?.name || 'Unassigned'}
                        </span>
                        <span className="text-[9px] text-slate-300">{timeAgo(lead.updated_at)}</span>
                      </div>

                      {/* Move buttons (hover reveal) */}
                      <div className={`flex gap-1 mt-2 transition-opacity ${isMoving ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {si > 0 && (
                          <button
                            onClick={e => move(lead, STAGES[si - 1], e)}
                            disabled={!!moving}
                            title={`Move to ${STATUS[STAGES[si - 1]]?.label}`}
                            className="flex-1 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold transition disabled:opacity-40"
                          >
                            ←
                          </button>
                        )}
                        {si < STAGES.length - 1 && (
                          <button
                            onClick={e => move(lead, STAGES[si + 1], e)}
                            disabled={!!moving}
                            title={`Move to ${STATUS[STAGES[si + 1]]?.label}`}
                            className="flex-1 h-6 rounded bg-blue-100 hover:bg-blue-200 text-blue-600 text-xs font-bold transition disabled:opacity-40"
                          >
                            →
                          </button>
                        )}
                        {isMoving && (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="w-3 h-3 border border-slate-300 border-t-blue-600 rounded-full animate-spin"/>
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
        <EmptyState icon="📋" title="No leads in pipeline" sub="Add leads to see them here"/>
      )}
    </div>
  )
}
