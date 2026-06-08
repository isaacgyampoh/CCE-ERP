export const formatPhone = (p) => {
  if (!p) return ''
  const clean = p.replace(/\s/g, '').replace(/^0/, '233').replace(/^\+/, '')
  return clean
}

export const timeAgo = (ts) => {
  if (!ts) return '—'
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fmtCurrency = (n) =>
  `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`

export const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const fmtDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

// Generate a unique marketer registration link
export const marketerRegLink = (marketerId, leadId) => {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/register?m=${marketerId}&l=${leadId}`
}

// Arkesel SMS — key stored in VITE_ARKESEL_API_KEY env var
export const sendSMS = async (phone, message) => {
  if (!phone) return
  const key = import.meta.env.VITE_ARKESEL_API_KEY
  if (!key) { console.warn('VITE_ARKESEL_API_KEY not set'); return null }
  const recipient = formatPhone(phone)
  try {
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'Cambridge', message, recipients: [recipient] }),
    })
    return res.json()
  } catch (e) { console.error('SMS error:', e); return null }
}

// Lead score 1–100: phone (+20), email (+10), scholarship (+5), status progression, time decay
export const leadScore = (lead) => {
  let score = 0
  if (lead.phone) score += 20
  if (lead.email) score += 10
  if (lead.scholarship_interest) score += 5
  const sp = {
    new: 5, inquiry: 5, assigned: 10, contacted: 20,
    follow_up: 25, pending_registration: 35,
    registered: 55, next_session: 40, not_qualified: 0,
  }
  score += sp[lead.status] ?? 5
  const days = (Date.now() - new Date(lead.created_at)) / 86400000
  if (days > 60) score -= 10
  else if (days > 30) score -= 5
  return Math.max(1, Math.min(100, score))
}

// Load Paystack inline script once
let paystackLoaded = false
export const loadPaystack = () => new Promise((resolve) => {
  if (paystackLoaded || window.PaystackPop) { paystackLoaded = true; return resolve() }
  const s = document.createElement('script')
  s.src = 'https://js.paystack.co/v1/inline.js'
  s.onload = () => { paystackLoaded = true; resolve() }
  document.head.appendChild(s)
})
