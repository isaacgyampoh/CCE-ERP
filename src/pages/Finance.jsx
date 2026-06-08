import { useState, useEffect } from 'react'
import { Avatar, Badge, EmptyState, Spinner, Label, Modal } from '@/components/ui'
import { Icon } from '@/components/ui'
import { fmtCurrency, fmtDateTime, fmtDate, timeAgo } from '@/lib/helpers'

const METHODS = ['cash', 'momo', 'card', 'bank']

const Dot = ({ color }) => (
  <span style={{ width:6, height:6, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }}/>
)

export default function Finance({ sb, staff, leads, user }) {
  const [tab, setTab] = useState('payments')

  const [payments, setPayments]     = useState([])
  const [loadingPay, setLoadingPay] = useState(true)
  const [filter, setFilter]         = useState('all')
  const [range, setRange]           = useState('all')

  const [cohorts, setCohorts]               = useState([])
  const [selectedCohort, setSelectedCohort] = useState('')
  const [feeRows, setFeeRows]               = useState([])
  const [loadingFees, setLoadingFees]       = useState(false)
  const [editingFee, setEditingFee]         = useState(null)
  const [savingFee, setSavingFee]           = useState(false)

  const [pendingCash, setPendingCash]     = useState([])
  const [loadingCash, setLoadingCash]     = useState(false)
  const [recordingTxn, setRecordingTxn]   = useState(null)
  const [recordForm, setRecordForm]       = useState({ amount: '', method: 'cash', reference: '' })
  const [recording, setRecording]         = useState(false)
  const [receiptData, setReceiptData]     = useState(null)

  const now = new Date()
  const marketers = staff.filter(s => s.role === 'marketer')

  useEffect(() => { loadPayments() }, [])
  useEffect(() => { if (tab === 'fees' && !cohorts.length) loadCohorts() }, [tab])
  useEffect(() => { if (tab === 'pending_cash') loadPendingCash() }, [tab])
  useEffect(() => { if (selectedCohort) loadCohortFees(selectedCohort) }, [selectedCohort])

  const loadPayments = async () => {
    setLoadingPay(true)
    const { data } = await sb.from('payments')
      .select('*, lead:lead_id(id,name,phone,email,course_interest,assigned_to, assignee:assigned_to(id,name))')
      .order('paid_at', { ascending: false })
    setPayments(data || [])
    setLoadingPay(false)
  }

  const loadCohorts = async () => {
    const { data } = await sb.from('cohorts').select('id, course_name').order('created_at', { ascending: false })
    setCohorts(data || [])
  }

  const loadCohortFees = async (cohortId) => {
    setLoadingFees(true)
    const [{ data: enrData }, { data: invoiceData }] = await Promise.all([
      sb.from('enrolments').select('*, lead:lead_id(id,name,phone)').eq('cohort_id', cohortId).eq('rsvp_status', 'confirmed'),
      sb.from('school_fee_invoices').select('*').eq('cohort_id', cohortId),
    ])
    const leadIds = (enrData || []).map(e => e.lead_id).filter(Boolean)
    let allInvoices = invoiceData || []
    if (leadIds.length && !allInvoices.length) {
      const { data: byLead } = await sb.from('school_fee_invoices')
        .select('*').in('lead_id', leadIds).neq('status', 'paid')
      allInvoices = byLead || []
    }
    const merged = (enrData || []).map(e => ({
      ...e, invoice: allInvoices.find(i => i.lead_id === e.lead_id) || null,
    }))
    setFeeRows(merged)
    setLoadingFees(false)
  }

  const loadPendingCash = async () => {
    setLoadingCash(true)
    const { data } = await sb.from('course_fee_payments')
      .select('*, invoice:invoice_id(total_fee, amount_paid, balance, scholarship_amount, discount_amount, course, lead_id), lead:lead_id(name, phone)')
      .eq('status', 'pending_cash')
      .order('created_at', { ascending: false })
    setPendingCash(data || [])
    setLoadingCash(false)
  }

  const openFeeEdit = (row) => {
    const inv = row.invoice
    setEditingFee({
      lead_id: row.lead_id,
      cohort_id: selectedCohort,
      invoice_id: inv?.id || null,
      student_name: row.lead?.name || row.student_name || '—',
      student_phone: row.lead?.phone || row.student_phone || '',
      course: cohorts.find(c => c.id === selectedCohort)?.course_name || '',
      total_fee: inv?.total_fee ?? '',
      scholarship_amount: inv?.scholarship_amount ?? 0,
      discount_amount: inv?.discount_amount ?? 0,
      notes: inv?.notes ?? '',
    })
  }

  const saveFee = async () => {
    if (!editingFee.total_fee) return
    setSavingFee(true)
    const grossFee   = Number(editingFee.total_fee)
    const scholarship = Number(editingFee.scholarship_amount || 0)
    const discount   = Number(editingFee.discount_amount || 0)
    const netFee     = grossFee - scholarship - discount
    const prevPaid   = editingFee.invoice_id
      ? Number((await sb.from('school_fee_invoices').select('amount_paid').eq('id', editingFee.invoice_id).single()).data?.amount_paid || 0)
      : 0
    const balance = Math.max(0, netFee - prevPaid)
    const payload = {
      lead_id: editingFee.lead_id, cohort_id: editingFee.cohort_id,
      student_name: editingFee.student_name, phone: editingFee.student_phone,
      course: editingFee.course, total_fee: grossFee, scholarship_amount: scholarship,
      discount_amount: discount, net_fee: netFee, balance, amount_paid: prevPaid,
      status: prevPaid >= netFee ? 'paid' : prevPaid > 0 ? 'partial' : 'pending',
      notes: editingFee.notes, updated_at: new Date().toISOString(),
    }
    if (editingFee.invoice_id) {
      await sb.from('school_fee_invoices').update(payload).eq('id', editingFee.invoice_id)
    } else {
      await sb.from('school_fee_invoices').insert(payload)
    }
    setSavingFee(false)
    setEditingFee(null)
    loadCohortFees(selectedCohort)
  }

  const recordPayment = async () => {
    if (!recordForm.amount) return
    setRecording(true)
    try {
      const res = await fetch('/api/fees/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: recordingTxn.id, invoice_id: recordingTxn.invoice_id,
          lead_id: recordingTxn.lead_id, amount: Number(recordForm.amount),
          method: recordForm.method, reference: recordForm.reference,
          recorded_by_id: user?.id,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setReceiptData(data)
        setRecordingTxn(null)
        loadPendingCash()
      } else {
        alert('Failed to record payment. Please try again.')
      }
    } catch (e) {
      alert('Network error. Please try again.')
    }
    setRecording(false)
  }

  const sendWAReceipt = (d) => {
    const clean = (d.student_phone || '').replace(/\s/g,'').replace(/^0/,'233').replace(/^\+/,'')
    if (clean) {
      window.open(`https://wa.me/${clean}?text=${encodeURIComponent(d.wa_receipt_msg || '')}`, '_blank')
    } else {
      navigator.clipboard.writeText(d.wa_receipt_msg || '')
        .then(() => alert('Receipt message copied to clipboard!'))
    }
  }

  const printReceipt = (d) => {
    const w = window.open('', '_blank', 'width=520,height=720')
    const fmtGHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
    const fmtD = (s) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt ${d.receipt_no}</title><meta charset="UTF-8">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#fff;padding:28px;color:#1e293b;max-width:420px;margin:auto}.hdr{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:16px;margin-bottom:20px}.logo{font-size:26px;font-weight:900;color:#1d4ed8}.sub{font-size:12px;color:#64748b}.ref-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center;margin-bottom:20px}.ref-no{font-size:22px;font-weight:900;color:#1d4ed8;letter-spacing:2px}table{width:100%;border-collapse:collapse}tr{border-bottom:1px solid #f1f5f9}td{padding:10px 4px;font-size:13px}td:first-child{color:#64748b;width:42%}td:last-child{font-weight:600;text-align:right}.ftr{text-align:center;margin-top:22px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:14px}@media print{body{padding:0}}</style></head>
<body>
<div class="hdr"><div class="logo">CCE</div><div class="sub">Cambridge Center of Excellence</div><div style="font-size:10px;color:#94a3b8;margin-top:2px">Official Payment Receipt</div></div>
<div class="ref-box"><div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px">Receipt Number</div><div class="ref-no">${d.receipt_no}</div></div>
<table>
  <tr><td>Student</td><td>${d.student_name}</td></tr>
  <tr><td>Course</td><td>${d.course}</td></tr>
  <tr><td>Method</td><td>${d.method}</td></tr>
  <tr><td>Date</td><td>${fmtD(d.paid_at)}</td></tr>
  <tr><td>Amount Paid</td><td style="color:#1d4ed8;font-size:15px;font-weight:900">${fmtGHS(d.amount_paid)}</td></tr>
  <tr><td>Total Paid</td><td style="font-weight:700">${fmtGHS(d.total_paid)}</td></tr>
  <tr><td>Balance</td><td style="font-weight:700;color:${d.new_balance <= 0 ? '#166534' : '#92400e'}">${fmtGHS(d.new_balance)}</td></tr>
  <tr><td>Status</td><td><span style="background:${d.new_balance <= 0 ? '#dcfce7' : '#fef3c7'};color:${d.new_balance <= 0 ? '#166534' : '#92400e'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${d.new_balance <= 0 ? 'FULLY PAID ✓' : 'PARTIAL'}</span></td></tr>
</table>
<div class="ftr">Cambridge Center of Excellence · Accra, Ghana<br>This is an official payment receipt.</div>
<script>window.onload=()=>setTimeout(()=>window.print(),350)</script></body></html>`)
    w.document.close()
  }

  const feeStatusBadge = (inv) => {
    if (!inv) return null
    const map = { paid: { c:'var(--ok)', l:'Paid' }, partial: { c:'var(--warn)', l:'Part-paid' }, pending: { c:'var(--ink-3)', l:'Pending' } }
    const s = map[inv.status] || { c:'var(--ink-3)', l: inv.status }
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink)' }}>
        <Dot color={s.c}/>{s.l}
      </span>
    )
  }

  const filtered = payments.filter(p => {
    if (filter !== 'all' && p.lead?.assigned_to !== filter) return false
    if (range === 'month') {
      const d = new Date(p.paid_at)
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false
    }
    return true
  })
  const totalRevenue = filtered.reduce((s, p) => s + Number(p.amount || 0), 0)
  const byMarketer = marketers.map(m => {
    const mp = filtered.filter(p => p.lead?.assigned_to === m.id)
    return { ...m, count: mp.length, revenue: mp.reduce((s, p) => s + Number(p.amount || 0), 0) }
  }).filter(m => m.count > 0).sort((a, b) => b.revenue - a.revenue)

  const exportCSV = () => {
    const rows = [['Date','Lead Name','Phone','Course','Marketer','Amount (GHS)','Reference','Status'],
      ...filtered.map(p => [fmtDate(p.paid_at),p.lead?.name||'',p.lead?.phone||'',p.lead?.course_interest||'',p.lead?.assignee?.name||'',p.amount,p.reference,p.status])]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `cce-payments-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const TABS = [
    { id: 'payments', label: 'Payments' },
    { id: 'fees', label: 'Student Fees' },
    { id: 'pending_cash', label: `Pending Cash${pendingCash.length ? ` (${pendingCash.length})` : ''}` },
  ]

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Finance</h1>
          <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>Payments, student fees & commission tracking</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', gap:0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding:'10px 16px', fontSize:12, fontWeight:600, border:'none', borderBottom:`2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              background: tab === t.id ? 'var(--accent-wash)' : 'transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--ink-2)', cursor:'pointer', transition:'all .12s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Payments Tab ── */}
      {tab === 'payments' && (
        <>
          {loadingPay ? <Spinner size={24}/> : (
            <>
              <div className="flex justify-end">
                <button onClick={exportCSV} className="btn btn-ghost btn-sm">{Icon.download} Export CSV</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="stat-card"><div className="stat-value" style={{ color:'var(--ok)' }}>{fmtCurrency(totalRevenue)}</div><div className="stat-label">Total Revenue</div></div>
                <div className="stat-card"><div className="stat-value">{filtered.length}</div><div className="stat-label">Payments</div></div>
                <div className="stat-card"><div className="stat-value">{byMarketer.length}</div><div className="stat-label">Active Marketers</div></div>
                <div className="stat-card"><div className="stat-value">{byMarketer.length > 0 ? fmtCurrency(totalRevenue / byMarketer.length) : fmtCurrency(0)}</div><div className="stat-label">Avg / Marketer</div></div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select value={filter} onChange={e => setFilter(e.target.value)} className="inp h-9 text-xs w-auto">
                  <option value="all">All Marketers</option>
                  {marketers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <div style={{ display:'flex', borderRadius:'var(--r)', border:'1px solid var(--border)', overflow:'hidden' }}>
                  {[['all','All Time'],['month','This Month']].map(([v,l]) => (
                    <button key={v} onClick={() => setRange(v)}
                      style={{ padding:'6px 12px', fontSize:12, fontWeight:500, border:'none', cursor:'pointer', transition:'background .1s',
                        background: range === v ? 'var(--ink)' : 'var(--panel)', color: range === v ? '#fff' : 'var(--ink-2)' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {byMarketer.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {byMarketer.map((m, i) => (
                    <div key={m.id} className="card p-4">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div style={{ fontSize:10, color:'var(--ink-3)', fontWeight:700, width:16 }}>#{i+1}</div>
                        <Avatar name={m.name} size={32}/>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{m.name}</div>
                          <div style={{ fontSize:10, color:'var(--ink-3)' }}>Marketer</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div style={{ borderRadius:4, padding:8, background:'var(--accent-wash)', border:'1px solid var(--border)' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--ok)' }}>{fmtCurrency(m.revenue)}</div>
                          <div style={{ fontSize:10, color:'var(--ink-3)' }}>Revenue</div>
                        </div>
                        <div style={{ borderRadius:4, padding:8, background:'var(--bg)', border:'1px solid var(--border)' }}>
                          <div style={{ fontSize:17, fontWeight:700, color:'var(--info)' }}>{m.count}</div>
                          <div style={{ fontSize:10, color:'var(--ink-3)' }}>Registrations</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="card overflow-hidden">
                <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Payment Ledger</h2>
                  <span style={{ fontSize:12, color:'var(--ink-3)' }}>{filtered.length} records</span>
                </div>
                {filtered.length === 0 ? <EmptyState title="No payments yet"/> : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Date</th><th>Student</th><th>Course</th><th>Marketer</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead>
                      <tbody>
                        {filtered.map(p => (
                          <tr key={p.id}>
                            <td style={{ fontSize:12, color:'var(--ink-2)' }}>{fmtDateTime(p.paid_at)}</td>
                            <td>
                              <div style={{ fontWeight:500, color:'var(--ink)', fontSize:13 }}>{p.lead?.name}</div>
                              <div style={{ fontSize:10, color:'var(--ink-3)' }}>{p.lead?.phone}</div>
                            </td>
                            <td style={{ fontSize:12, color:'var(--ink-2)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.lead?.course_interest || '—'}</td>
                            <td>
                              {p.lead?.assignee
                                ? <div className="flex items-center gap-1.5"><Avatar name={p.lead.assignee.name} size={22}/><span style={{ fontSize:12, color:'var(--ink-2)' }}>{p.lead.assignee.name}</span></div>
                                : <span style={{ fontSize:12, color:'var(--ink-3)' }}>—</span>}
                            </td>
                            <td style={{ fontWeight:700, color:'var(--ok)' }}>{fmtCurrency(p.amount)}</td>
                            <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--ink-3)' }}>{p.reference}</td>
                            <td>
                              <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink)' }}>
                                <Dot color={p.status === 'success' ? 'var(--ok)' : 'var(--ink-3)'}/>
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Fees Tab ── */}
      {tab === 'fees' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Student Fee Management</h2>
              <p style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>Set and manage individual course fees per cohort</p>
            </div>
            <select value={selectedCohort} onChange={e => setSelectedCohort(e.target.value)} className="inp h-9 text-xs w-auto">
              <option value="">Select a cohort…</option>
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
          </div>

          {!selectedCohort ? (
            <EmptyState title="Select a cohort above" sub="Then set fees for each enrolled student"/>
          ) : loadingFees ? <Spinner size={24}/> : feeRows.length === 0 ? (
            <EmptyState title="No confirmed enrolments" sub="Students must be enrolled and RSVP confirmed first"/>
          ) : (
            <div className="card overflow-hidden">
              <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <h3 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>
                  {cohorts.find(c => c.id === selectedCohort)?.course_name} — {feeRows.length} students
                </h3>
                <div style={{ fontSize:12, color:'var(--ink-3)' }}>{feeRows.filter(r => r.invoice).length} fees set</div>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr><th>Student</th><th>Total Fee</th><th className="hidden sm:table-cell">Scholarship</th><th className="hidden sm:table-cell">Discount</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {feeRows.map(row => {
                      const inv = row.invoice
                      return (
                        <tr key={row.id || row.lead_id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <Avatar name={row.lead?.name || row.student_name} size={28}/>
                              <div>
                                <div style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>{row.lead?.name || row.student_name}</div>
                                <div style={{ fontSize:10, color:'var(--ink-3)' }}>{row.lead?.phone || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontWeight:600, color:'var(--ink)' }}>{inv ? fmtCurrency(inv.total_fee) : <span style={{ fontSize:12, color:'var(--ink-3)' }}>—</span>}</td>
                          <td className="hidden sm:table-cell" style={{ color:'var(--accent)', fontSize:12 }}>{inv && Number(inv.scholarship_amount) > 0 ? fmtCurrency(inv.scholarship_amount) : '—'}</td>
                          <td className="hidden sm:table-cell" style={{ color:'var(--ok)', fontSize:12 }}>{inv && Number(inv.discount_amount) > 0 ? fmtCurrency(inv.discount_amount) : '—'}</td>
                          <td style={{ fontWeight:600, color:'var(--ok)' }}>{inv ? fmtCurrency(inv.amount_paid || 0) : '—'}</td>
                          <td style={{ fontWeight:700, color:'var(--info)' }}>{inv ? fmtCurrency(inv.balance || 0) : '—'}</td>
                          <td>{inv ? feeStatusBadge(inv) : <span style={{ fontSize:10, color:'var(--ink-3)' }}>No fee</span>}</td>
                          <td><button onClick={() => openFeeEdit(row)} className="btn btn-ghost btn-sm">{inv ? 'Edit' : '+ Set'}</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {editingFee && (
            <Modal title={`${editingFee.invoice_id ? 'Edit' : 'Set'} Fee — ${editingFee.student_name}`} onClose={() => setEditingFee(null)}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Total Course Fee (GH₵) *</Label>
                    <input type="number" min="0" step="10" value={editingFee.total_fee}
                      onChange={e => setEditingFee(x => ({ ...x, total_fee: e.target.value }))} className="inp"/>
                  </div>
                  <div>
                    <Label>Scholarship Reduction (GH₵)</Label>
                    <input type="number" min="0" step="10" value={editingFee.scholarship_amount}
                      onChange={e => setEditingFee(x => ({ ...x, scholarship_amount: e.target.value }))} className="inp"/>
                  </div>
                  <div>
                    <Label>Discount Amount (GH₵)</Label>
                    <input type="number" min="0" step="10" value={editingFee.discount_amount}
                      onChange={e => setEditingFee(x => ({ ...x, discount_amount: e.target.value }))} className="inp"/>
                  </div>
                  <div>
                    <Label>Net Fee (computed)</Label>
                    <div className="inp flex items-center" style={{ background:'var(--bg)', fontWeight:700, color:'var(--info)' }}>
                      {fmtCurrency(Math.max(0, Number(editingFee.total_fee || 0) - Number(editingFee.scholarship_amount || 0) - Number(editingFee.discount_amount || 0)))}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <textarea value={editingFee.notes} onChange={e => setEditingFee(x => ({ ...x, notes: e.target.value }))} className="inp" rows="2"/>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={saveFee} disabled={!editingFee.total_fee || savingFee} className="btn btn-primary flex-1">{savingFee ? 'Saving…' : 'Save Fee'}</button>
                <button onClick={() => setEditingFee(null)} className="btn btn-ghost flex-1">Cancel</button>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── Pending Cash Tab ── */}
      {tab === 'pending_cash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Pending Cash Payments</h2>
              <p style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>Students who selected "Pay Cash" at class. Record their payment here.</p>
            </div>
            <button onClick={loadPendingCash} className="btn btn-ghost btn-sm">↺ Refresh</button>
          </div>

          {loadingCash ? <Spinner size={24}/> : pendingCash.length === 0 ? (
            <EmptyState title="No pending cash payments" sub="Students who click 'Pay Cash' at class sign-in will appear here"/>
          ) : (
            <div className="card overflow-hidden">
              <div>
                {pendingCash.map(txn => {
                  const inv       = txn.invoice
                  const grossFee  = Number(inv?.total_fee || 0)
                  const scholarship = Number(inv?.scholarship_amount || 0)
                  const discount  = Number(inv?.discount_amount || 0)
                  const netFee    = grossFee - scholarship - discount
                  const prevPaid  = Number(inv?.amount_paid || 0)
                  const balance   = Math.max(0, netFee - prevPaid)

                  return (
                    <div key={txn.id} style={{ padding:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', borderBottom:'1px solid var(--border)' }}>
                      <Avatar name={txn.lead?.name || '?'} size={38}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>{txn.lead?.name}</div>
                        <div style={{ fontSize:11, color:'var(--ink-3)', marginTop:2 }}>{txn.lead?.phone || '—'} · {txn.invoice?.course || '—'}</div>
                        <div style={{ fontSize:10, color:'var(--warn)', marginTop:2 }}>{timeAgo(txn.created_at)} · Balance: {fmtCurrency(balance)}</div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:17, fontWeight:700, color:'var(--ink)' }}>{fmtCurrency(txn.amount || balance)}</div>
                        <button
                          onClick={() => {
                            setRecordingTxn(txn)
                            setRecordForm({ amount: String(txn.amount || balance), method: 'cash', reference: '' })
                          }}
                          className="btn btn-primary btn-sm mt-1"
                        >
                          Record Payment
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {recordingTxn && (
            <Modal title={`Record Payment — ${recordingTxn.lead?.name}`} onClose={() => setRecordingTxn(null)}>
              <div className="space-y-4">
                <div>
                  <Label>Amount Received (GH₵) *</Label>
                  <input type="number" min="0" step="10" value={recordForm.amount}
                    onChange={e => setRecordForm(f => ({ ...f, amount: e.target.value }))}
                    className="inp text-lg font-bold"/>
                  <p style={{ fontSize:10, color:'var(--ink-3)', marginTop:4 }}>Can be partial — student will be prompted to pay remaining balance next class.</p>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <select value={recordForm.method} onChange={e => setRecordForm(f => ({ ...f, method: e.target.value }))} className="inp">
                    {METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Reference / Receipt Book No. (optional)</Label>
                  <input value={recordForm.reference} onChange={e => setRecordForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. R-2024-001" className="inp"/>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={recordPayment} disabled={!recordForm.amount || recording} className="btn btn-primary flex-1">
                  {recording ? 'Recording…' : `Record GH₵${recordForm.amount || '—'}`}
                </button>
                <button onClick={() => setRecordingTxn(null)} className="btn btn-ghost flex-1">Cancel</button>
              </div>
            </Modal>
          )}

          {receiptData && (
            <Modal title="Payment Recorded" onClose={() => setReceiptData(null)}>
              <div className="text-center py-2 space-y-4">
                <div style={{ borderRadius:'var(--r)', border:'1px solid var(--border)', background:'var(--accent-wash)', padding:16 }}>
                  <div style={{ fontSize:11, color:'var(--accent)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>Receipt</div>
                  <div style={{ fontSize:20, fontWeight:900, color:'var(--ink)', fontFamily:'monospace' }}>{receiptData.receipt_no}</div>
                  <div style={{ fontSize:13, color:'var(--ok)', marginTop:4 }}>{receiptData.student_name} · {fmtCurrency(receiptData.amount_paid)}</div>
                  <div style={{ fontSize:12, color:'var(--ink-2)', marginTop:2 }}>Balance: {fmtCurrency(receiptData.new_balance)}</div>
                </div>
                <p style={{ fontSize:12, color:'var(--ink-3)' }}>An SMS has been sent to the student automatically.</p>
                <div className="space-y-2">
                  <button onClick={() => sendWAReceipt(receiptData)}
                    style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:12, borderRadius:'var(--r)', background:'var(--ok)', color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor:'pointer', transition:'opacity .1s' }}
                    className="press">
                    Send Receipt via WhatsApp
                  </button>
                  <button onClick={() => printReceipt(receiptData)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-[var(--border)] text-[var(--ink)] text-sm font-bold press transition">
                    Print / Save PDF
                  </button>
                </div>
              </div>
              <button onClick={() => setReceiptData(null)} className="btn btn-ghost w-full mt-3">Close</button>
            </Modal>
          )}
        </div>
      )}
    </div>
  )
}
