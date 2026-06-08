export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://PLACEHOLDER.supabase.co'
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const STATUS = {
  new:                  { label: 'New',               cls: 'bg-sky-50 text-sky-700',        dot: '#0ea5e9' },
  assigned:             { label: 'Assigned',           cls: 'bg-violet-50 text-violet-700',  dot: '#7c3aed' },
  contacted:            { label: 'Contacted',          cls: 'bg-cyan-50 text-cyan-700',      dot: '#06b6d4' },
  follow_up:            { label: 'Follow Up',          cls: 'bg-amber-50 text-amber-700',    dot: '#d97706' },
  pending_registration: { label: 'Pending Reg.',       cls: 'bg-orange-50 text-orange-700',  dot: '#ea580c' },
  registered:           { label: 'Registered',         cls: 'bg-emerald-50 text-emerald-700',dot: '#059669' },
  next_session:         { label: 'Next Session',       cls: 'bg-indigo-50 text-indigo-700',  dot: '#4f46e5' },
  not_qualified:        { label: 'Not Qualified',      cls: 'bg-red-50 text-red-600',        dot: '#dc2626' },
  inquiry:              { label: 'Inquiry',            cls: 'bg-slate-100 text-slate-500',   dot: '#94a3b8' },
}

export const SOURCES = ['facebook', 'linkedin', 'google_ads', 'instagram', 'website', 'manual', 'referral', 'walk-in', 'personal']
export const ROLES   = ['marketer', 'pm', 'admin', 'finance', 'admission', 'receptionist']

export const PAYSTACK_PK = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''

export const WA_ASSIGN_MSG = (leadName, marketerName, course = '') =>
  `Hi ${leadName.split(' ')[0]}! 👋\n\nThis is *Cambridge Center of Excellence*.\n\nThank you for your interest${course ? ` in *${course}*` : ' in our programs'}. 🎓\n\n*${marketerName.split(' ')[0]}* will be calling you shortly to explain more and walk you through the enrollment process.\n\nWe look forward to speaking with you!\n\n— Cambridge Center of Excellence`

export const WA_REG_MSG = (leadName, regLink, marketerName) =>
  `Hello ${leadName}! 🎓\n\nGreat news — you're one step away from joining Cambridge Center of Excellence!\n\nPlease click the link below to complete your registration form and pay your registration fee:\n\n👉 ${regLink}\n\nOnce payment is confirmed, our Admissions team will reach out with your enrollment documents and course details.\n\nAny questions? I'm right here!\n\n${marketerName}\nCambridge Center of Excellence`

// ─── Additional roles ─────────────────────────────────────────────────────────
export const ALL_ROLES = ['marketer','pm','admin','finance','admission','receptionist','instructor']

// ─── SMS / WhatsApp message templates ────────────────────────────────────────
export const MSG_RSVP = (name, courseName, startDate, rsvpLink) =>
`Hello ${name}! 👋

Your class for *${courseName}* is starting on *${startDate}*. 🎓

Please confirm your attendance by clicking the link below:
👉 ${rsvpLink}

Let us know if you'll be there — your spot depends on it!

Cambridge Center of Excellence`

export const MSG_REMINDER_1MONTH = (name, courseName, startDate) =>
`Hi ${name}! 📅

Just a heads-up — your *${courseName}* class starts in *1 month* on ${startDate}.

Start preparing and get ready for an amazing learning journey! 🚀

Cambridge Center of Excellence`

export const MSG_REMINDER_1WEEK = (name, courseName, classDay, classTime, location) =>
`Hi ${name}! ⏰

Your *${courseName}* class is *1 week away!*

📅 Day: ${classDay}
🕘 Time: ${classTime}
📍 ${location || 'Details to follow'}

Stay ready — we'll send your class details soon.

Cambridge Center of Excellence`

export const MSG_REMINDER_2DAY = (name, courseName, classDay, classTime, location) =>
`Hi ${name}! 🔔

*2 days to your class!*

Your *${courseName}* session is coming up on *${classDay}* at *${classTime}*.
📍 ${location || 'Cambridge Center of Excellence'}

We're excited to see you! Reply YES to confirm you'll be there.

Cambridge Center of Excellence`

export const MSG_ATTENDANCE_LINK = (name, courseName, attendanceLink) =>
`📋 *Class Attendance — ${courseName}*

Hello ${name}! Your class has started. 🎓

Click the link below to sign in:
👉 ${attendanceLink}

You'll need the *class code* written on the board/screen to complete sign-in.

See you inside! 🚀`

export const LEAD_TAGS = [
  { name: 'hot',           label: 'Hot',            color: 'bg-red-100 text-red-700' },
  { name: 'vip',           label: 'VIP',            color: 'bg-purple-100 text-purple-700' },
  { name: 'scholarship',   label: 'Scholarship',    color: 'bg-blue-100 text-blue-700' },
  { name: 'callback',      label: 'Needs Callback', color: 'bg-amber-100 text-amber-700' },
  { name: 'high_intent',   label: 'High Intent',    color: 'bg-emerald-100 text-emerald-700' },
  { name: 'corporate',     label: 'Corporate',      color: 'bg-indigo-100 text-indigo-700' },
  { name: 'international', label: 'International',  color: 'bg-cyan-100 text-cyan-700' },
  { name: 'referral',      label: 'Referral',       color: 'bg-violet-100 text-violet-700' },
]

export const MSG_RECEIPT = (name, amount, paymentType, receiptNo, date) =>
`🧾 *Payment Receipt — Cambridge Center of Excellence*

Dear ${name},

Your payment has been confirmed ✅

*Receipt No:* ${receiptNo}
*Type:* ${paymentType}
*Amount:* GH₵${amount}
*Date:* ${date}

Your official receipt has been sent to your email. Keep this for your records.

Thank you for choosing CCE! 🎓
_Cambridge Center of Excellence_`
