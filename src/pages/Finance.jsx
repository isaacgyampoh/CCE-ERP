import { useState, useEffect } from 'react'
import { Avatar, Badge, EmptyState, Spinner, Label, Modal } from '@/components/ui'
import { Icon } from '@/components/ui'
import { fmtCurrency, fmtDateTime, fmtDate, timeAgo } from '@/lib/helpers'

const METHODS = ['cash', 'momo', 'card', 'bank']

export default function Finance({ sb, staff, leads, user }) {
  const [tab, setTab] = useState('payments')

  // ── Payments tab state ─────────────────────────────────────────────────────
  const [payments, setPayments] = useState([])
  const [loadingPay, setLoadingPay] = useState(true)
  const [filter, setFilter] = useState('all')
  const [range, setRange] = useState('all')

  // ── Fees tab state ─────────────────────────────────────────────────────────
  const [cohorts, setCohorts] = useState([])
  const [selectedCohort, setSelectedCohort] = useState('')
  const [feeRows, setFeeRows] = useState([]) // merged enrolments + invoices
  const [loadingFees, setLoadingFees] = useState(false)
  const [editingFee, setEditingFee] = useState(null)
  const [savingFee, setSavingFee] = useState(false)

  // ── Pending Cash tab state ─────────────────────────────────────────────────
  const [pendingCash, setPendingCash] = useState([])
  const [loadingCash, setLoadingCash] = useState(false)
  const [recordingTxn, setRecordingTxn] = useState(null)
  const [recordForm, setRecordForm] = useState({ amount: '', method: 'cash', reference: '' })
  const [recording, setRecording] = useState(false)
  const [receiptData, setReceiptData] = useState(null)

  const now = new Date()
  const marketers = staff.filter(s => s.role === 'marketer')

  useEffect(() => { loadPayments() }, [])
  useEffect(() => { if (tab === 'fees' && !cohorts.length) loadCohorts() }, [tab])
  useEffect(() => { if (tab === 'pending_cash') loadPendingCash() }, [tab])
  useEffect(() => { if (selectedCohort) loadCohortFees(selectedCohort) }, [selectedCohort])

  // ── Data loaders ───────────────────────────────────────────────────────────
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

    // Also get invoices by lead_id as fallback
    const leadIds = (enrData || []).map(e => e.lead_id).filter(Boolean)
    let allInvoices = invoiceData || []
    if (leadIds.length && !allInvoices.length) {
      const { data: byLead } = await sb.from('school_fee_invoices')
        .select('*').in('lead_id', leadIds).neq('status', 'paid')
      allInvoices = byLead || []
    }

    const merged = (enrData || []).map(e => ({
      ...e,
      invoice: allInvoices.find(i => i.lead_id === e.lead_id) || null,
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

  // ── Fee management helpers ─────────────────────────────────────────────────
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

    const grossFee = Number(editingFee.total_fee)
    const scholarship = Number(editingFee.scholarship_amount || 0)
    const discount = Number(editingFee.discount_amount || 0)
    const netFee = grossFee - scholarship - discount
    const prevPaid = editingFee.invoice_id
      ? Number((await sb.from('school_fee_invoices').select('amount_paid').eq('id', editingFee.invoice_id).single()).data?.amount_paid || 0)
      : 0
    const balance = Math.max(0, netFee - prevPaid)

    const payload = {
      lead_id: editingFee.lead_id,
      cohort_id: editingFee.cohort_id,
      student_name: editingFee.student_name,
      phone: editingFee.student_phone,
      course: editingFee.course,
      total_fee: grossFee,
      scholarship_amount: scholarship,
      discount_amount: discount,
      net_fee: netFee,
      balance,
      amount_paid: prevPaid,
      status: prevPaid >= netFee ? 'paid' : prevPaid > 0 ? 'partial' : 'pending',
      notes: editingFee.notes,
      updated_at: new Date().toISOString(),
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

  // ── Record cash payment ────────────────────────────────────────────────────
  const recordPayment = async () => {
    if (!recordForm.amount) return
    setRecording(true)
    try {
      const res = await fetch('/api/fees/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: recordingTxn.id,
          invoice_id: recordingTxn.invoice_id,
          lead_id: recordingTxn.lead_id,
          amount: Number(recordForm.amount),
          method: recordForm.method,
          reference: recordForm.reference,
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

  // ── Render helpers ─────────────────────────────────────────────────────────
  const feeStatus = (inv) => {
    if (!inv) return null
    const colors = { paid: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700', pending: 'bg-slate-100 text-slate-500' }
    return <span className={`badge ${colors[inv.status] || 'bg-slate-100 text-slate-400'}`}>{inv.status}</span>
  }

  // ── Payments tab ──────────────────────────────────────────────────────────
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

  return (
    <div className="fade-up space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Finance</h1>
          <p className="text-sm text-slate-400 mt-0.5">Payments, student fees & commission tracking</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-0">
        {[
          { id: 'payments', label: 'Payments', icon: '💳' },
          { id: 'fees', label: 'Student Fees', icon: '🧾' },
          { id: 'pending_cash', label: `Pending Cash${pendingCash.length ? ` (${pendingCash.length})` : ''}`, icon: '💵' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${tab === t.id ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Payments Tab ──────────────────────────────────────────────────── */}
      {tab === 'payments' && (
        <>
          {loadingPay ? <Spinner size={24}/> : (
            <>
              <div className="flex justify-end"><button onClick={exportCSV} className="btn btn-ghost btn-sm">{Icon.download} Export CSV</button></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="stat-card"><div className="text-2xl mb-1">💰</div><div className="stat-value text-emerald-600">{fmtCurrency(totalRevenue)}</div><div className="stat-label">Total Revenue</div></div>
                <div className="stat-card"><div className="text-2xl mb-1">🧾</div><div className="stat-value">{filtered.length}</div><div className="stat-label">Payments</div></div>
                <div className="stat-card"><div className="text-2xl mb-1">👤</div><div className="stat-value">{byMarketer.length}</div><div className="stat-label">Active Marketers</div></div>
                <div className="stat-card"><div className="text-2xl mb-1">📊</div><div className="stat-value">{byMarketer.length > 0 ? fmtCurrency(totalRevenue / byMarketer.length) : fmtCurrency(0)}</div><div className="stat-label">Avg / Marketer</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={filter} onChange={e => setFilter(e.target.value)} className="inp h-9 text-xs w-auto">
                  <option value="all">All Marketers</option>
                  {marketers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {[['all','All Time'],['month','This Month']].map(([v,l]) => (
                    <button key={v} onClick={() => setRange(v)} className={`px-3 py-1.5 text-xs font-medium transition ${range === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{l}</button>
                  ))}
                </div>
              </div>
              {byMarketer.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {byMarketer.map((m, i) => (
                    <div key={m.id} className="card p-4">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="text-[10px] text-slate-300 font-bold w-4">#{i+1}</div>
                        <Avatar name={m.name} size={32}/>
                        <div><div className="text-sm font-semibold text-slate-900">{m.name}</div><div className="text-[10px] text-slate-400">Marketer</div></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-emerald-50 rounded-lg p-2"><div className="text-sm font-bold text-emerald-700">{fmtCurrency(m.revenue)}</div><div className="text-[10px] text-emerald-600">Revenue</div></div>
                        <div className="bg-blue-50 rounded-lg p-2"><div className="text-lg font-bold text-blue-700">{m.count}</div><div className="text-[10px] text-blue-600">Registrations</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Payment Ledger</h2>
                  <span className="text-xs text-slate-400">{filtered.length} records</span>
                </div>
                {filtered.length === 0 ? <EmptyState icon="💳" title="No payments yet"/> : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Date</th><th>Student</th><th>Course</th><th>Marketer</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead>
                      <tbody>
                        {filtered.map(p => (
                          <tr key={p.id}>
                            <td className="text-xs text-slate-500">{fmtDateTime(p.paid_at)}</td>
                            <td><div className="font-medium text-slate-900 text-sm">{p.lead?.name}</div><div className="text-[10px] text-slate-400">{p.lead?.phone}</div></td>
                            <td className="text-xs text-slate-600 max-w-[140px] truncate">{p.lead?.course_interest || '—'}</td>
                            <td>{p.lead?.assignee ? <div className="flex items-center gap-1.5"><Avatar name={p.lead.assignee.name} size={22}/><span className="text-xs text-slate-600">{p.lead.assignee.name}</span></div> : <span className="text-slate-300 text-xs">—</span>}</td>
                            <td className="font-bold text-emerald-700">{fmtCurrency(p.amount)}</td>
                            <td className="font-mono text-[11px] text-slate-400">{p.reference}</td>
                            <td><span className={`badge ${p.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span></td>
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

      {/* ── Fees Tab ──────────────────────────────────────────────────────── */}
      {tab === 'fees' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Student Fee Management</h2>
              <p className="text-xs text-slate-400 mt-0.5">Set and manage individual course fees per cohort</p>
            </div>
            <select
              value={selectedCohort}
              onChange={e => setSelectedCohort(e.target.value)}
              className="inp h-9 text-xs w-auto"
            >
              <option value="">Select a cohort…</option>
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
          </div>

          {!selectedCohort ? (
            <EmptyState icon="🎓" title="Select a cohort above" sub="Then set fees for each enrolled student"/>
          ) : loadingFees ? <Spinner size={24}/> : feeRows.length === 0 ? (
            <EmptyState icon="👥" title="No confirmed enrolments" sub="Students must be enrolled and RSVP confirmed first"/>
          ) : (
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  {cohorts.find(c => c.id === selectedCohort)?.course_name} — {feeRows.length} students
                </h3>
                <div className="text-xs text-slate-400">
                  {feeRows.filter(r => r.invoice).length} fees set
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Total Fee</th>
                      <th className="hidden sm:table-cell">Scholarship</th>
                      <th className="hidden sm:table-cell">Discount</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeRows.map(row => {
                      const inv = row.invoice
                      const netFee = inv ? Number(inv.total_fee) - Number(inv.scholarship_amount || 0) - Number(inv.discount_amount || 0) : 0
                      return (
                        <tr key={row.id || row.lead_id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <Avatar name={row.lead?.name || row.student_name} size={28}/>
                              <div>
                                <div className="text-sm font-medium text-slate-900">{row.lead?.name || row.student_name}</div>
                                <div className="text-[10px] text-slate-400">{row.lead?.phone || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="font-semibold text-slate-900">{inv ? fmtCurrency(inv.total_fee) : <span className="text-slate-300 text-xs">—</span>}</td>
                          <td className="hidden sm:table-cell text-purple-700 text-xs">{inv && Number(inv.scholarship_amount) > 0 ? fmtCurrency(inv.scholarship_amount) : '—'}</td>
                          <td className="hidden sm:table-cell text-emerald-700 text-xs">{inv && Number(inv.discount_amount) > 0 ? fmtCurrency(inv.discount_amount) : '—'}</td>
                          <td className="text-emerald-700 font-semibold">{inv ? fmtCurrency(inv.amount_paid || 0) : '—'}</td>
                          <td className="font-bold text-blue-700">{inv ? fmtCurrency(inv.balance || 0) : '—'}</td>
                          <td>{inv ? feeStatus(inv) : <span className="text-[10px] text-slate-300">No fee</span>}</td>
                          <td>
                            <button onClick={() => openFeeEdit(row)} className="btn btn-ghost btn-sm">
                              {inv ? 'Edit' : '+ Set'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Edit/Set Fee Modal */}
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
                    <div className="inp bg-slate-50 font-bold text-blue-700 flex items-center">
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

      {/* ── Pending Cash Tab ──────────────────────────────────────────────── */}
      {tab === 'pending_cash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Pending Cash Payments</h2>
              <p className="text-xs text-slate-400 mt-0.5">Students who selected "Pay Cash" at class. Record their payment here.</p>
            </div>
            <button onClick={loadPendingCash} className="btn btn-ghost btn-sm">{Icon.back && null}↺ Refresh</button>
          </div>

          {loadingCash ? <Spinner size={24}/> : pendingCash.length === 0 ? (
            <EmptyState icon="💵" title="No pending cash payments" sub="Students who click 'Pay Cash' at class sign-in will appear here"/>
          ) : (
            <div className="card overflow-hidden">
              <div className="divide-y divide-slate-50">
                {pendingCash.map(txn => {
                  const inv = txn.invoice
                  const grossFee = Number(inv?.total_fee || 0)
                  const scholarship = Number(inv?.scholarship_amount || 0)
                  const discount = Number(inv?.discount_amount || 0)
                  const netFee = grossFee - scholarship - discount
                  const prevPaid = Number(inv?.amount_paid || 0)
                  const balance = Math.max(0, netFee - prevPaid)

                  return (
                    <div key={txn.id} className="p-4 flex items-center gap-3 flex-wrap">
                      <Avatar name={txn.lead?.name || '?'} size={38}/>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{txn.lead?.name}</div>
                        <div className="text-[11px] text-slate-400">{txn.lead?.phone || '—'} · {txn.invoice?.course || '—'}</div>
                        <div className="text-[10px] text-amber-600 mt-0.5">{timeAgo(txn.created_at)} · Balance: {fmtCurrency(balance)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-slate-900">{fmtCurrency(txn.amount || balance)}</div>
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

          {/* Record Payment Modal */}
          {recordingTxn && (
            <Modal title={`Record Payment — ${recordingTxn.lead?.name}`} onClose={() => setRecordingTxn(null)}>
              <div className="space-y-4">
                <div>
                  <Label>Amount Received (GH₵) *</Label>
                  <input type="number" min="0" step="10"
                    value={recordForm.amount}
                    onChange={e => setRecordForm(f => ({ ...f, amount: e.target.value }))}
                    className="inp text-lg font-bold"/>
                  <p className="text-[10px] text-slate-400 mt-1">Can be partial — student will be prompted to pay remaining balance next class.</p>
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

          {/* Receipt after recording */}
          {receiptData && (
            <Modal title="Payment Recorded ✅" onClose={() => setReceiptData(null)}>
              <div className="text-center py-2 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider mb-1">Receipt</div>
                  <div className="text-xl font-black text-emerald-800 font-mono">{receiptData.receipt_no}</div>
                  <div className="text-sm text-emerald-700 mt-1">{receiptData.student_name} · {fmtCurrency(receiptData.amount_paid)}</div>
                  <div className="text-xs text-emerald-600 mt-0.5">Balance: {fmtCurrency(receiptData.new_balance)}</div>
                </div>
                <p className="text-xs text-slate-400">An SMS has been sent to the student automatically.</p>
                <div className="space-y-2">
                  <button onClick={() => sendWAReceipt(receiptData)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold press transition">
                    📱 Send Receipt via WhatsApp
                  </button>
                  <button onClick={() => printReceipt(receiptData)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-slate-200 text-slate-700 text-sm font-bold press transition">
                    🖨️ Print / Save PDF
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
