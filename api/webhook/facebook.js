import { sb, APP_URL } from '../_lib/config.js'
import { sendSMS } from '../_lib/notify.js'

async function autoSendDocuments(lead, triggerEvent) {
  try {
    const { data: docs } = await sb.from('documents')
      .select('*')
      .eq('trigger_event', triggerEvent)
      .eq('is_active', true)
    for (const doc of docs || []) {
      if (doc.course && lead.course_interest && !lead.course_interest.toLowerCase().includes(doc.course.toLowerCase())) continue
      fetch(`${APP_URL}/api/documents/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: doc.id,
          lead_id: lead.id,
          channels: ['email', 'whatsapp'],
          context: { name: lead.name, course: lead.course_interest },
        }),
      }).catch(e => console.error('Auto-doc send error:', e))
    }
  } catch (e) { console.error('autoSendDocuments error:', e) }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query

    const { data: config } = await sb.from('fb_config').select('verify_token').limit(1).single()
    const verifyToken = config?.verify_token || 'cce_webhook_2026'

    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge)
    }
    return res.status(403).json({ error: 'Verification failed' })
  }

  if (req.method === 'POST') {
    const { object, entry } = req.body

    if (object !== 'page') return res.status(200).json({ ok: true })

    for (const e of entry || []) {
      for (const change of e.changes || []) {
        if (change.field !== 'leadgen') continue

        const { leadgen_id, page_id, form_id } = change.value

        try {
          const { data: config } = await sb.from('fb_config').select('*').limit(1).single()
          if (!config?.page_access_token) continue

          const graphRes = await fetch(
            `https://graph.facebook.com/v19.0/${leadgen_id}?access_token=${config.page_access_token}`
          )
          const leadData = await graphRes.json()

          if (!leadData.field_data) continue

          const fields = {}
          for (const f of leadData.field_data) {
            fields[f.name.toLowerCase()] = f.values?.[0] || ''
          }

          const name   = fields['full_name'] || fields['name'] || `FB Lead ${leadgen_id.slice(-4)}`
          const email  = fields['email'] || ''
          const phone  = fields['phone_number'] || fields['phone'] || ''
          const course = fields['course'] || fields['course_interest'] || ''

          const { data: existing } = await sb.from('leads')
            .select('id').eq('fb_lead_id', leadgen_id).limit(1)

          if (existing?.length) continue

          const { data: newLead } = await sb.from('leads').insert({
            name, email, phone,
            source: 'facebook',
            source_campaign: form_id || '',
            fb_lead_id: leadgen_id,
            course_interest: course,
            status: 'new',
          }).select().single()

          if (!newLead) continue

          autoSendDocuments(newLead, 'lead_created')

          const { data: pms } = await sb.from('staff')
            .select('id, phone').in('role', ['pm', 'admin']).eq('is_active', true)

          for (const pm of pms || []) {
            await sb.from('notifications').insert({
              staff_id: pm.id,
              title: '🔵 New Facebook Lead',
              message: `${name} submitted your Facebook form${course ? ` for ${course}` : ''}`,
              type: 'new_lead',
              lead_id: newLead.id,
            })
            if (pm.phone) {
              await sendSMS({
                phone: pm.phone,
                message: `New Facebook Lead! ${name}${phone ? ' — ' + phone : ''}${course ? ' (' + course + ')' : ''}. Login to CCE ERP to assign.`,
                leadId: newLead.id,
                type: 'new_lead',
              })
            }
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
