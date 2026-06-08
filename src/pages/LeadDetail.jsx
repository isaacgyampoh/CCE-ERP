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
    <div className="fade-up" style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16, alignItems:'start' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {/* Header */}
        <div className="panel" style={{ padding:'14px 16px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <Avatar name={lead.name} size={42}/>
              <div>
                <h2 style={{ fontSize:15, fontWeight:600, color:'var(--ink)' }}>{lead.name}</h2>
                <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:6, marginTop:5 }}>
                  <Badge status={lead.status}/>
                  {lead.whatsapp_sent && <span className="tag">WA Sent</span>}
                  {lead.scholarship_interest && <span className="tag">Scholarship</span>}
                  {lead.source === 'personal' && <span className="tag">Personal</span>}
                  {localTags.map(t => {
                    const tag = LEAD_TAGS.find(x => x.name === t)
                    return tag ? <span key={t} className="tag">{tag.label}</span> : null
                  })}
                </div>
              </div>
            </div>
            <button onClick={() => setEditMode(!editMode)} className="btn btn-ghost btn-sm">{Icon.edit} Edit</button>
          </div>

          {editMode ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ gridColumn:'1/-1' }}><Label>Full Name</Label><input value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="inp"/></div>
              <div><Label>Phone</Label><input value={editData.phone||''} onChange={e => setEditData({...editData, phone: e.target.value})} className="inp"/></div>
              <div><Label>Email</Label><input value={editData.email||''} onChange={e => setEditData({...editData, email: e.target.value})} className="inp"/></div>
              <div><Label>City</Label><input value={editData.city||''} onChange={e => setEditData({...editData, city: e.target.value})} className="inp"/></div>
              <div style={{ gridColumn:'1/-1' }}><Label>Notes</Label><textarea value={editData.notes||''} onChange={e => setEditData({...editData, notes: e.target.value})} className="inp" rows="2"/></div>
              <div style={{ gridColumn:'1/-1', display:'flex', gap:8 }}>
                <button onClick={saveEdit} className="btn btn-primary btn-sm">{Icon.check} Save</button>
                <button onClick={() => setEditMode(false)} className="btn btn-ghost btn-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px 16px' }}>
              {[
                { label: 'Phone',       value: lead.phone },
                { label: 'Email',       value: lead.email || '—' },
                { label: 'City',        value: lead.city || '—' },
                { label: 'Source',      value: lead.source },
                { label: 'Course',      value: lead.course_interest || '—' },
                { label: 'Mode',        value: lead.mode_preference || '—' },
                { label: 'Assigned To', value: lead.assignee?.name || 'Unassigned' },
                { label: 'Created',     value: fmtDate(lead.created_at) },
                { label: 'Updated',     value: timeAgo(lead.updated_at) },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:2 }}>{f.label}</div>
                  <div style={{ fontSize:12.5, fontWeight:500, color:'var(--ink)', textTransform:'capitalize' }}>{f.value}</div>
                </div>
              ))}
              {lead.notes && (
                <div style={{ gridColumn:'1/-1' }}>
                  <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:4 }}>Notes</div>
                  <div style={{ fontSize:12.5, color:'var(--ink-2)', background:'var(--bg)', borderRadius:'var(--r)', padding:'8px 10px' }}>{lead.notes}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="panel" style={{ padding:'14px 16px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:12 }}>Activity Log</div>
          <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:12, marginBottom:14, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="inp" style={{ width:'auto' }}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {newStatus !== lead.status && (
                <span style={{ fontSize:10.5, fontWeight:600, color:'var(--warn)', background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:4, padding:'2px 7px' }}>Status will change</span>
              )}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
                placeholder="Add a note or update…" className="inp" style={{ flex:1 }}/>
              <button onClick={addComment} disabled={!newComment.trim() || posting} className="btn btn-primary press">{posting ? '…' : 'Post'}</button>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {comments.length === 0
              ? <p style={{ fontSize:12, color:'var(--ink-3)', textAlign:'center', padding:'24px 0' }}>No activity yet.</p>
              : comments.map(c => (
                <div key={c.id} style={{ display:'flex', gap:10 }}>
                  <Avatar name={c.staff_name} size={28}/>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--ink)' }}>{c.staff_name}</span>
                      {c.status_change && <Badge status={c.status_change}/>}
                      <span style={{ fontSize:10.5, color:'var(--ink-3)', marginLeft:'auto' }}>{timeAgo(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize:12.5, color:'var(--ink-2)', background:'var(--bg)', borderRadius:'var(--r)', padding:'7px 10px' }}>{c.comment}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {/* Quick actions */}
        <div className="panel" style={{ padding:14 }}>
          <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:10 }}>Quick Actions</div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {lead.phone && <>
              <a href={`tel:${lead.phone}`} className="press"
                style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 8px', borderRadius:'var(--r)', textDecoration:'none', color:'var(--ink)', fontSize:12.5, fontWeight:500, transition:'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background=''}>
                <span style={{ width:28, height:28, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', display:'grid', placeItems:'center', color:'var(--ink-2)', flexShrink:0 }}>{Icon.phone}</span>
                Call {lead.phone}
              </a>
              <a href={`https://wa.me/${phone}?text=${encodeURIComponent(WA_ASSIGN_MSG(lead.name, lead.assignee?.name || 'CCE'))}`} target="_blank" rel="noopener" className="press"
                style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 8px', borderRadius:'var(--r)', textDecoration:'none', color:'var(--ink)', fontSize:12.5, fontWeight:500, transition:'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background=''}>
                <span style={{ width:28, height:28, background:'var(--accent-wash)', border:'1px solid var(--border)', borderRadius:'var(--r)', display:'grid', placeItems:'center', color:'var(--accent)', flexShrink:0 }}>{Icon.wa}</span>
                WhatsApp
              </a>
            </>}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="press"
                style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 8px', borderRadius:'var(--r)', textDecoration:'none', color:'var(--ink)', fontSize:12.5, fontWeight:500, transition:'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background=''}>
                <span style={{ width:28, height:28, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r)', display:'grid', placeItems:'center', color:'var(--ink-2)', flexShrink:0 }}>{Icon.mail}</span>
                Email
              </a>
            )}
          </div>
        </div>

        {/* Registration link */}
        {(isPM || isMarketer) && lead.assigned_to && lead.status !== 'registered' && (
          <div className="panel" style={{ padding:14 }}>
            <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:4 }}>Registration Link</div>
            <p style={{ fontSize:11, color:'var(--ink-3)', marginBottom:10 }}>Send this unique link to complete registration &amp; payment.</p>
            {regLink && (
              <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:'7px 8px', marginBottom:10 }}>
                <div style={{ fontSize:10.5, fontFamily:'IBM Plex Mono,monospace', color:'var(--ink-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{regLink}</div>
              </div>
            )}
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => onRegLink(lead)} className="btn btn-primary btn-sm press" style={{ flex:1 }}>
                {Icon.wa} Send via WA
              </button>
              <button onClick={copyRegLink} className="btn btn-ghost btn-sm press">
                {copied ? Icon.check : Icon.copy}
              </button>
            </div>
          </div>
        )}

        {/* Registered info */}
        {lead.status === 'registered' && (
          <div style={{ background:'var(--accent-wash)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:14 }}>
            <div style={{ fontSize:10.5, fontWeight:600, color:'var(--accent-ink)', marginBottom:6 }}>Registered &amp; Paid</div>
            {lead.reg_fee_paid && <div className="mono" style={{ fontSize:20, fontWeight:500, color:'var(--ok)' }}>{fmtCurrency(lead.reg_fee_paid)}</div>}
            <div style={{ fontSize:11, color:'var(--ink-2)', marginTop:2 }}>{fmtDate(lead.reg_paid_at)}</div>
          </div>
        )}

        {/* Tags */}
        <div className="panel" style={{ padding:14 }}>
          <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:10 }}>Tags</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {LEAD_TAGS.map(tag => (
              <button key={tag.name} onClick={() => toggleTag(tag.name)}
                style={{
                  fontSize:11, padding:'2px 8px', borderRadius:4, cursor:'pointer', fontFamily:'IBM Plex Mono,monospace', transition:'all .12s',
                  border: localTags.includes(tag.name) ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
                  background: localTags.includes(tag.name) ? 'var(--accent-wash)' : 'var(--panel)',
                  color: localTags.includes(tag.name) ? 'var(--accent-ink)' : 'var(--ink-3)',
                  fontWeight: localTags.includes(tag.name) ? 600 : 400,
                }}>
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Assign (PM only) */}
        {isPM && (
          <div className="panel" style={{ padding:14 }}>
            <div style={{ fontSize:10.5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:3 }}>Assign to Marketer</div>
            <p style={{ fontSize:11, color:'var(--ink-3)', marginBottom:10 }}>Auto-sends WhatsApp intro on assignment.</p>
            {marketers.length === 0
              ? <p style={{ fontSize:12, color:'var(--ink-3)', textAlign:'center', padding:'16px 0' }}>No marketers added yet.</p>
              : (
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {marketers.map(m => (
                    <button key={m.id} onClick={() => handleAssign(m.id)} disabled={assigning === m.id}
                      style={{
                        display:'flex', alignItems:'center', gap:10, padding:'7px 8px', borderRadius:'var(--r)',
                        border: lead.assigned_to === m.id ? '1px solid var(--accent)' : '1px solid transparent',
                        background: lead.assigned_to === m.id ? 'var(--accent-wash)' : 'transparent',
                        cursor:'pointer', textAlign:'left', transition:'background .12s',
                      }}
                      onMouseEnter={e => { if (lead.assigned_to !== m.id) e.currentTarget.style.background='var(--bg)' }}
                      onMouseLeave={e => { if (lead.assigned_to !== m.id) e.currentTarget.style.background='transparent' }}>
                      <Avatar name={m.name} size={26}/>
                      <span style={{ flex:1, fontSize:12.5, fontWeight:500, color:'var(--ink)' }}>{m.name}</span>
                      {assigning === m.id && <div style={{ width:12, height:12, border:'1.5px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>}
                      {lead.assigned_to === m.id && <span style={{ fontSize:10, fontWeight:600, color:'var(--accent)' }}>Current</span>}
                    </button>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  )
}
