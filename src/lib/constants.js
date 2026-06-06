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

export const SOURCES = ['facebook', 'linkedin', 'website', 'manual', 'referral', 'walk-in', 'personal']
export const ROLES   = ['marketer', 'pm', 'admin', 'finance', 'admission', 'receptionist']

export const PAYSTACK_PK = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || ''

export const WA_ASSIGN_MSG = (leadName, marketerName) =>
  `Hello ${leadName}! 👋\n\nThank you for your interest in Cambridge Center of Excellence.\n\nMy name is ${marketerName} and I'll be your dedicated admissions consultant. I'll be reaching out shortly to guide you through your enrollment journey.\n\nFeel free to reply anytime!\n\nBest regards,\n${marketerName}\nCambridge Center of Excellence 🎓`

export const WA_REG_MSG = (leadName, regLink, marketerName) =>
  `Hello ${leadName}! 🎓\n\nGreat news — you're one step away from joining Cambridge Center of Excellence!\n\nPlease click the link below to complete your registration form and pay your registration fee:\n\n👉 ${regLink}\n\nOnce payment is confirmed, our Admissions team will reach out with your enrollment documents and course details.\n\nAny questions? I'm right here!\n\n${marketerName}\nCambridge Center of Excellence`
