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

// Arkesel SMS
const ARKESEL_KEY = 'VXliSENVQnpsYkhWYlNpZkNRZEc'
const SMS_SENDER = 'Cambridge'

export const sendSMS = async (phone, message) => {
  if (!phone) return
  const recipient = formatPhone(phone)
  try {
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': ARKESEL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: SMS_SENDER, message, recipients: [recipient] }),
    })
    const data = await res.json()
    console.log('SMS sent to', recipient, data)
    return data
  } catch (e) { console.error('SMS error:', e); return null }
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
