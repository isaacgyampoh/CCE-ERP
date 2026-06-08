import { useState, useEffect } from 'react'
import { Avatar, EmptyState, Spinner, Label } from '@/components/ui'
import { Icon } from '@/components/ui'
import { STATUS, SOURCES } from '@/lib/constants'
import { sendSMS, formatPhone, fmtDate } from '@/lib/helpers'

export default function BulkSMS({ leads, staff, sb, user }) {
  const [statusF,   setStatusF]   = useState('all')
  const [sourceF,   setSourceF]   = useState('all')
  const [marketerF, setMarketerF] = useState('all')
  const [message,   setMessage]   = useState('')
  const [sending,   setSending]   = useState(false)
  const [result,    setResult]    = useState(null)  // { sent, failed, total }
  const [campaigns, setCampaigns] = useState([])
  const [loadingH,  setLoadingH]  = useState(true)
  const [confirmed, setConfirmed] = useState(false)

  const marketers = staff.filter(s => s.role === 'marketer')

  useEffect(() => {
    sb.from('sms_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setCampaigns(data || []); setLoadingH(false) })
  }, [])

  // Leads matching current filters (must have a phone number)
  const recipients = leads.filter(l => {
    if (!l.phone) return false
    if (statusF   !== 'all' && l.status      !== statusF)   return false
    if (sourceF   !== 'all' && l.source      !== sourceF)   return false
    if (marketerF !== 'all' && l.assigned_to !== marketerF) return false
    return true
  })

  const sendBulk = async () => {
    if (!message.trim() || recipients.length === 0 || sending) return
    setSending(true)
    setResult(null)
    setConfirmed(false)

    // Log campaign first
    const { data: campaign } = await sb.from('sms_campaigns').insert({
      created_by:      user.id,
      message,
      recipient_count: recipients.length,
      status_filter:   statusF,
      source_filter:   sourceF,
      status:          'sending',
    }).select().single()

    let sent = 0, failed = 0

    for (const lead of recipients) {
      const phone = formatPhone(lead.phone)
      if (!phone) { failed++; continue }

      // Personalise: swap {name} placeholder
      const personalised = message.replace(/\{name\}/gi, lead.name.split(' ')[0])

      const r = await sendSMS(phone, personalised)
      if (r?.status === 'success' || r?.message) {
        sent++
        await sb.from('sms_log').insert({
          lead_id: lead.id, phone: lead.phone,
          message: personalised, type: 'campaign', status: 'sent',
        })
      } else {
        failed++
      }
    }

    // Update campaign record
    if (campaign?.id) {
      await sb.from('sms_campaigns').update({
        status: 'done', sent_count: sent, failed_count: failed,
      }).eq('id', campaign.id)
      setCampaigns(prev => [{ ...campaign, status: 'done', sent_count: sent, failed_count: failed }, ...prev])
    }

    setResult({ sent, failed, total: recipients.length })
    setSending(false)
  }

  const smsCount  = Math.ceil((message.length || 1) / 160)
  const charCount = message.length

  return (
    <div className="fade-up space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Bulk SMS Campaigns</h1>
        <p className="text-sm text-slate-400 mt-0.5">Send targeted SMS to filtered groups of leads via Arkesel</p>
      </div>

      {/* Compose card */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">New Campaign</h2>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Status</Label>
            <select value={statusF} onChange={e => { setStatusF(e.target.value); setConfirmed(false) }} className="inp h-9 text-xs">
              <option value="all">All Statuses</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Source</Label>
            <select value={sourceF} onChange={e => { setSourceF(e.target.value); setConfirmed(false) }} className="inp h-9 text-xs">
              <option value="all">All Sources</option>
              {SOURCES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
          <div>
            <Label>Marketer</Label>
            <select value={marketerF} onChange={e => { setMarketerF(e.target.value); setConfirmed(false) }} className="inp h-9 text-xs">
              <option value="all">All Marketers</option>
              {marketers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        {/* Recipients preview */}
        <div className={`rounded-xl p-3 border flex items-center justify-between ${recipients.length > 0 ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
          <div>
            <div className="text-sm font-bold text-slate-900">
              {recipients.length} recipient{recipients.length !== 1 ? 's' : ''} selected
            </div>
            <div className="text-[11px] text-slate-500">
              {leads.filter(l => !l.phone).length > 0
                ? `${leads.filter(l => !l.phone).length} lead(s) skipped — no phone`
                : 'All leads in this filter have phone numbers'}
            </div>
          </div>
          {recipients.length > 0 && (
            <div className="flex -space-x-2">
              {recipients.slice(0, 5).map(l => <Avatar key={l.id} name={l.name} size={28}/>)}
              {recipients.length > 5 && (
                <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-700">
                  +{recipients.length - 5}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Templates */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label>Message</Label>
            <div className="flex gap-2">
              {[
                ['Follow-up', `Hello {name}! Thank you for your interest in Cambridge Center of Excellence. Our admissions team will be in touch shortly. Cambridge`],
                ['Scholarship', `Hi {name}! Great news — Cambridge Center of Excellence offers scholarship opportunities for our professional courses. Reply or call us to learn more. Cambridge`],
                ['Class starting', `Hi {name}! Your class at Cambridge Center of Excellence is starting soon. Please check your registration and confirm your attendance. Cambridge`],
              ].map(([label, tpl]) => (
                <button key={label} onClick={() => setMessage(tpl)}
                  className="text-[10px] text-blue-600 font-medium hover:underline">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setConfirmed(false) }}
            placeholder="Type your SMS… Use {name} for first name personalisation."
            className="inp text-sm"
            rows={4}
            style={{ height: 'auto', resize: 'vertical' }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-400">{charCount} chars · {smsCount} SMS unit{smsCount !== 1 ? 's' : ''} per recipient</span>
            {charCount > 0 && recipients.length > 0 && (
              <span className="text-[10px] font-semibold text-slate-500">
                ~{smsCount * recipients.length} total SMS units
              </span>
            )}
          </div>
        </div>

        {/* Confirm checkbox */}
        {recipients.length > 0 && message.trim() && !result && (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              className="w-4 h-4 accent-blue-600"/>
            I confirm sending to {recipients.length} lead{recipients.length !== 1 ? 's' : ''} — this cannot be undone
          </label>
        )}

        {/* Result banner */}
        {result && (
          <div className={`rounded-xl p-4 border ${result.failed === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="text-sm font-bold text-slate-900 mb-1">Campaign sent!</div>
            <div className="text-xs text-slate-600">
              ✓ {result.sent} delivered &nbsp;·&nbsp; ✗ {result.failed} failed &nbsp;·&nbsp; {result.total} total
            </div>
          </div>
        )}

        <button
          onClick={sendBulk}
          disabled={!message.trim() || recipients.length === 0 || sending || !confirmed}
          className="btn btn-primary w-full press"
        >
          {sending ? (
            <><div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin"/> Sending…</>
          ) : (
            <>{Icon.send} Send to {recipients.length} lead{recipients.length !== 1 ? 's' : ''}</>
          )}
        </button>
      </div>

      {/* Campaign history */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Campaign History</h2>
          <span className="text-xs text-slate-400">{campaigns.length} campaigns</span>
        </div>
        {loadingH ? (
          <div className="py-10 flex justify-center"><Spinner size={20}/></div>
        ) : campaigns.length === 0 ? (
          <EmptyState icon="📱" title="No campaigns yet" sub="Campaigns will appear here after sending"/>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Message Preview</th>
                  <th>Recipients</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="cursor-default">
                    <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(c.created_at)}</td>
                    <td className="max-w-[220px]">
                      <div className="text-xs text-slate-700 truncate">{c.message}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 capitalize">
                        {c.status_filter !== 'all' && `Status: ${c.status_filter}`}
                        {c.source_filter !== 'all' && ` · Source: ${c.source_filter}`}
                      </div>
                    </td>
                    <td className="text-xs font-bold text-slate-700">{c.recipient_count}</td>
                    <td className="text-xs font-bold text-emerald-600">{c.sent_count ?? '—'}</td>
                    <td className="text-xs text-red-500">{c.failed_count ?? '—'}</td>
                    <td>
                      <span className={`badge ${c.status === 'done' ? 'bg-emerald-50 text-emerald-700' : c.status === 'sending' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
