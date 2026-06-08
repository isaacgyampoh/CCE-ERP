import { useState, useEffect } from 'react'
import { Avatar, Badge, EmptyState, Spinner, Modal, Label } from '@/components/ui'
import { Icon } from '@/components/ui'
import { fmtCurrency, fmtDate, fmtDateTime, formatPhone } from '@/lib/helpers'

const Dot = ({ color }) => (
  <span style={{ width:6, height:6, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }}/>
)

export default function Admission({ sb, staff, leads, user }) {
  const [tab, setTab] = useState('pending')
  const [registrations, setRegistrations] = useState([])
  const [letters, setLetters]             = useState([])
  const [invoices, setInvoices]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [selectedReg, setSelectedReg]     = useState(null)
  const [letterModal, setLetterModal]     = useState(null)
  const [feeModal, setFeeModal]           = useState(null)
  const [feeForm, setFeeForm]             = useState({ total_fee: '', due_date: '', notes: '' })
  const [sending, setSending]             = useState(false)
  const [toast, setToast]                 = useState(null)

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

  const pending  = registrations.filter(r => !r.admission_letter_sent)
  const admitted = registrations.filter(r => r.admission_letter_sent)

  const tabs = [
    { id: 'pending',    label: 'Needs Letter',  count: pending.length,    urgent: pending.length > 0 },
    { id: 'registered', label: 'All Students',   count: admitted.length,   urgent: false },
    { id: 'letters',    label: 'Letters Sent',   count: letters.length,    urgent: false },
    { id: 'fees',       label: 'School Fees',    count: invoices.length,   urgent: false },
  ]

  const feeStatusDot = (inv) => {
    if (!inv) return null
    const map = { paid: { color:'var(--ok)', label:'Paid ✓' }, partial: { color:'var(--info)', label:'Part-paid' }, pending: { color:'var(--warn)', label:'Pending' } }
    const s = map[inv.status] || { color:'var(--ink-3)', label: inv.status }
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink)' }}>
        <Dot color={s.color}/>
        {s.label}
      </span>
    )
  }

  if (loading) return <Spinner size={24}/>

  return (
    <div className="fade-up space-y-5">
      {toast && (
        <div style={{
          position:'fixed', top:16, right:16, zIndex:50, borderRadius:'var(--r)',
          padding:'12px 16px', fontSize:13, fontWeight:500, boxShadow:'0 4px 16px rgba(0,0,0,.12)',
          background: toast.type === 'error' ? 'var(--bad)' : 'var(--ok)', color:'#fff'
        }}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 style={{ fontSize:17, fontWeight:600, color:'var(--ink)' }}>Admissions</h1>
        <p style={{ fontSize:12.5, color:'var(--ink-3)', marginTop:2 }}>Admission letters, student records, school fee invoices</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--warn)' }}>{pending.length}</div><div className="stat-label">Needs Letter</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--ok)' }}>{admitted.length}</div><div className="stat-label">Letters Sent</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--info)' }}>{invoices.filter(i => i.status === 'pending').length}</div><div className="stat-label">Fee Invoices Pending</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color:'var(--accent)' }}>{invoices.filter(i => i.status === 'paid').length}</div><div className="stat-label">Fees Fully Paid</div></div>
      </div>

      {/* Alert */}
      {pending.length > 0 && (
        <div style={{ borderRadius:'var(--r)', background:'#fffbeb', border:'1px solid #fcd34d', padding:16, display:'flex', alignItems:'flex-start', gap:12 }}>
          <Dot color="var(--warn)"/>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#92400e' }}>{pending.length} student{pending.length > 1 ? 's' : ''} waiting for admission letters</div>
            <div style={{ fontSize:12, color:'#b45309', marginTop:2 }}>Admission letters are auto-sent after payment via Paystack webhook. If auto-send failed or wasn't configured, send manually below.</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'var(--bg)', borderRadius:'var(--r)', padding:4, width:'fit-content', border:'1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:4,
              fontSize:12, fontWeight:600, border:'none', cursor:'pointer', transition:'background .1s',
              background: tab === t.id ? 'var(--panel)' : 'transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-2)',
              boxShadow: tab === t.id ? 'var(--shadow)' : 'none',
            }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10,
                background: t.urgent ? 'var(--warn)' : 'var(--border)',
                color: t.urgent ? '#fff' : 'var(--ink-2)',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Send letter modal */}
      {letterModal && (
        <Modal title="Send Admission Letter" onClose={() => setLetterModal(null)}>
          <div className="space-y-4">
            <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:16, border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, color:'var(--ink)', marginBottom:4 }}>{letterModal.full_name}</div>
              <div style={{ fontSize:12, color:'var(--ink-2)' }}>{letterModal.email || 'No email on file'} · {letterModal.phone}</div>
              <div style={{ fontSize:12, color:'var(--ink-2)' }}>Course: {letterModal.course_interest || '—'}</div>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <div style={{ fontWeight:700, color:'var(--ink)', fontSize:12 }}>This will automatically:</div>
              {[
                ['Email', `(${letterModal.email || '⚠️ No email'})`, 'var(--info)'],
                ['WhatsApp', letterModal.phone ? `(${letterModal.phone})` : '⚠️ No phone', 'var(--ok)'],
                ['Notify marketer', letterModal.marketer_name || 'N/A', 'var(--accent)'],
                ['Log everything', '', 'var(--ink-3)'],
              ].map(([label, sub, color]) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:16, height:16, borderRadius:4, background:'var(--bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:9, color:color }}>✓</span>
                  <span style={{ fontSize:12, color:'var(--ink-2)' }}>Send via <strong style={{ color:'var(--ink)' }}>{label}</strong> {sub}</span>
                </div>
              ))}
            </div>
            {(!letterModal.email && !letterModal.phone) && (
              <div style={{ borderRadius:'var(--r)', border:'1px solid var(--border)', background:'#fdf2f2', padding:12, fontSize:12, color:'var(--bad)' }}>
                This student has no email and no phone. Please update their record first.
              </div>
            )}
            <button onClick={() => sendLetter(letterModal)} disabled={sending || (!letterModal.email && !letterModal.phone)}
              className="btn btn-primary w-full press">
              {sending ? 'Sending…' : 'Send Admission Letter'}
            </button>
          </div>
        </Modal>
      )}

      {/* School fee invoice modal */}
      {feeModal && (
        <Modal title="Create School Fee Invoice" onClose={() => setFeeModal(null)}>
          <div className="space-y-4">
            <div style={{ background:'var(--bg)', borderRadius:'var(--r)', padding:12, border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, color:'var(--ink)' }}>{feeModal.full_name}</div>
              <div style={{ fontSize:12, color:'var(--ink-2)' }}>{feeModal.course_interest}</div>
            </div>
            <div><Label>Total School Fee (GH₵) *</Label>
              <input type="number" value={feeForm.total_fee} onChange={e => setFeeForm({...feeForm, total_fee: e.target.value})} placeholder="e.g. 2500" className="inp"/>
            </div>
            <div><Label>Payment Due Date</Label>
              <input type="date" value={feeForm.due_date} onChange={e => setFeeForm({...feeForm, due_date: e.target.value})} className="inp"/>
            </div>
            <div><Label>Notes (optional)</Label>
              <textarea value={feeForm.notes} onChange={e => setFeeForm({...feeForm, notes: e.target.value})} placeholder="e.g. Payment plan: 50% upfront, 50% mid-term" className="inp" rows="2"/>
            </div>
            <div style={{ borderRadius:'var(--r)', background:'var(--accent-wash)', border:'1px solid var(--border)', padding:12, fontSize:12, color:'var(--ink-2)' }}>
              <div style={{ fontWeight:700, color:'var(--ink)', marginBottom:4 }}>This will:</div>
              <div>• Generate a Paystack payment link</div>
              <div>• Send fee invoice via Email + WhatsApp to student</div>
              <div>• Notify Finance team</div>
            </div>
            <button onClick={createFeeInvoice} disabled={!feeForm.total_fee || sending} className="btn btn-primary w-full press">
              {sending ? 'Creating…' : 'Create & Send Invoice'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Pending Letters ── */}
      {tab === 'pending' && (
        <div className="card overflow-hidden">
          <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Students Awaiting Admission Letters</h2>
            <p style={{ fontSize:12, color:'var(--ink-3)', marginTop:2 }}>These students paid but haven't received their letter yet</p>
          </div>
          {pending.length === 0 ? (
            <EmptyState title="All admission letters sent!" sub="Every registered student has been admitted."/>
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
                          <div style={{ fontWeight:500, color:'var(--ink)' }}>{r.full_name}</div>
                          <div style={{ fontSize:10, color:'var(--ink-3)' }}>{r.email || r.phone || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:12, color:'var(--ink-2)', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.course_interest || '—'}</td>
                    <td className="hidden md:table-cell" style={{ fontSize:12, color:'var(--ink-2)' }}>{r.marketer_name || '—'}</td>
                    <td className="hidden sm:table-cell" style={{ fontWeight:600, color:'var(--ok)' }}>{fmtCurrency(r.amount_paid)}</td>
                    <td className="hidden sm:table-cell" style={{ fontSize:12, color:'var(--ink-3)' }}>{fmtDate(r.paid_at)}</td>
                    <td>
                      <button onClick={() => setLetterModal(r)} disabled={sending} className="btn btn-primary btn-sm press">
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
          <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>All Registered Students ({registrations.length})</h2>
          </div>
          {registrations.length === 0 ? <EmptyState title="No registrations yet"/> : (
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
                            <div style={{ fontWeight:500, color:'var(--ink)' }}>{r.full_name}</div>
                            <div style={{ fontSize:10, color:'var(--ink-3)' }}>{r.email || r.phone || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize:12, color:'var(--ink-2)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.course_interest || '—'}</td>
                      <td className="hidden md:table-cell" style={{ fontSize:12, color:'var(--ink-2)' }}>{r.marketer_name || '—'}</td>
                      <td className="hidden sm:table-cell" style={{ fontWeight:600, color:'var(--ok)' }}>{fmtCurrency(r.amount_paid)}</td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink)' }}>
                          <Dot color={r.admission_letter_sent ? 'var(--ok)' : 'var(--warn)'}/>
                          {r.admission_letter_sent ? 'Sent' : 'Pending'}
                        </span>
                      </td>
                      <td>
                        {inv ? feeStatusDot(inv) : <span style={{ fontSize:12, color:'var(--ink-3)' }}>None</span>}
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          {!r.admission_letter_sent && (
                            <button onClick={() => setLetterModal(r)} className="btn btn-primary btn-sm">{Icon.send}</button>
                          )}
                          {r.admission_letter_sent && !inv && (
                            <button onClick={() => setFeeModal(r)} className="btn btn-ghost btn-sm" style={{ color:'var(--info)' }}>Fee</button>
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
          <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>Admission Letters Log ({letters.length})</h2>
          </div>
          {letters.length === 0 ? <EmptyState title="No letters sent yet"/> : (
            <table className="data-table">
              <thead><tr><th>Student</th><th>Course</th><th className="hidden md:table-cell">Marketer</th><th>Email</th><th>WhatsApp</th><th className="hidden sm:table-cell">Sent</th></tr></thead>
              <tbody>
                {letters.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight:500, color:'var(--ink)' }}>{l.student_name}</div>
                      <div style={{ fontSize:10, color:'var(--ink-3)' }}>{l.student_email}</div>
                    </td>
                    <td style={{ fontSize:12, color:'var(--ink-2)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.course || '—'}</td>
                    <td className="hidden md:table-cell" style={{ fontSize:12, color:'var(--ink-2)' }}>{l.marketer_name || '—'}</td>
                    <td>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink)' }}>
                        <Dot color={l.sent_via_email ? 'var(--ok)' : 'var(--bad)'}/>
                        {l.sent_via_email ? 'Sent' : 'Failed'}
                      </span>
                    </td>
                    <td>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--ink)' }}>
                        <Dot color={l.sent_via_wa ? 'var(--ok)' : 'var(--ink-3)'}/>
                        {l.sent_via_wa ? 'Sent' : 'Manual'}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell" style={{ fontSize:12, color:'var(--ink-3)' }}>{fmtDateTime(l.sent_at)}</td>
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
            <div className="stat-card"><div className="stat-value" style={{ color:'var(--ok)' }}>{fmtCurrency(invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0))}</div><div className="stat-label">Fees Collected</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color:'var(--warn)' }}>{fmtCurrency(invoices.reduce((s, i) => s + Number(i.balance || 0), 0))}</div><div className="stat-label">Outstanding Balance</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color:'var(--info)' }}>{invoices.filter(i => i.status === 'partial').length}</div><div className="stat-label">Part-Paid</div></div>
          </div>

          <div className="card overflow-hidden">
            <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
              <h2 style={{ fontSize:13, fontWeight:600, color:'var(--ink)' }}>School Fee Invoices</h2>
            </div>
            {invoices.length === 0 ? <EmptyState title="No invoices yet" sub="Create a fee invoice from the All Students tab after sending the admission letter"/> : (
              <table className="data-table">
                <thead><tr><th>Student</th><th>Course</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight:500, color:'var(--ink)' }}>{inv.student_name}</td>
                      <td style={{ fontSize:12, color:'var(--ink-2)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.course || '—'}</td>
                      <td style={{ fontWeight:600, color:'var(--ink)' }}>{fmtCurrency(inv.total_fee)}</td>
                      <td style={{ fontWeight:600, color:'var(--ok)' }}>{fmtCurrency(inv.amount_paid)}</td>
                      <td style={{ fontWeight:600, color: inv.balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtCurrency(inv.balance)}</td>
                      <td style={{ fontSize:12, color:'var(--ink-3)' }}>{fmtDate(inv.due_date)}</td>
                      <td>{feeStatusDot(inv)}</td>
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
