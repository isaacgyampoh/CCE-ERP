import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON, PAYSTACK_PK } from '@/lib/constants'
import { loadPaystack, fmtCurrency, fmtDate } from '@/lib/helpers'

const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

// ─── Receipt Print Window ──────────────────────────────────────────────────────
function openPrintReceipt(d) {
  const w = window.open('', '_blank', 'width=520,height=720')
  const fmtGHS = (n) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
  const fmtD = (s) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt ${d.receipt_no}</title>
<meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#fff;padding:28px;color:#1e293b;max-width:420px;margin:auto}
.hdr{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:16px;margin-bottom:20px}
.logo{font-size:26px;font-weight:900;color:#1d4ed8}
.sub{font-size:12px;color:#64748b;margin-top:3px}
.ref-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;text-align:center;margin-bottom:20px}
.ref-label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px}
.ref-no{font-size:22px;font-weight:900;color:#1d4ed8;letter-spacing:2px}
table{width:100%;border-collapse:collapse}
tr{border-bottom:1px solid #f1f5f9}
td{padding:10px 4px;font-size:13px}
td:first-child{color:#64748b;width:42%}
td:last-child{font-weight:600;text-align:right}
.big{font-size:16px;font-weight:900;color:#1d4ed8;border-bottom:none}
.status-chip{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.paid{background:#dcfce7;color:#166534}
.partial{background:#fef3c7;color:#92400e}
.ftr{text-align:center;margin-top:22px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:14px;line-height:1.6}
@media print{body{padding:0}}
</style></head>
<body>
<div class="hdr">
  <div class="logo">CCE</div>
  <div class="sub">Cambridge Center of Excellence</div>
  <div style="font-size:10px;color:#94a3b8;margin-top:2px">Official Payment Receipt</div>
</div>
<div class="ref-box">
  <div class="ref-label">Receipt Number</div>
  <div class="ref-no">${d.receipt_no}</div>
</div>
<table>
  <tr><td>Student Name</td><td>${d.student_name}</td></tr>
  <tr><td>Course</td><td>${d.course}</td></tr>
  <tr><td>Payment Method</td><td>${d.method}</td></tr>
  <tr><td>Date</td><td>${fmtD(d.paid_at)}</td></tr>
  <tr><td>Reference</td><td>${d.reference || d.receipt_no}</td></tr>
  <tr><td style="padding-top:14px">Amount Paid</td><td class="big">${fmtGHS(d.amount)}</td></tr>
  <tr><td>Total Paid to Date</td><td style="font-weight:700">${fmtGHS(d.total_paid)}</td></tr>
  <tr><td>Balance Remaining</td><td style="font-weight:700;color:${d.balance <= 0 ? '#166534' : '#92400e'}">${fmtGHS(d.balance)}</td></tr>
  <tr><td>Status</td><td><span class="status-chip ${d.balance <= 0 ? 'paid' : 'partial'}">${d.balance <= 0 ? 'FULLY PAID ✓' : 'PARTIAL PAYMENT'}</span></td></tr>
</table>
<div class="ftr">
  Cambridge Center of Excellence · Accra, Ghana<br>
  This is an official payment receipt. Please keep for your records.
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),350)</script>
</body></html>`)
  w.document.close()
}

export default function AttendPage() {
  const params    = new URLSearchParams(window.location.search)
  const sessionId = params.get('s')

  const [step, setStep]         = useState('loading')
  const [session, setSession]   = useState(null)
  const [enrolments, setEnrolments] = useState([])
  const [nameInput, setNameInput]   = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedName, setSelectedName] = useState('')
  const [selectedPhone, setSelectedPhone] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [mode, setMode]         = useState('in-person')
  const [code, setCode]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState(null)

  // Fee / Payment states
  const [feeRecord, setFeeRecord]   = useState(null)
  const [paymentData, setPaymentData] = useState(null)
  const [cashLoading, setCashLoading] = useState(false)
  const [payLoading, setPayLoading]   = useState(false)

  const nameRef = useRef(null)

  // Load Paystack inline script
  useEffect(() => { loadPaystack().catch(() => {}) }, [])

  useEffect(() => {
    if (!sessionId) { setStep('error'); return }
    init()
  }, [])

  const init = async () => {
    const { data: sess } = await sb.from('class_sessions')
      .select('*, cohort:cohort_id(id, course_name, mode, class_day, class_time, location)').eq('id', sessionId).single()

    if (!sess) { setStep('error'); return }
    if (!sess.attendance_open) { setStep('closed'); setSession(sess); return }

    setSession(sess)

    const { data: enr } = await sb.from('enrolments')
      .select('student_name, lead_id, mode, student_phone').eq('cohort_id', sess.cohort_id).eq('rsvp_status', 'confirmed')

    setEnrolments(enr || [])
    setStep('name')
    setTimeout(() => nameRef.current?.focus(), 300)
  }

  useEffect(() => {
    if (!nameInput.trim() || nameInput.length < 2) { setSuggestions([]); return }
    const q = nameInput.toLowerCase()
    setSuggestions(enrolments.filter(e => e.student_name.toLowerCase().includes(q)).slice(0, 5))
  }, [nameInput, enrolments])

  const pickName = (name, m, leadId, phone) => {
    setSelectedName(name); setNameInput(name)
    setMode(m || mode)
    setSelectedLeadId(leadId || null)
    setSelectedPhone(phone || '')
    setSuggestions([])
    setStep('code')
    setTimeout(() => document.getElementById('code-input')?.focus(), 200)
  }

  const handleNameNext = () => {
    if (!nameInput.trim()) return
    const match = enrolments.find(e =>
      e.student_name.toLowerCase().includes(nameInput.toLowerCase()) ||
      nameInput.toLowerCase().includes(e.student_name.toLowerCase())
    )
    setSelectedName(match?.student_name || nameInput.trim())
    setSelectedLeadId(match?.lead_id || null)
    setSelectedPhone(match?.student_phone || '')
    setSuggestions([])
    setStep('code')
  }

  const submit = async () => {
    if (code.trim().length < 4) { setError('Please enter the full class code.'); return }
    setSubmitting(true); setError('')

    try {
      const res = await fetch('/api/attendance/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, student_name_input: selectedName, code: code.trim(), mode }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult(data)
        // Resolve lead_id from enrolments if not already set
        let leadId = selectedLeadId
        let leadPhone = selectedPhone
        if (!leadId) {
          const match = enrolments.find(e =>
            e.student_name.toLowerCase().includes(selectedName.toLowerCase()) ||
            selectedName.toLowerCase().includes(e.student_name.toLowerCase())
          )
          leadId = match?.lead_id || null
          leadPhone = match?.student_phone || ''
          setSelectedLeadId(leadId)
          setSelectedPhone(leadPhone)
        }
        // Check for outstanding fee
        if (leadId) {
          const { data: fee } = await sb.from('school_fee_invoices')
            .select('*')
            .eq('lead_id', leadId)
            .neq('status', 'paid')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (fee && Number(fee.balance || 0) > 0) {
            setFeeRecord({ ...fee, phone: fee.phone || leadPhone })
            setStep('fee')
          } else {
            setStep('success')
          }
        } else {
          setStep('success')
        }
      } else {
        setError(data.error || 'Something went wrong.')
        setSubmitting(false)
      }
    } catch (e) { setError('Network error. Please try again.'); setSubmitting(false) }
  }

  // ── Payment helpers ───────────────────────────────────────────────────────
  const netFee    = feeRecord ? Number(feeRecord.total_fee || 0) - Number(feeRecord.scholarship_amount || 0) - Number(feeRecord.discount_amount || 0) : 0
  const balance   = feeRecord ? Math.max(0, netFee - Number(feeRecord.amount_paid || 0)) : 0

  const payOnline = async () => {
    if (!window.PaystackPop) { await loadPaystack() }
    if (!window.PaystackPop) { alert('Payment service unavailable. Please try cash or contact the front desk.'); return }
    if (!PAYSTACK_PK) { alert('Online payment is not configured. Please pay at the front desk.'); return }

    setPayLoading(true)
    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PK,
      email: `${(selectedName || 'student').replace(/\s/g, '').toLowerCase()}@student.cce.edu.gh`,
      amount: Math.round(balance * 100),
      currency: 'GHS',
      ref: `CCE-FEE-${Date.now()}`,
      metadata: {
        lead_id: feeRecord.lead_id,
        registration_id: feeRecord.registration_id || null,
        invoice_id: feeRecord.id,
        type: 'school_fee',
        student_name: selectedName,
      },
      callback: (response) => {
        const receiptNo = `CCE-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${response.reference.slice(-4).toUpperCase()}`
        setPaymentData({
          receipt_no: receiptNo,
          reference: response.reference,
          amount: balance,
          total_paid: Number(feeRecord.amount_paid || 0) + balance,
          balance: 0,
          method: 'MoMo / Card (Online)',
          student_name: selectedName,
          course: feeRecord.course || session?.cohort?.course_name || '—',
          paid_at: new Date().toISOString(),
        })
        setPayLoading(false)
        setStep('receipt')
      },
      onClose: () => setPayLoading(false),
    })
    handler.openIframe()
  }

  const requestCash = async () => {
    setCashLoading(true)
    try {
      const res = await fetch('/api/fees/pending-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: feeRecord.id,
          lead_id: feeRecord.lead_id,
          student_name: selectedName,
          amount: balance,
          course: feeRecord.course || session?.cohort?.course_name,
        }),
      })
      const data = await res.json()
      if (data.ok) { setStep('cash_pending') }
      else { alert('Could not send request. Please inform the front desk directly.') }
    } catch (e) { alert('Network error. Please inform the front desk directly.') }
    setCashLoading(false)
  }

  const sendWAReceipt = () => {
    if (!paymentData) return
    const phone = feeRecord?.phone || selectedPhone
    const msg = `🧾 *Payment Receipt — Cambridge Center of Excellence*\n\nDear *${paymentData.student_name}*,\n\nYour payment has been confirmed ✅\n\n*Receipt No:* ${paymentData.receipt_no}\n*Course:* ${paymentData.course}\n*Method:* ${paymentData.method}\n*Amount Paid:* ${fmtCurrency(paymentData.amount)}\n*Balance:* ${fmtCurrency(paymentData.balance)}\n*Date:* ${fmtDate(paymentData.paid_at)}\n\nThank you for choosing Cambridge Center of Excellence! 🎓\n_Accounts Office_`

    if (phone) {
      const clean = phone.replace(/\s/g, '').replace(/^0/, '233').replace(/^\+/, '')
      window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank')
    } else {
      navigator.clipboard.writeText(msg).then(() => alert('Receipt copied to clipboard!'))
    }
  }

  // ── Screen building blocks ────────────────────────────────────────────────
  const Header = () => (
    <div className="text-center mb-8">
      <div className="w-14 h-14 bg-blue-700 rounded-2xl flex items-center justify-center text-2xl font-black text-white mx-auto mb-4">C</div>
      <h1 className="text-lg font-black text-slate-900">Cambridge Center of Excellence</h1>
      {session && <p className="text-sm text-slate-500 mt-1">{session.cohort?.course_name}</p>}
      {session && <p className="text-xs text-slate-400 mt-0.5">{session.cohort?.class_day} · {session.cohort?.class_time}</p>}
    </div>
  )

  // ── Render screens ────────────────────────────────────────────────────────
  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"/>
    </div>
  )

  if (step === 'closed') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Attendance Closed</h2>
        <p className="text-sm text-slate-500">Attendance sign-in is not currently open for this session. Contact your instructor.</p>
        {session && <p className="text-xs text-slate-400 mt-3">{session.cohort?.course_name}</p>}
      </div>
    </div>
  )

  if (step === 'error') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Invalid Link</h2>
        <p className="text-sm text-slate-500">This attendance link is not valid. Contact Cambridge Center of Excellence for help.</p>
      </div>
    </div>
  )

  // ── Fee Payment Screen ─────────────────────────────────────────────────────
  if (step === 'fee') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <Header/>
        <div className="space-y-5">
          <div className="text-center">
            <h2 className="text-base font-bold text-slate-900">Your Course Fees</h2>
            <p className="text-xs text-slate-400 mt-0.5">Hi {selectedName.split(' ')[0]}! Here's your current fee summary.</p>
          </div>

          {/* Fee breakdown */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Total Course Fee</span>
              <span className="font-semibold">{fmtCurrency(feeRecord.total_fee)}</span>
            </div>
            {Number(feeRecord.scholarship_amount) > 0 && (
              <div className="flex justify-between text-purple-700">
                <span>Scholarship Reduction</span>
                <span className="font-semibold">−{fmtCurrency(feeRecord.scholarship_amount)}</span>
              </div>
            )}
            {Number(feeRecord.discount_amount) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span className="font-semibold">−{fmtCurrency(feeRecord.discount_amount)}</span>
              </div>
            )}
            {(Number(feeRecord.scholarship_amount) > 0 || Number(feeRecord.discount_amount) > 0) && (
              <div className="flex justify-between text-slate-700 border-t border-slate-200 pt-2">
                <span>Net Fee</span>
                <span className="font-semibold">{fmtCurrency(netFee)}</span>
              </div>
            )}
            {Number(feeRecord.amount_paid) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Already Paid</span>
                <span className="font-semibold">−{fmtCurrency(feeRecord.amount_paid)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-900 border-t border-slate-300 pt-2.5">
              <span className="font-bold text-base">Balance Due</span>
              <span className="font-black text-blue-700 text-base">{fmtCurrency(balance)}</span>
            </div>
          </div>

          <p className="text-center text-xs text-slate-500 font-medium">How would you like to pay?</p>

          {/* Payment options */}
          <div className="space-y-2.5">
            <button
              onClick={payOnline}
              disabled={payLoading}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-blue-600 bg-blue-50 hover:bg-blue-100 transition press disabled:opacity-60"
            >
              <span className="text-2xl">📱</span>
              <div className="text-left flex-1">
                <div className="text-sm font-bold text-blue-800">Pay with MoMo / Card</div>
                <div className="text-[11px] text-blue-600">Instant confirmation · Secure via Paystack</div>
              </div>
              {payLoading && <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin shrink-0"/>}
            </button>

            <button
              onClick={requestCash}
              disabled={cashLoading}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition press disabled:opacity-60"
            >
              <span className="text-2xl">🏦</span>
              <div className="text-left flex-1">
                <div className="text-sm font-bold text-slate-800">Pay Cash at Front Desk</div>
                <div className="text-[11px] text-slate-500">Finance team will be notified to receive you</div>
              </div>
              {cashLoading && <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin shrink-0"/>}
            </button>
          </div>

          <button onClick={() => setStep('success')} className="w-full text-xs text-slate-300 hover:text-slate-500 transition py-1">
            Skip for now →
          </button>
        </div>
      </div>
    </div>
  )

  // ── Cash Pending Screen ────────────────────────────────────────────────────
  if (step === 'cash_pending') return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">🏦</div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Cash Payment Selected</h2>
        <p className="text-sm text-slate-600 mb-4">
          Your payment request has been received, <strong>{selectedName.split(' ')[0]}</strong>!
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-1">Amount to Pay</div>
          <div className="text-2xl font-black text-amber-900">{fmtCurrency(balance)}</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 text-left space-y-2 mb-5">
          <div className="font-semibold text-slate-800">Please proceed to the front desk 👉</div>
          <div className="text-xs text-slate-500">The finance team has been notified and will be expecting you. Please mention your name and course when you arrive.</div>
        </div>
        <button onClick={() => setStep('success')} className="btn btn-primary w-full">
          Continue to Class ✓
        </button>
      </div>
    </div>
  )

  // ── Receipt Screen ─────────────────────────────────────────────────────────
  if (step === 'receipt' && paymentData) return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">✅</div>
        <h2 className="text-xl font-black text-slate-900 mb-1">Payment Confirmed!</h2>
        <p className="text-sm text-slate-500 mb-5">Your attendance and payment have been recorded.</p>

        <div className="bg-slate-50 rounded-xl p-4 text-sm text-left space-y-2 mb-5">
          <div className="flex justify-between"><span className="text-slate-500">Receipt No.</span><span className="font-bold text-slate-900 font-mono">{paymentData.receipt_no}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Course</span><span className="font-semibold text-slate-700">{paymentData.course}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Amount Paid</span><span className="font-bold text-blue-700">{fmtCurrency(paymentData.amount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className={`font-bold ${paymentData.balance <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{fmtCurrency(paymentData.balance)}</span></div>
          {paymentData.balance <= 0 && <div className="text-center text-emerald-600 font-bold text-xs bg-emerald-50 rounded-lg py-1.5 mt-2">🎉 Fully Paid — Thank you!</div>}
        </div>

        <div className="space-y-2">
          <button onClick={sendWAReceipt}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold press transition">
            <span>📱</span> Send Receipt via WhatsApp
          </button>
          <button onClick={() => openPrintReceipt(paymentData)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-bold press transition">
            <span>🖨️</span> Print / Save PDF
          </button>
          <button onClick={() => setStep('success')}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-600 transition">
            Continue to class →
          </button>
        </div>
      </div>
    </div>
  )

  // ── Success Screen ─────────────────────────────────────────────────────────
  if (step === 'success') return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">✅</div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Signed In!</h2>
        <p className="text-slate-600 text-sm mb-4">
          Welcome, <strong>{result?.student_name}</strong>!<br/>Your attendance has been recorded.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
          <div className="flex justify-between"><span>Course</span><span className="font-semibold">{result?.course}</span></div>
          <div className="flex justify-between"><span>Mode</span><span className="font-semibold capitalize">{mode}</span></div>
          <div className="flex justify-between"><span>Time</span><span className="font-semibold">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>
        <p className="text-xs text-slate-400 mt-4">You're all set. Enjoy your class! 🎓</p>
      </div>
    </div>
  )

  // ── Sign-in form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <Header/>

        {/* Step indicator: name → code */}
        <div className="flex items-center gap-2 mb-6">
          {['name','code'].map((s, i) => (
            <div key={s} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
              {i > 0 && <div className={`flex-1 h-0.5 mx-2 ${step === 'code' ? 'bg-blue-400' : 'bg-slate-200'}`}/>}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step === s || (step === 'code' && s === 'name') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {step === 'code' && s === 'name' ? '✓' : i + 1}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 'name' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1">Type your name</h2>
              <p className="text-xs text-slate-400 mb-3">Start typing — your name will appear below if you're enrolled.</p>
              <input
                ref={nameRef}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !suggestions.length && handleNameNext()}
                placeholder="e.g. Kwame Asante"
                className="inp text-base"
                autoComplete="off"
              />
            </div>
            {suggestions.length > 0 && (
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select your name</div>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => pickName(s.student_name, s.mode, s.lead_id, s.student_phone)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition text-left border-t border-slate-100">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {s.student_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.student_name}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{s.mode || 'in-person'}</div>
                    </div>
                    <svg className="ml-auto text-blue-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
            )}
            {nameInput.length >= 2 && suggestions.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Name not found in enrolment list. You can still continue — your entry will be flagged for review.
              </div>
            )}
            <button onClick={handleNameNext} disabled={!nameInput.trim()} className="btn btn-primary w-full press">
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Mode + Code */}
        {step === 'code' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Hello, {selectedName.split(' ')[0]}! 👋</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Select your attendance mode, then enter the code shown on the board or screen.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['in-person','🏢','In-Person'],['online','💻','Online']].map(([val, icon, label]) => (
                <button key={val} onClick={() => setMode(val)}
                  className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition font-medium text-sm ${mode === val ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                  <span className="text-xl">{icon}</span>{label}
                </button>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Class Code (from the {mode === 'online' ? 'screen' : 'board'})
              </label>
              <input
                id="code-input"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="e.g. X7K2MN"
                maxLength={6}
                className="inp text-center text-2xl font-black tracking-[0.3em] uppercase"
                autoComplete="off"
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setStep('name'); setCode(''); setError('') }} className="btn btn-ghost flex-shrink-0">← Back</button>
              <button onClick={submit} disabled={!code.trim() || submitting} className="btn btn-primary flex-1 press">
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Signing in…</>
                ) : 'Sign In ✓'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
