import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON, PAYSTACK_PK } from '@/lib/constants'
import { loadPaystack, fmtCurrency } from '@/lib/helpers'

const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

const REG_FEE = 150 // GHS — pull from courses table if per-course fees needed

export default function RegisterPage() {
  const params = new URLSearchParams(window.location.search)
  const marketerId = params.get('m')
  const leadId = params.get('l')

  const [step, setStep] = useState('loading') // loading | form | paying | success | error
  const [lead, setLead] = useState(null)
  const [marketer, setMarketer] = useState(null)
  const [course, setCourse] = useState(null)
  const [fee, setFee] = useState(REG_FEE)
  const [errMsg, setErrMsg] = useState('')

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', dob: '', gender: '',
    address: '', city: '', nationality: 'Ghanaian',
    course_interest: '', mode_preference: '', scholarship_interest: false,
    emergency_name: '', emergency_phone: '', emergency_relation: '',
    how_heard: '', education_level: '', employment_status: '',
    goals: '',
  })

  useEffect(() => {
    if (!marketerId || !leadId) { setStep('error'); setErrMsg('Invalid registration link.'); return }
    init()
  }, [])

  const init = async () => {
    const [{ data: lead }, { data: mktr }] = await Promise.all([
      sb.from('leads').select('*, assignee:assigned_to(id,name,phone)').eq('id', leadId).single(),
      sb.from('staff').select('*').eq('id', marketerId).single(),
    ])

    if (!lead || !mktr) { setStep('error'); setErrMsg('Invalid or expired registration link.'); return }
    if (lead.assigned_to !== marketerId) { setStep('error'); setErrMsg('This link is not valid for this lead.'); return }

    setLead(lead)
    setMarketer(mktr)

    // Pre-fill known data
    setForm(f => ({
      ...f,
      full_name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      course_interest: lead.course_interest || '',
      mode_preference: lead.mode_preference || '',
      scholarship_interest: lead.scholarship_interest || false,
      how_heard: lead.source || '',
    }))

    // Get fee from course
    if (lead.course_interest) {
      const { data: c } = await sb.from('courses').select('*').ilike('name', lead.course_interest).limit(1).single()
      if (c) { setCourse(c); setFee(c.reg_fee || REG_FEE) }
    }

    if (lead.status === 'registered') { setStep('already_registered'); return }

    await loadPaystack()
    setStep('form')
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validateForm = () => {
    if (!form.full_name.trim()) return 'Full name is required'
    if (!form.phone.trim()) return 'Phone number is required'
    if (!form.email.trim()) return 'Email address is required'
    if (!form.course_interest.trim()) return 'Please select a course'
    return null
  }

  const handlePay = () => {
    const err = validateForm()
    if (err) { setErrMsg(err); return }
    setErrMsg('')
    setStep('paying')

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PK,
      email: form.email,
      amount: fee * 100, // pesewas
      currency: 'GHS',
      ref: `CCE-${leadId.slice(0,8)}-${Date.now()}`,
      metadata: {
        lead_id: leadId,
        marketer_id: marketerId,
        marketer_name: marketer?.name,
        custom_fields: [
          { display_name: 'Student Name', variable_name: 'student_name', value: form.full_name },
          { display_name: 'Course', variable_name: 'course', value: form.course_interest },
          { display_name: 'Marketer', variable_name: 'marketer', value: marketer?.name },
        ]
      },
      callback: (response) => onPaymentSuccess(response),
      onClose: () => setStep('form'),
    })
    handler.openIframe()
  }

  const onPaymentSuccess = async (response) => {
    setStep('loading')
    try {
      // 1. Save full registration form + payment
      await sb.from('registrations').insert({
        lead_id: leadId,
        marketer_id: marketerId,
        marketer_name: marketer?.name,
        full_name: form.full_name,
        phone: form.phone,
        email: form.email,
        dob: form.dob || null,
        gender: form.gender,
        address: form.address,
        city: form.city,
        nationality: form.nationality,
        course_interest: form.course_interest,
        mode_preference: form.mode_preference,
        scholarship_interest: form.scholarship_interest,
        emergency_name: form.emergency_name,
        emergency_phone: form.emergency_phone,
        emergency_relation: form.emergency_relation,
        how_heard: form.how_heard,
        education_level: form.education_level,
        employment_status: form.employment_status,
        goals: form.goals,
        paystack_ref: response.reference,
        amount_paid: fee,
        paid_at: new Date().toISOString(),
        status: 'paid',
      })

      // 2. Record payment
      await sb.from('payments').insert({
        lead_id: leadId,
        marketer_id: marketerId,
        amount: fee,
        reference: response.reference,
        status: 'success',
        paid_at: new Date().toISOString(),
      })

      // 3. Update lead status → registered
      await sb.from('leads').update({
        status: 'registered',
        reg_fee_paid: fee,
        reg_paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', leadId)

      // 4. Log activity
      await sb.from('lead_comments').insert({
        lead_id: leadId,
        staff_id: marketerId,
        staff_name: marketer?.name,
        comment: `✅ Student completed registration and paid GH₵${fee} registration fee. Ref: ${response.reference}`,
        status_change: 'registered',
      })

      // 5. Notify Admission + Finance staff
      const { data: admissionStaff } = await sb.from('staff')
        .select('id').in('role', ['admission', 'admin', 'finance']).eq('is_active', true)

      for (const s of admissionStaff || []) {
        await sb.from('notifications').insert({
          staff_id: s.id,
          title: '🎓 New Registration & Payment',
          message: `${form.full_name} has registered and paid GH₵${fee}. Course: ${form.course_interest}. Referred by ${marketer?.name}.`,
          type: 'registration',
          lead_id: leadId,
        })
      }

      // 6. Sync to Google Sheets (if configured)
      try {
        await syncToSheets({ ...form, reference: response.reference, amount: fee, marketer: marketer?.name, date: new Date().toISOString() })
      } catch (e) { /* Sheets sync failure shouldn't block success */ }

      setStep('success')
    } catch (e) {
      console.error(e)
      setStep('error')
      setErrMsg('Payment was received but there was an error saving your details. Please contact us with reference: ' + response.reference)
    }
  }

  const syncToSheets = async (data) => {
    const webhookUrl = import.meta.env.VITE_SHEETS_WEBHOOK_URL
    if (!webhookUrl) return
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"/>
    </div>
  )

  if (step === 'success') return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🎓</div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">You're Enrolled!</h1>
        <p className="text-slate-600 text-sm mb-4">
          Welcome to Cambridge Center of Excellence, <strong>{form.full_name}</strong>!<br/>
          Your registration is confirmed and your payment has been received.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-left text-sm mb-6 space-y-2">
          <div className="flex justify-between"><span className="text-slate-500">Course</span><span className="font-semibold">{form.course_interest}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Amount Paid</span><span className="font-semibold text-emerald-600">{fmtCurrency(fee)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Your Consultant</span><span className="font-semibold">{marketer?.name}</span></div>
        </div>
        <p className="text-xs text-slate-400">Our admissions team will reach out shortly with your enrollment documents, class schedule, and next steps. 🚀</p>
      </div>
    </div>
  )

  if (step === 'already_registered') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Already Registered</h1>
        <p className="text-sm text-slate-500">You're already enrolled. Contact your consultant {marketer?.name} if you need help.</p>
      </div>
    </div>
  )

  if (step === 'error') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-slate-500">{errMsg || 'Invalid registration link.'}</p>
        <p className="text-xs text-slate-400 mt-3">Contact Cambridge Center of Excellence for assistance.</p>
      </div>
    </div>
  )

  const Input = ({ label, k, type='text', placeholder='', required=false }) => (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={form[k] || ''} onChange={e => set(k, e.target.value)}
        placeholder={placeholder} className="inp"/>
    </div>
  )

  const Select = ({ label, k, options, required=false }) => (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select value={form[k] || ''} onChange={e => set(k, e.target.value)} className="inp">
        <option value="">Select…</option>
        {options.map(o => <option key={o.v || o} value={o.v || o}>{o.l || o}</option>)}
      </select>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-6 py-8 text-center">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl font-black mx-auto mb-3">C</div>
        <h1 className="text-2xl font-black">Cambridge Center of Excellence</h1>
        <p className="text-blue-200 text-sm mt-1">Student Registration Form</p>
        {marketer && (
          <div className="mt-3 inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs">
            <div className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-bold">
              {marketer.name.charAt(0)}
            </div>
            Your consultant: <strong>{marketer.name}</strong>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 pb-24">

        {errMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{errMsg}</div>
        )}

        {/* Section 1: Personal Info */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-blue-600 rounded-full text-white text-xs font-bold flex items-center justify-center">1</div>
            <h2 className="font-bold text-slate-900">Personal Information</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Input label="Full Name" k="full_name" placeholder="As on ID / Birth Certificate" required/></div>
            <Input label="Phone Number" k="phone" type="tel" placeholder="0244 000 000" required/>
            <Input label="Email Address" k="email" type="email" placeholder="you@example.com" required/>
            <Input label="Date of Birth" k="dob" type="date"/>
            <Select label="Gender" k="gender" options={['Male','Female','Prefer not to say']}/>
            <div className="sm:col-span-2"><Input label="Home Address" k="address" placeholder="Street, Area"/></div>
            <Input label="City / Town" k="city" placeholder="e.g. Accra"/>
            <Input label="Nationality" k="nationality"/>
          </div>
        </div>

        {/* Section 2: Course */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-blue-600 rounded-full text-white text-xs font-bold flex items-center justify-center">2</div>
            <h2 className="font-bold text-slate-900">Course Details</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Input label="Course of Interest" k="course_interest" placeholder="e.g. Project Management" required/></div>
            <Select label="Study Mode" k="mode_preference" options={[{v:'in-person',l:'In-Person'},{v:'online',l:'Online'},{v:'hybrid',l:'Hybrid'}]}/>
            <Select label="Education Level" k="education_level" options={['WASSCE / SSCE','Diploma','HND','Bachelor\'s Degree','Master\'s Degree','PhD','Other']}/>
            <Select label="Employment Status" k="employment_status" options={['Employed (Full-time)','Employed (Part-time)','Self-employed','Unemployed','Student']}/>
            <Select label="How did you hear about us?" k="how_heard" options={[{v:'facebook',l:'Facebook'},{v:'linkedin',l:'LinkedIn'},{v:'referral',l:'Friend / Referral'},{v:'google',l:'Google'},{v:'walk-in',l:'Walk-in'},{v:'other',l:'Other'}]}/>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Your Goals (optional)</label>
            <textarea value={form.goals} onChange={e => set('goals', e.target.value)}
              placeholder="What do you hope to achieve from this course?" className="inp" rows="3"/>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.scholarship_interest} onChange={e => set('scholarship_interest', e.target.checked)} className="w-4 h-4 accent-blue-600"/>
            <span className="text-sm text-slate-700">I would like to be considered for a scholarship</span>
          </label>
        </div>

        {/* Section 3: Emergency Contact */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-blue-600 rounded-full text-white text-xs font-bold flex items-center justify-center">3</div>
            <h2 className="font-bold text-slate-900">Emergency Contact</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Contact Name" k="emergency_name" placeholder="Full name"/>
            <Input label="Contact Phone" k="emergency_phone" type="tel" placeholder="0244 000 000"/>
            <Input label="Relationship" k="emergency_relation" placeholder="e.g. Spouse, Parent, Sibling"/>
          </div>
        </div>

        {/* Payment summary + CTA */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 rounded-2xl p-5 text-white">
          <h2 className="font-bold text-lg mb-3">Registration Fee</h2>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-blue-200 text-sm">One-time registration fee</div>
              <div className="text-3xl font-black mt-1">{fmtCurrency(fee)}</div>
              {course && <div className="text-blue-200 text-xs mt-1">{course.name}</div>}
            </div>
            <div className="text-right text-xs text-blue-200">
              <div>Secure payment</div>
              <div>via Paystack 🔒</div>
            </div>
          </div>
          <button onClick={handlePay} disabled={step === 'paying'}
            className="w-full bg-white text-blue-700 font-bold rounded-xl py-3.5 text-sm hover:bg-blue-50 transition press disabled:opacity-60 flex items-center justify-center gap-2">
            {step === 'paying' ? (
              <><div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/> Processing…</>
            ) : (
              <>💳 Pay {fmtCurrency(fee)} &amp; Complete Registration</>
            )}
          </button>
          <p className="text-[10px] text-blue-200 text-center mt-2">
            By registering, you agree to CCE's terms & conditions. Payment secured by Paystack.
          </p>
        </div>
      </div>
    </div>
  )
}
