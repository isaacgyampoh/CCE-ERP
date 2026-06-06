/**
 * CCE ERP — Facebook Lead Ads Webhook
 * Deploy to Vercel: this file is auto-detected as /api/webhook/facebook
 *
 * Setup in Facebook Events Manager:
 *   URL: https://your-app.vercel.app/api/webhook/facebook
 *   Verify Token: value stored in fb_config.verify_token (default: cce_webhook_2026)
 *   Subscribe to: leadgen
 */

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // use service role key in Vercel env vars
)

export default async function handler(req, res) {
  // ── Webhook Verification (GET) ──────────────────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query

    const { data: config } = await sb.from('fb_config').select('verify_token').limit(1).single()
    const verifyToken = config?.verify_token || 'cce_webhook_2026'

    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge)
    }
    return res.status(403).json({ error: 'Verification failed' })
  }

  // ── Lead Event (POST) ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { object, entry } = req.body

    if (object !== 'page') return res.status(200).json({ ok: true })

    for (const e of entry || []) {
      for (const change of e.changes || []) {
        if (change.field !== 'leadgen') continue

        const { leadgen_id, page_id, form_id } = change.value

        try {
          // Get FB config
          const { data: config } = await sb.from('fb_config').select('*').limit(1).single()
          if (!config?.page_access_token) continue

          // Fetch lead data from Graph API
          const graphRes = await fetch(
            `https://graph.facebook.com/v19.0/${leadgen_id}?access_token=${config.page_access_token}`
          )
          const leadData = await graphRes.json()

          if (!leadData.field_data) continue

          // Parse fields
          const fields = {}
          for (const f of leadData.field_data) {
            fields[f.name.toLowerCase()] = f.values?.[0] || ''
          }

          const name = fields['full_name'] || fields['name'] || `FB Lead ${leadgen_id.slice(-4)}`
          const email = fields['email'] || ''
          const phone = fields['phone_number'] || fields['phone'] || ''
          const course = fields['course'] || fields['course_interest'] || ''

          // Check for duplicate
          const { data: existing } = await sb.from('leads')
            .select('id').eq('fb_lead_id', leadgen_id).limit(1)

          if (existing?.length) continue // already imported

          // Insert lead
          const { data: newLead } = await sb.from('leads').insert({
            name,
            email,
            phone,
            source: 'facebook',
            source_campaign: form_id || '',
            fb_lead_id: leadgen_id,
            course_interest: course,
            status: 'new',
          }).select().single()

          if (!newLead) continue

          // Notify all PMs
          const { data: pms } = await sb.from('staff')
            .select('id').in('role', ['pm', 'admin']).eq('is_active', true)

          for (const pm of pms || []) {
            await sb.from('notifications').insert({
              staff_id: pm.id,
              title: '🔵 New Facebook Lead',
              message: `${name} submitted your Facebook form${course ? ` for ${course}` : ''}`,
              type: 'new_lead',
              lead_id: newLead.id,
            })
          }
        } catch (err) {
          console.error('Error processing FB lead:', err)
        }
      }
    }

    return res.status(200).json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
