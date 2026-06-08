import { useState, useEffect } from 'react'
import { LEAD_TAGS, STATUS, WA_ASSIGN_MSG } from '@/lib/constants'
import { formatPhone, timeAgo, fmtCurrency, fmtDate, marketerRegLink } from '@/lib/helpers'
import { Avatar, Badge, Label, Icon } from '@/components/ui'

export default function LeadDetail({ lead, staff, user, isPM, isMarketer, sb, onAssign, onStatusChange, onRegLink, onRefresh }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [newStatus, setNewStatus] = useState(lead.status)
  const [posting, setPosting] = useState(false)
  const [assigning, setAssigning] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({ name: lead.name, phone: lead.phone, email: lead.email, notes: lead.notes, city: lead.city })
  const [copied, setCopied] = useState(false)
  const [localTags, setLocalTags] = useState(lead.tags || [])

  useEffect(() => {
    sb.from('lead_comments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: true })
      .then(({ data }) => setComments(data || []))
  }, [lead.id])

  const addComment = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    const statusChanged = newStatus !== lead.status
    await onStatusChange(lead.id, statusChanged ? newStatus : lead.status, newComment.trim())
    setNewComment('')
    const { data } = await sb.from('lead_comments').select('*').eq('lead_id', lead.id).order('created_at', { ascending: true })
    setComments(data || [])
    await onRefresh()
    setPosting(false)
  }

  const handleAssign = async (mid) => { setAssigning(mid); await onAssign(lead.id, mid); setAssigning(null) }

  const saveEdit = async () => {
    await sb.from('leads').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', lead.id)
    await onRefresh(); setEditMode(false)
  }

  const copyRegLink = () => {
    const link = marketerRegLink(lead.assigned_to, lead.id)
    navigator.clipboard.writeText(link)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const toggleTag = async (tagName) => {
    const next = localTags.includes(tagName) ? localTags.filter(t => t !== tagName) : [...localTags, tagName]
    setLocalTags(next)
    await sb.from('leads').update({ tags: next, updated_at: new Date().toISOString() }).eq('id', lead.id)
  }

  const marketers = staff.filter(s => s.role === 'marketer')
  const phone = formatPhone(lead.phone)
  const regLink = lead.assigned_to ? marketerRegLink(lead.assigned_to, lead.id) : null

  return (
    <div className="fade-up">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Avatar name={lead.name} size={44}/>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{lead.name}</h2>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge status={lead.status}/>
                    {lead.whatsapp_sent && <span className="badge bg-green-50 text-green-600">WA Sent</span>}
                    {lead.scholarship_interest && <span className="badge bg-purple-50 text-purple-600">Scholarship</span>}
                    {lead.source === 'personal' && <span className="badge bg-violet-50 text-violet-600">Personal Lead</span>}
                    {localTags.map(t => {
                      const tag = LEAD_TAGS.find(x => x.name === t)
                      return tag ? <span key={t} className={`badge ${tag.color}`}>{tag.label}</span> : null
                    })}
                  </div>
                </div>
              </div>
              <button onClick={() => setEditMode(!editMode)} className="btn btn-ghost btn-sm">{Icon.edit} Edit</button>
            </div>
            {editMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Full Name</Label><input value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="inp"/></div>
                <div><Label>Phone</Label><input value={editData.phone||''} onChange={e => setEditData({...editData, phone: e.target.value})} className="inp"/></div>
                <div><Label>Email</Label><input value={editData.email||''} onChange={e => setEditData({...editData, email: e.target.value})} className="inp"/></div>
                <div><Label>City</Label><input value={editData.city||''} onChange={e => setEditData({...editData, city: e.target.value})} className="inp"/></div>
                <div className="col-span-2"><Label>Notes</Label><textarea value={editData.notes||''} onChange={e => setEditData({...editData, notes: e.target.value})} className="inp" rows="2"/></div>
                <div className="col-span-2 flex gap-2">
                  <button onClick={saveEdit} className="btn btn-primary btn-sm">{Icon.check} Save</button>
                  <button onClick={() => setEditMode(false)} className="btn btn-ghost btn-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                {[
                  { label: 'Phone', value: lead.phone },
                  { label: 'Email', value: lead.email || '—' },
                  { label: 'City', value: lead.city || '—' },
                  { label: 'Source', value: lead.source },
                  { label: 'Course', value: lead.course_interest || '—' },
                  { label: 'Mode', value: lead.mode_preference || '—' },
                  { label: 'Assigned To', value: lead.assignee?.name || 'Unassigned' },
                  { label: 'Created', value: fmtDate(lead.created_at) },
                  { label: 'Updated', value: timeAgo(lead.updated_at) },
                ].map(f => (
                  <div key={f.label}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{f.label}</div>
                    <div className="font-medium text-slate-700 capitalize">{f.value}</div>
                  </div>
                ))}
                {lead.notes && <div className="col-span-2 md:col-span-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Notes</div><div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{lead.notes}</div></div>}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Activity Log</h3>
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-3">
              <div className="flex items-center gap-2">
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="inp h-9 text-xs w-auto">
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {newStatus !== lead.status && <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded">Status will change</span>}
              </div>
              <div className="flex gap-2">
                <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
                  placeholder="Add a note or update…" className="inp flex-1 text-sm"/>
                <button onClick={addComment} disabled={!newComment.trim() || posting} className="btn btn-primary press">{posting ? '…' : 'Post'}</button>
              </div>
            </div>
            <div className="space-y-4">
              {comments.length === 0 ? <p className="text-xs text-slate-300 text-center py-6">No activity yet.</p> :
                comments.map(c => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={c.staff_name} size={28}/>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-800">{c.staff_name}</span>
                        {c.status_change && <Badge status={c.status_change}/>}
                        <span className="text-[10px] text-slate-300 ml-auto">{timeAgo(c.created_at)}</span>
                      </div>
                      <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{c.comment}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="card p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</h3>
            <div className="space-y-1.5">
              {lead.phone && <>
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                  <span className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">{Icon.phone}</span>Call {lead.phone}
                </a>
                <a href={`https://wa.me/${phone}?text=${encodeURIComponent(WA_ASSIGN_MSG(lead.name, lead.assignee?.name || 'CCE'))}`} target="_blank" rel="noopener"
                  className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                  <span className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center text-green-600">{Icon.wa}</span>WhatsApp
                </a>
              </>}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition text-sm text-slate-700 font-medium press">
                <span className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center text-violet-600">{Icon.mail}</span>Email
              </a>}
            </div>
          </div>

          {/* Registration link */}
          {(isPM || isMarketer) && lead.assigned_to && lead.status !== 'registered' && (
            <div className="card p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Registration Link</h3>
              <p className="text-[10px] text-slate-400 mb-3">Send this unique link to the lead to complete registration & payment.</p>
              {regLink && (
                <div className="bg-slate-50 rounded-lg p-2 mb-3">
                  <div className="text-[10px] font-mono text-slate-500 truncate">{regLink}</div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => onRegLink(lead)} className="btn btn-primary flex-1 btn-sm">
                  {Icon.wa} Send via WA
                </button>
                <button onClick={copyRegLink} className="btn btn-ghost btn-sm">
                  {copied ? Icon.check : Icon.copy}
                </button>
              </div>
            </div>
          )}

          {/* Registered info */}
          {lead.status === 'registered' && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="text-xs font-bold text-emerald-800 mb-2">🎓 Registered & Paid</div>
              {lead.reg_fee_paid && <div className="text-lg font-bold text-emerald-700">{fmtCurrency(lead.reg_fee_paid)}</div>}
              <div className="text-[11px] text-emerald-600">{fmtDate(lead.reg_paid_at)}</div>
            </div>
          )}

          {/* Tags */}
          <div className="card p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_TAGS.map(tag => (
                <button
                  key={tag.name}
                  onClick={() => toggleTag(tag.name)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition
                    ${localTags.includes(tag.name) ? `${tag.color} border-transparent` : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assign (PM only) */}
          {isPM && (
            <div className="card p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Assign to Marketer</h3>
              <p className="text-[10px] text-slate-400 mb-3">Auto-sends WhatsApp intro to the lead on assignment.</p>
              {marketers.length === 0 ? <p className="text-xs text-slate-300 text-center py-4">No marketers added yet.</p> : (
                <div className="space-y-1.5">
                  {marketers.map(m => (
                    <button key={m.id} onClick={() => handleAssign(m.id)} disabled={assigning === m.id}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition press ${lead.assigned_to === m.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                      <Avatar name={m.name} size={28}/>
                      <span className="flex-1 text-sm font-medium text-slate-700">{m.name}</span>
                      {assigning === m.id && <div className="w-3 h-3 border border-slate-300 border-t-blue-600 rounded-full animate-spin"/>}
                      {lead.assigned_to === m.id && <span className="text-[10px] text-blue-600 font-bold">Current</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
