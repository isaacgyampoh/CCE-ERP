import { useState, useEffect, useRef } from 'react'
import { Icon, Spinner, EmptyState } from '@/components/ui'

const DOC_TYPES = [
  { value: 'brochure',         label: 'Brochure',          color: 'bg-blue-100 text-blue-700'       },
  { value: 'course_outline',   label: 'Course Outline',    color: 'bg-emerald-100 text-emerald-700'  },
  { value: 'admission_letter', label: 'Admission Letter',  color: 'bg-violet-100 text-violet-700'    },
  { value: 'invoice',          label: 'Invoice',           color: 'bg-amber-100 text-amber-700'      },
  { value: 'receipt',          label: 'Receipt',           color: 'bg-green-100 text-green-700'      },
  { value: 'other',            label: 'Other',             color: 'bg-slate-100 text-slate-600'      },
]

const TRIGGERS = [
  { value: 'manual',             label: 'Manual Only',           icon: '👤', desc: 'Send manually to individual leads' },
  { value: 'lead_created',       label: 'On Lead Created',       icon: '⚡', desc: 'Auto-sent when a new lead is generated' },
  { value: 'admission_approved', label: 'On Admission Approved', icon: '🎓', desc: 'Auto-sent when admission is confirmed' },
  { value: 'payment_confirmed',  label: 'On Payment Confirmed',  icon: '✅', desc: 'Auto-sent after a fee payment is recorded' },
]

const fmtSize = (b) => {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

export default function Documents({ sb, user, leads = [] }) {
  const [docs, setDocs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending]     = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showSend, setShowSend]   = useState(null)
  const [filter, setFilter]       = useState('all')
  const [toast, setToast]         = useState(null)
  const fileRef  = useRef(null)
  const dropRef  = useRef(null)

  const [form, setForm] = useState({ name: '', type: 'brochure', trigger_event: 'manual', description: '', course: '' })
  const [file, setFile]           = useState(null)
  const [dragOver, setDragOver]   = useState(false)

  const [sendLeadId, setSendLeadId]         = useState('')
  const [sendLeadSearch, setSendLeadSearch] = useState('')
  const [sendChannels, setSendChannels]     = useState({ email: true, whatsapp: true })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => { loadDocs() }, [])

  const loadDocs = async () => {
    const { data } = await sb.from('documents').select('*').order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') setFile(f)
    else showToast('Please drop a PDF file', 'error')
  }

  const resetUpload = () => {
    setShowUpload(false)
    setFile(null)
    setForm({ name: '', type: 'brochure', trigger_event: 'manual', description: '', course: '' })
  }

  const upload = async () => {
    if (!file || !form.name.trim()) return
    setUploading(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${Date.now()}_${safeName}`
      const { error: upErr } = await sb.storage
        .from('documents')
        .upload(path, file, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw new Error(upErr.message)

      const { data: { publicUrl } } = sb.storage.from('documents').getPublicUrl(path)
      const { error: dbErr } = await sb.from('documents').insert({
        name:          form.name.trim(),
        type:          form.type,
        description:   form.description.trim() || null,
        file_name:     file.name,
        file_url:      publicUrl,
        file_size:     file.size,
        trigger_event: form.trigger_event,
        course:        form.course.trim() || null,
        is_active:     true,
        sends_count:   0,
        created_by:    user.id,
      })
      if (dbErr) throw new Error(dbErr.message)

      showToast(`"${form.name}" uploaded successfully`)
      resetUpload()
      await loadDocs()
    } catch (e) {
      showToast(e.message || 'Upload failed', 'error')
    }
    setUploading(false)
  }

  const toggleActive = async (doc) => {
    await sb.from('documents').update({ is_active: !doc.is_active }).eq('id', doc.id)
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_active: !d.is_active } : d))
  }

  const deleteDoc = async (doc) => {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    const path = doc.file_url.split('/documents/').pop()?.split('?')[0]
    if (path) await sb.storage.from('documents').remove([path]).catch(() => {})
    await sb.from('documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    showToast('Document deleted')
  }

  const sendDoc = async () => {
    if (!sendLeadId || !showSend) return
    const anyChannel = Object.values(sendChannels).some(Boolean)
    if (!anyChannel) { showToast('Select at least one channel', 'error'); return }
    setSending(true)
    try {
      const lead = leads.find(l => l.id === sendLeadId)
      const channels = Object.keys(sendChannels).filter(k => sendChannels[k])
      const res = await fetch('/api/documents/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: showSend.id,
          lead_id:     sendLeadId,
          channels,
          context:     { name: lead?.name, course: lead?.course_interest },
          sent_by:     user.id,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Send failed')
      if (data.wa_link && sendChannels.whatsapp) window.open(data.wa_link, '_blank')
      showToast(`Document sent to ${lead?.name || 'lead'}`)
      setShowSend(null)
      setSendLeadId('')
      setSendLeadSearch('')
      await loadDocs()
    } catch (e) {
      showToast(e.message || 'Failed to send', 'error')
    }
    setSending(false)
  }

  const filtered = docs.filter(d => {
    if (filter === 'auto')   return d.trigger_event !== 'manual'
    if (filter === 'manual') return d.trigger_event === 'manual'
    return true
  })

  const docType    = (t) => DOC_TYPES.find(x => x.value === t) || DOC_TYPES[DOC_TYPES.length - 1]
  const triggerInfo = (t) => TRIGGERS.find(x => x.value === t) || TRIGGERS[0]

  const filteredLeads = leads.filter(l =>
    !sendLeadSearch ||
    l.name?.toLowerCase().includes(sendLeadSearch.toLowerCase()) ||
    l.phone?.includes(sendLeadSearch)
  ).slice(0, 8)

  if (loading) return <Spinner size={24} />

  return (
    <div className="fade-up space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg fade-up ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Document Hub</h1>
          <p className="text-sm text-slate-400 mt-0.5">Upload PDFs — auto-sent on triggers or manually to any lead</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn btn-primary flex items-center gap-2 press">
          {Icon.import} Upload PDF
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card text-center">
          <div className="stat-value text-blue-700">{docs.length}</div>
          <div className="stat-label">Documents</div>
        </div>
        <div className="stat-card text-center">
          <div className="stat-value text-emerald-700">{docs.filter(d => d.trigger_event !== 'manual' && d.is_active).length}</div>
          <div className="stat-label">Auto-Send Active</div>
        </div>
        <div className="stat-card text-center">
          <div className="stat-value text-violet-700">{docs.reduce((s, d) => s + (d.sends_count || 0), 0)}</div>
          <div className="stat-label">Total Sends</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[['all','All'],['auto','Auto-Send'],['manual','Manual']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${filter === v ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-300'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Trigger legend */}
      <div className="flex flex-wrap gap-2">
        {TRIGGERS.filter(t => t.value !== 'manual').map(t => (
          <div key={t.value} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-sm">{t.icon}</span>
            <span className="text-[11px] font-medium text-slate-600">{t.label}</span>
            <span className="text-[10px] text-slate-400 hidden sm:block">— {t.desc}</span>
          </div>
        ))}
      </div>

      {/* Documents grid */}
      {filtered.length === 0 ? (
        <EmptyState icon="📄" title="No documents yet" sub="Upload a PDF — brochures, course outlines, admission letters, receipts…"/>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => {
            const dt = docType(doc.type)
            const tr = triggerInfo(doc.trigger_event)
            return (
              <div key={doc.id} className={`card p-4 space-y-3 transition-opacity ${doc.is_active ? '' : 'opacity-50'}`}>
                {/* Top row */}
                <div className="flex items-start gap-3">
                  <div className="w-11 h-14 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">📄</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-sm truncate" title={doc.name}>{doc.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${dt.color}`}>{dt.label}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${doc.trigger_event === 'manual' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>
                        {tr.icon} {tr.label}
                      </span>
                    </div>
                    {doc.course && (
                      <div className="text-[10px] text-slate-400 mt-1 truncate">Course: {doc.course}</div>
                    )}
                  </div>
                </div>

                {doc.description && (
                  <p className="text-xs text-slate-500 line-clamp-2">{doc.description}</p>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>{fmtSize(doc.file_size)}</span>
                  <span>{doc.sends_count || 0} sends</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => { setShowSend(doc); setSendLeadId(''); setSendLeadSearch('') }}
                    className="flex-1 btn text-xs h-8 bg-blue-50 text-blue-700 hover:bg-blue-100 border-0 press font-semibold">
                    Send to Lead
                  </button>
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition text-sm"
                    title="Preview PDF">
                    ↗
                  </a>
                  <button onClick={() => toggleActive(doc)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition text-xs font-bold ${doc.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                    title={doc.is_active ? 'Active — click to pause auto-send' : 'Paused — click to activate'}>
                    {doc.is_active ? '✓' : '⏸'}
                  </button>
                  <button onClick={() => deleteDoc(doc)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition text-lg leading-none"
                    title="Delete document">
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Upload modal ──────────────────────────────────────── */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && resetUpload()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Upload Document</h2>
              <button onClick={resetUpload} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Drop zone */}
              <div
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
                <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]) }}/>
                {file ? (
                  <div className="space-y-1">
                    <div className="text-3xl">📄</div>
                    <div className="text-sm font-semibold text-emerald-800 truncate">{file.name}</div>
                    <div className="text-xs text-emerald-600">{fmtSize(file.size)} — click to change</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-3xl">📂</div>
                    <div className="text-sm font-medium text-slate-600">Drop PDF here or click to browse</div>
                    <div className="text-xs text-slate-400">PDF files only</div>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Document Name *</label>
                <input className="input" placeholder="e.g. Data Science — Course Outline"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={form.type}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Auto-Send Trigger</label>
                  <select className="input" value={form.trigger_event}
                    onChange={e => setForm(p => ({ ...p, trigger_event: e.target.value }))}>
                    {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Course filter <span className="text-slate-400 font-normal">(optional — blank = all courses)</span></label>
                <input className="input" placeholder="e.g. Data Science"
                  value={form.course} onChange={e => setForm(p => ({ ...p, course: e.target.value }))}/>
              </div>

              <div>
                <label className="label">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Brief note about this document…"
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}/>
              </div>

              {form.trigger_event !== 'manual' && (
                <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
                  <strong>Auto-send active:</strong> {triggerInfo(form.trigger_event).desc}.
                  {form.course ? ` Only for leads interested in "${form.course}".` : ' Sent to all matching leads.'}
                </div>
              )}

              <button onClick={upload} disabled={!file || !form.name.trim() || uploading}
                className="btn btn-primary w-full h-11 press disabled:opacity-50">
                {uploading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Uploading…</>
                ) : 'Upload Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send modal ────────────────────────────────────────── */}
      {showSend && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowSend(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Send to Lead</h2>
              <button onClick={() => setShowSend(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Doc preview */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-2xl">📄</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{showSend.name}</div>
                  <div className="text-xs text-slate-400 truncate">{showSend.file_name} · {fmtSize(showSend.file_size)}</div>
                </div>
              </div>

              {/* Lead search */}
              <div className="relative">
                <label className="label">Search Lead</label>
                <input className="input" placeholder="Type name or phone…"
                  value={sendLeadSearch}
                  onChange={e => { setSendLeadSearch(e.target.value); setSendLeadId('') }}/>
                {sendLeadSearch && !sendLeadId && filteredLeads.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 left-0 right-0 border border-slate-200 rounded-xl bg-white shadow-lg overflow-hidden">
                    {filteredLeads.map(l => (
                      <button key={l.id}
                        onClick={() => { setSendLeadId(l.id); setSendLeadSearch(l.name) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 text-left border-b border-slate-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900">{l.name}</div>
                          <div className="text-xs text-slate-400">{l.phone} {l.course_interest ? `· ${l.course_interest}` : ''}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Channel selector */}
              <div>
                <label className="label">Send via</label>
                <div className="flex gap-4">
                  {[['email','📧 Email'],['whatsapp','💬 WhatsApp']].map(([k, lbl]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={!!sendChannels[k]}
                        onChange={e => setSendChannels(p => ({ ...p, [k]: e.target.checked }))}
                        className="rounded border-slate-300"/>
                      <span className="text-sm text-slate-700">{lbl}</span>
                    </label>
                  ))}
                </div>
                {sendChannels.whatsapp && (
                  <p className="text-[11px] text-slate-400 mt-1">WhatsApp will open in a new tab with a pre-filled message and PDF link.</p>
                )}
              </div>

              <button onClick={sendDoc}
                disabled={!sendLeadId || sending || !Object.values(sendChannels).some(Boolean)}
                className="btn btn-primary w-full h-11 press disabled:opacity-50">
                {sending ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Sending…</>
                ) : 'Send Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
