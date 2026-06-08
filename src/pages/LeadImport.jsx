import { useState, useRef } from 'react'
import { Avatar, Spinner, Badge } from '@/components/ui'
import { SOURCES, STATUS } from '@/lib/constants'

const COLUMN_MAP = {
  name:            ['name', 'full name', 'fullname', 'full_name', 'student name', 'lead name'],
  phone:           ['phone', 'mobile', 'telephone', 'phone number', 'phone_number', 'tel', 'contact'],
  email:           ['email', 'e-mail', 'email address', 'mail'],
  course_interest: ['course', 'course interest', 'course_interest', 'program', 'programme', 'interest'],
  source:          ['source', 'lead source', 'lead_source', 'channel'],
  city:            ['city', 'location', 'town', 'region'],
  notes:           ['notes', 'note', 'comment', 'remarks', 'additional'],
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const cols = []
    let cur = '', inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
      else cur += ch
    }
    cols.push(cur.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] || '']))
  })
  return { headers, rows }
}

function autoDetect(headers) {
  const mapping = {}
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    const match = headers.find(h => aliases.includes(h.toLowerCase().trim()))
    if (match) mapping[field] = match
  }
  return mapping
}

export default function LeadImport({ sb, leads: existingLeads, onDone, user }) {
  const [step, setStep]       = useState('upload')
  const [rawRows, setRawRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [result, setResult]   = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  const existingPhones = new Set(existingLeads.map(l => l.phone?.replace(/\s/g, '')).filter(Boolean))

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const { headers: h, rows } = parseCSV(e.target.result)
      if (!h.length) return alert('Could not read CSV headers. Ensure first row has column names.')
      setHeaders(h)
      setRawRows(rows)
      setMapping(autoDetect(h))
      setStep('map')
    }
    reader.readAsText(file)
  }

  const mappedRows = rawRows.map(row => {
    const lead = {}
    for (const [field, col] of Object.entries(mapping)) {
      if (col) lead[field] = row[col] || ''
    }
    return lead
  }).filter(r => r.name?.trim())

  const validRows   = mappedRows.filter(r => r.name?.trim())
  const duplicates  = validRows.filter(r => r.phone && existingPhones.has(r.phone.replace(/\s/g, '')))
  const newRows     = validRows.filter(r => !r.phone || !existingPhones.has(r.phone.replace(/\s/g, '')))

  const doImport = async () => {
    if (!newRows.length) return
    setImporting(true)
    let inserted = 0, failed = 0

    const BATCH = 20
    for (let i = 0; i < newRows.length; i += BATCH) {
      const batch = newRows.slice(i, i + BATCH).map(r => ({
        name: r.name?.trim() || '',
        phone: r.phone?.trim() || null,
        email: r.email?.trim() || null,
        course_interest: r.course_interest?.trim() || null,
        source: SOURCES.includes(r.source?.toLowerCase()) ? r.source.toLowerCase() : 'manual',
        city: r.city?.trim() || null,
        notes: r.notes?.trim() || null,
        status: 'new',
      })).filter(r => r.name)

      const { error } = await sb.from('leads').insert(batch)
      if (error) { failed += batch.length }
      else { inserted += batch.length }
    }

    setResult({ inserted, failed, duplicates: duplicates.length })
    setStep('done')
    setImporting(false)
  }

  if (step === 'upload') return (
    <div className="fade-up max-w-lg">
      <div className="mb-6">
        <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Import Leads from CSV</h1>
        <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:4 }}>Upload a CSV file to bulk-import leads. Duplicates (by phone) are skipped automatically.</p>
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
        style={{
          borderRadius: 12,
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: dragOver ? 'var(--accent-wash)' : 'var(--panel)',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Click to upload or drag & drop</div>
        <div style={{ fontSize:12, color:'var(--ink-3)', marginTop:4 }}>CSV files only · Any column order</div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => handleFile(e.target.files[0])}/>
      </div>
      <div style={{ marginTop:16 }} className="card p-4">
        <div style={{ fontSize:11, fontWeight:700, color:'var(--ink-2)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }}>Expected columns (any order)</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {['name', 'phone', 'email', 'course', 'source', 'city', 'notes'].map(c => (
            <span key={c} className="tag">{c}</span>
          ))}
        </div>
        <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:8 }}>Only "name" is required. Headers are matched automatically.</div>
      </div>
    </div>
  )

  if (step === 'map') return (
    <div className="fade-up max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Column Mapping</h1>
          <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>{rawRows.length} rows found · Map your columns below</p>
        </div>
        <button onClick={() => setStep('upload')} className="btn btn-ghost btn-sm">← Back</button>
      </div>

      <div className="card p-4 space-y-3">
        {Object.keys(COLUMN_MAP).map(field => (
          <div key={field} className="flex items-center gap-3">
            <div style={{ width:128, fontSize:12, fontWeight:600, color:'var(--ink-2)', textTransform:'capitalize' }}>{field.replace(/_/g, ' ')}</div>
            <select
              value={mapping[field] || ''}
              onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
              className="inp h-8 text-xs flex-1"
            >
              <option value="">— skip —</option>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            {mapping[field] && <span style={{ fontSize:10, color:'var(--ok)', fontWeight:600, flexShrink:0 }}>✓ mapped</span>}
          </div>
        ))}
      </div>

      {!mapping.name && (
        <div style={{ borderRadius:'var(--r)', border:'1px solid var(--border)', background:'#fdf2f2', padding:'10px 16px', fontSize:12, color:'var(--bad)', fontWeight:600 }}>
          You must map the "Name" column to continue.
        </div>
      )}

      <button
        onClick={() => setStep('preview')}
        disabled={!mapping.name}
        className="btn btn-primary w-full"
      >
        Preview {rawRows.length} Rows →
      </button>
    </div>
  )

  if (step === 'preview') return (
    <div className="fade-up space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Preview & Confirm</h1>
          <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>Review before importing</p>
        </div>
        <button onClick={() => setStep('map')} className="btn btn-ghost btn-sm">← Back</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <div className="stat-value" style={{ color:'var(--info)' }}>{validRows.length}</div>
          <div className="stat-label">Total valid rows</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color:'var(--ok)' }}>{newRows.length}</div>
          <div className="stat-label">Will be imported</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color:'var(--warn)' }}>{duplicates.length}</div>
          <div className="stat-label">Duplicates (skipped)</div>
        </div>
      </div>

      {duplicates.length > 0 && (
        <div style={{ borderRadius:'var(--r)', border:'1px solid var(--border)', background:'#fffbeb', padding:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--warn)', marginBottom:8 }}>Duplicate phones — will be skipped</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {duplicates.slice(0, 8).map((r, i) => (
              <span key={i} style={{ fontSize:10, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, padding:'2px 8px', color:'var(--ink-2)' }}>
                {r.name} ({r.phone})
              </span>
            ))}
            {duplicates.length > 8 && <span style={{ fontSize:10, color:'var(--warn)' }}>+{duplicates.length - 8} more</span>}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--ink-2)', textTransform:'uppercase', letterSpacing:'.04em' }}>First 15 rows preview</div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th className="hidden sm:table-cell">Email</th>
                <th className="hidden md:table-cell">Course</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {validRows.slice(0, 15).map((r, i) => {
                const isDupe = r.phone && existingPhones.has(r.phone.replace(/\s/g, ''))
                return (
                  <tr key={i} style={{ opacity: isDupe ? 0.4 : 1 }}>
                    <td style={{ fontWeight:500, color:'var(--ink)' }}>
                      {r.name}
                      {isDupe && <span style={{ marginLeft:4, fontSize:9, color:'var(--warn)', fontWeight:700 }}>DUP</span>}
                    </td>
                    <td style={{ fontSize:12, color:'var(--ink-2)' }}>{r.phone || '—'}</td>
                    <td className="hidden sm:table-cell" style={{ fontSize:12, color:'var(--ink-2)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.email || '—'}</td>
                    <td className="hidden md:table-cell" style={{ fontSize:12, color:'var(--ink-2)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.course_interest || '—'}</td>
                    <td><span className="tag">{r.source || 'manual'}</span></td>
                    <td><Badge status="new"/></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {newRows.length === 0 ? (
        <div style={{ borderRadius:'var(--r)', background:'var(--bg)', border:'1px solid var(--border)', padding:'24px 16px', textAlign:'center', fontSize:13, color:'var(--ink-3)' }}>
          All rows are duplicates — nothing to import.
        </div>
      ) : (
        <button onClick={doImport} disabled={importing} className="btn btn-primary w-full press">
          {importing ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block mr-2"/>Importing…</> : `Import ${newRows.length} Lead${newRows.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )

  if (step === 'done') return (
    <div className="fade-up max-w-md mx-auto text-center py-12">
      <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
      <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)', marginBottom:8 }}>Import Complete!</h1>
      <div className="grid grid-cols-3 gap-3 mt-6 mb-8">
        <div className="stat-card">
          <div className="stat-value" style={{ color:'var(--ok)' }}>{result.inserted}</div>
          <div className="stat-label">Imported</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color:'var(--warn)' }}>{result.duplicates}</div>
          <div className="stat-label">Skipped</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color:'var(--bad)' }}>{result.failed}</div>
          <div className="stat-label">Failed</div>
        </div>
      </div>
      <div className="flex gap-3 justify-center">
        <button onClick={onDone} className="btn btn-primary">View Leads →</button>
        <button onClick={() => { setStep('upload'); setRawRows([]); setHeaders([]); setMapping({}) }} className="btn btn-ghost">Import More</button>
      </div>
    </div>
  )
}
