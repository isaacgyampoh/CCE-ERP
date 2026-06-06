import { useState, useEffect } from 'react'
import { Avatar, Badge, EmptyState, Spinner, Modal, Label } from '@/components/ui'
import { Icon } from '@/components/ui'
import { fmtCurrency, fmtDate, fmtDateTime, formatPhone } from '@/lib/helpers'

export default function Admission({ sb, staff, leads, user }) {
  const [tab, setTab] = useState('pending')  // pending | registered | letters | fees
  const [registrations, setRegistrations] = useState([])
  const [letters, setLetters] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReg, setSelectedReg] = useState(null)
  const [letterModal, setLetterModal] = useState(null)
  const [feeModal, setFeeModal] = useState(null)
  const [feeForm, setFeeForm] = useState({ total_fee: '', due_date: '', notes: '' })
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: regs }, { data: lets }, { data: invs }] = await Promise.all([
      sb.from('registrations').select('*, lead:lead_id(*, assignee:assigned_to(id,name))').order('created_at', { ascending: false }),
      sb.from('admission_letters').select('*').order('created_at', { ascending: false }).limit(50),
      sb.from('school_fee_invoices').select('*').order('created_at', { ascending: false }),
    ])
    setRegistrations(regs || [])
    setLetters(lets || [])
    setInvoices(invs || [])
    setLoading(false)
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const sendLetter = async (reg) => {
    setSending(true)
    setLetterModal(null)
    try {
      const res = await fetch('/api/admission/send-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: reg.id, trigger: 'manual', sent_by_id: user.id })
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`Admission letter sent! Email: ${data.results.email ? '✓' : 'not configured'} · WA: ${data.results.whatsapp ? '✓' : 'use link below'}`)
        // If WABA not configured, open wa.me
        if (!data.results.whatsapp && data.results.whatsapp_message) {
          const phone = formatPhone(data.results.whatsapp_phone)
          if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(data.results.whatsapp_message)}`, '_blank')
        }
      } else {
        showToast('Something went wrong sending the letter.', 'error')
      }
    } catch (e) { showToast('Network error. Check your Vercel logs.', 'error') }
    setSending(false)
    loadAll()
  }

  const createFeeInvoice = async () => {
    if (!feeModal || !feeForm.total_fee) return
    setSending(true)
    try {
      const res = await fetch('/api/fees/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: feeModal.id, ...feeForm, sent_by_id: user.id })
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`School fee invoice created & sent! GH₵${feeForm.total_fee}`)
        setFeeModal(null)
        setFeeForm({ total_fee: '', due_date: '', notes: '' })
      } else {
        showToast('Failed to create invoice.', 'error')
      }
    } catch (e) { showToast('Network error.', 'error') }
    setSending(false)
    loadAll()
  }

  // Manual fee record (bank/cash)
  const recordManualPayment = async (invoiceId, amount, channel, notes) => {
    const ref = `CCE-MAN-${Date.now().toString(36).toUpperCase()}`
    const inv = invoices.find(i => i.id === invoiceId)
    if (!inv) return
    const newPaid = Number(inv.amount_paid) + Number(amount)
    const newBalance = Math.max(0, Number(inv.total_fee) - newPaid)
    const newStatus = newBalance <= 0 ? 'paid' : 'partial'
    await sb.from('school_fee_invoices').update({ amount_paid: newPaid, balance: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq('id', invoiceId)
    await sb.from('payments').insert({ lead_id: inv.lead_id, registration_id: inv.registration_id, payment_type: 'school_fee', amount: Number(amount), reference: ref, channel, status: 'success', paid_at: new Date().toISOString(), notes, recorded_by: user.id })
    showToast(`Payment of ${fmtCurrency(amount)} recorded manually.`)
    loadAll()
  }

  const pending = registrations.filter(r => !r.admission_letter_sent)
  const admitted = registrations.filter(r => r.admission_letter_sent)

  const tabs = [
    { id: 'pending',    label: 'Needs Letter',  count: pending.length,    badge: pending.length > 0 ? 'bg-amber-100 text-amber-700' : '' },
    { id: 'registered', label: 'All Students',   count: admitted.length,   badge: '' },
    { id: 'letters',    label: 'Letters Sent',   count: letters.length,    badge: '' },
    { id: 'fees',       label: 'School Fees',    count: invoices.length,   badge: '' },
  ]

  if (loading) return <Spinner size={24}/>

  return (
    <div className="fade-up space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg fade-up ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-slate-900">Admissions</h1>
        <p className="text-sm text-slate-400 mt-0.5">Admission letters, student records, school fee invoices</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card"><div className="stat-value text-amber-600">{pending.length}</div><div className="stat-label">Needs Letter</div></div>
        <div className="stat-card"><div className="stat-value text-emerald-600">{admitted.length}</div><div className="stat-label">Letters Sent</div></div>
        <div className="stat-card"><div className="stat-value text-blue-600">{invoices.filter(i => i.status === 'pending').length}</div><div className="stat-label">Fee Invoices Pending</div></div>
        <div className="stat-card"><div className="stat-value text-indigo-600">{invoices.filter(i => i.status === 'paid').length}</div><div className="stat-label">Fees Fully Paid</div></div>
      </div>

      {/* Auto-send note */}
      {pending.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <div className="text-2xl mt-0.5">📬</div>
          <div>
            <div className="text-sm font-bold text-amber-800">{pending.length} student{pending.length > 1 ? 's' : ''} waiting for admission letters</div>
            <div className="text-xs text-amber-600 mt-0.5">Admission letters are auto-sent after payment via Paystack webhook. If auto-send failed or wasn't configured, send manually below.</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
            {t.count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.badge || 'bg-slate-200 text-slate-600'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Send letter modal */}
      {letterModal && (
        <Modal title="Send Admission Letter" onClose={() => setLetterModal(null)}>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
              <div className="font-semibold text-slate-900">{letterModal.full_name}</div>
              <div className="text-slate-500">{letterModal.email || 'No email on file'} · {letterModal.phone}</div>
              <div className="text-slate-500">Course: {letterModal.course_interest || '—'}</div>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="font-bold text-slate-800">This will automatically:</div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">✓</div>
                Send official admission letter via <strong>Email</strong> {letterModal.email ? `(${letterModal.email})` : '⚠️ No email'}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 text-green-600 flex items-center justify-center text-[10px]">✓</div>
                Send admission confirmation via <strong>WhatsApp</strong> {letterModal.phone ? `(${letterModal.phone})` : '⚠️ No phone'}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-violet-100 text-violet-600 flex items-center justify-center text-[10px]">✓</div>
                Notify the assigned marketer (<strong>{letterModal.marketer_name || 'N/A'}</strong>)
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]">✓</div>
                Log everything in the system
              </div>
            </div>
            {(!letterModal.email && !letterModal.phone) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">⚠️ This student has no email and no phone number. Please update their record first.</div>
            )}
            <button onClick={() => sendLetter(letterModal)} disabled={sending || (!letterModal.email && !letterModal.phone)}
              className="btn btn-primary w-full press">
              {sending ? 'Sending…' : '📨 Send Admission Letter'}
            </button>
          </div>
        </Modal>
      )}

      {/* School fee invoice modal */}
      {feeModal && (
        <Modal title="Create School Fee Invoice" onClose={() => setFeeModal(null)}>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <div className="font-semibold text-slate-900">{feeModal.full_name}</div>
              <div className="text-slate-500 text-xs">{feeModal.course_interest}</div>
            </div>
            <div>
              <Label>Total School Fee (GH₵) *</Label>
              <input type="number" value={feeForm.total_fee} onChange={e => setFeeForm({...feeForm, total_fee: e.target.value})} placeholder="e.g. 2500" className="inp"/>
            </div>
            <div>
              <Label>Payment Due Date</Label>
              <input type="date" value={feeForm.due_date} onChange={e => setFeeForm({...feeForm, due_date: e.target.value})} className="inp"/>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <textarea value={feeForm.notes} onChange={e => setFeeForm({...feeForm, notes: e.target.value})} placeholder="e.g. Payment plan: 50% upfront, 50% mid-term" className="inp" rows="2"/>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
              <div className="font-bold">This will:</div>
              <div>• Generate a Paystack payment link</div>
              <div>• Send fee invoice via Email + WhatsApp to student</div>
              <div>• Notify Finance team</div>
            </div>
            <button onClick={createFeeInvoice} disabled={!feeForm.total_fee || sending} className="btn btn-primary w-full press">
              {sending ? 'Creating…' : '🧾 Create & Send Invoice'}
            </button>
          </div>
        </Modal>
      )}

      {/* Tab content */}
      {/* ── Pending Letters ── */}
      {tab === 'pending' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Students Awaiting Admission Letters</h2>
            <p className="text-xs text-slate-400 mt-0.5">These students paid but haven't received their letter yet</p>
          </div>
          {pending.length === 0 ? (
            <EmptyState icon="✅" title="All admission letters sent!" sub="Every registered student has been admitted."/>
          ) : (
            <table className="data-table">
              <thead><tr><th>Student</th><th>Course</th><th className="hidden md:table-cell">Marketer</th><th className="hidden sm:table-cell">Reg. Fee</th><th className="hidden sm:table-cell">Paid</th><th>Actions</th></tr></thead>
              <tbody>
                {pending.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.full_name} size={30}/>
                        <div>
                          <div className="font-medium text-slate-900">{r.full_name}</div>
                          <div className="text-[10px] text-slate-400">{r.email || r.phone || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs text-slate-600 max-w-[130px] truncate">{r.course_interest || '—'}</td>
                    <td className="hidden md:table-cell text-xs text-slate-500">{r.marketer_name || '—'}</td>
                    <td className="hidden sm:table-cell font-semibold text-emerald-700 text-sm">{fmtCurrency(r.amount_paid)}</td>
                    <td className="hidden sm:table-cell text-xs text-slate-400">{fmtDate(r.paid_at)}</td>
                    <td>
                      <button onClick={() => setLetterModal(r)} disabled={sending}
                        className="btn btn-primary btn-sm press">
                        {Icon.send} Send Letter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── All Students ── */}
      {tab === 'registered' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">All Registered Students ({registrations.length})</h2>
          </div>
          {registrations.length === 0 ? <EmptyState icon="🎓" title="No registrations yet"/> : (
            <table className="data-table">
              <thead><tr><th>Student</th><th>Course</th><th className="hidden md:table-cell">Marketer</th><th className="hidden sm:table-cell">Reg. Fee</th><th>Letter</th><th>Fee Invoice</th><th>Actions</th></tr></thead>
              <tbody>
                {registrations.map(r => {
                  const inv = invoices.find(i => i.registration_id === r.id)
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.full_name} size={30}/>
                          <div>
                            <div className="font-medium text-slate-900">{r.full_name}</div>
                            <div className="text-[10px] text-slate-400">{r.email || r.phone || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs text-slate-600 max-w-[120px] truncate">{r.course_interest || '—'}</td>
                      <td className="hidden md:table-cell text-xs text-slate-500">{r.marketer_name || '—'}</td>
                      <td className="hidden sm:table-cell font-semibold text-emerald-700">{fmtCurrency(r.amount_paid)}</td>
                      <td>
                        {r.admission_letter_sent
                          ? <span className="badge bg-emerald-50 text-emerald-600">Sent ✓</span>
                          : <span className="badge bg-amber-50 text-amber-700">Pending</span>}
                      </td>
                      <td>
                        {inv ? (
                          <span className={`badge ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : inv.status === 'partial' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                            {inv.status === 'paid' ? 'Paid ✓' : inv.status === 'partial' ? `Partial` : 'Pending'}
                          </span>
                        ) : <span className="text-xs text-slate-300">None</span>}
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          {!r.admission_letter_sent && (
                            <button onClick={() => setLetterModal(r)} className="btn btn-primary btn-sm">{Icon.send}</button>
                          )}
                          {r.admission_letter_sent && !inv && (
                            <button onClick={() => setFeeModal(r)} className="btn btn-ghost btn-sm text-blue-600">💳 Fee</button>
                          )}
                          {inv && inv.status !== 'paid' && (
                            <button onClick={() => {
                              const amt = prompt('Record manual payment amount (GHS):')
                              const channel = prompt('Payment channel (bank_transfer / cash / momo):') || 'cash'
                              const notes = prompt('Notes (optional):') || ''
                              if (amt) recordManualPayment(inv.id, amt, channel, notes)
                            }} className="btn btn-ghost btn-sm">+ Pay</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Letters log ── */}
      {tab === 'letters' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Admission Letters Log ({letters.length})</h2>
          </div>
          {letters.length === 0 ? <EmptyState icon="📨" title="No letters sent yet"/> : (
            <table className="data-table">
              <thead><tr><th>Student</th><th>Course</th><th className="hidden md:table-cell">Marketer</th><th>Email</th><th>WhatsApp</th><th className="hidden sm:table-cell">Sent</th></tr></thead>
              <tbody>
                {letters.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div className="font-medium text-slate-900">{l.student_name}</div>
                      <div className="text-[10px] text-slate-400">{l.student_email}</div>
                    </td>
                    <td className="text-xs text-slate-600 max-w-[120px] truncate">{l.course || '—'}</td>
                    <td className="hidden md:table-cell text-xs text-slate-500">{l.marketer_name || '—'}</td>
                    <td>{l.sent_via_email ? <span className="badge bg-emerald-50 text-emerald-600">✓ Sent</span> : <span className="badge bg-red-50 text-red-500">✗</span>}</td>
                    <td>{l.sent_via_wa ? <span className="badge bg-emerald-50 text-emerald-600">✓ Sent</span> : <span className="badge bg-slate-100 text-slate-400">Manual</span>}</td>
                    <td className="hidden sm:table-cell text-xs text-slate-400">{fmtDateTime(l.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── School Fees ── */}
      {tab === 'fees' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="stat-card"><div className="stat-value">{invoices.length}</div><div className="stat-label">Total Invoices</div></div>
            <div className="stat-card"><div className="stat-value text-emerald-600">{fmtCurrency(invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0))}</div><div className="stat-label">Fees Collected</div></div>
            <div className="stat-card"><div className="stat-value text-orange-600">{fmtCurrency(invoices.reduce((s, i) => s + Number(i.balance || 0), 0))}</div><div className="stat-label">Outstanding Balance</div></div>
            <div className="stat-card"><div className="stat-value text-blue-600">{invoices.filter(i => i.status === 'partial').length}</div><div className="stat-label">Part-Paid</div></div>
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">School Fee Invoices</h2></div>
            {invoices.length === 0 ? <EmptyState icon="🧾" title="No invoices yet" sub="Create a fee invoice from the All Students tab after sending the admission letter"/> : (
              <table className="data-table">
                <thead><tr><th>Student</th><th>Course</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-medium text-slate-900">{inv.student_name}</td>
                      <td className="text-xs text-slate-600 max-w-[120px] truncate">{inv.course || '—'}</td>
                      <td className="font-semibold text-slate-900">{fmtCurrency(inv.total_fee)}</td>
                      <td className="font-semibold text-emerald-700">{fmtCurrency(inv.amount_paid)}</td>
                      <td className={`font-semibold ${inv.balance > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{fmtCurrency(inv.balance)}</td>
                      <td className="text-xs text-slate-400">{fmtDate(inv.due_date)}</td>
                      <td>
                        <span className={`badge ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : inv.status === 'partial' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                          {inv.status === 'paid' ? 'Paid ✓' : inv.status === 'partial' ? 'Part-paid' : 'Pending'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          {inv.status !== 'paid' && (
                            <button onClick={() => {
                              const amt = prompt(`Record payment for ${inv.student_name}.\nOutstanding: GH₵${inv.balance}\nAmount received (GHS):`)
                              const ch = prompt('Channel (paystack / bank_transfer / cash / momo):') || 'cash'
                              const nt = prompt('Notes:') || ''
                              if (amt && Number(amt) > 0) recordManualPayment(inv.id, amt, ch, nt)
                            }} className="btn btn-primary btn-sm">+ Payment</button>
                          )}
                          {inv.paystack_link && (
                            <a href={inv.paystack_link} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">{Icon.link}</a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
