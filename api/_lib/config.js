import { createClient } from '@supabase/supabase-js'

// ── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://jlhgelmpuvlsaqtenxza.supabase.co'
const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsaGdlbG1wdXZsc2FxdGVueHphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDg3OTQ5NywiZXhwIjoyMDk2NDU1NDk3fQ.E6eCj5ko_iOvlfQuYYJDCi4MG4onL07FIKOe0dh4_GA'
export const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE)

// ── Paystack ────────────────────────────────────────────────────────────────
export const PAYSTACK_SECRET = 'sk_live_da0342b5a5c7dca2ecaf3c60e1ee5c5d695b8780'

// ── Arkesel SMS ─────────────────────────────────────────────────────────────
export const ARKESEL_KEY  = 'VXliSENVQnpsYkhWYlNpZkNRZEc'
export const ARKESEL_FROM = 'Cambridge'

// ── SendGrid (optional — add SENDGRID_API_KEY in Vercel to enable email) ───
export const SENDGRID_KEY  = process.env.SENDGRID_API_KEY   || ''
export const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL || 'admissions@cambridgecoe.edu.gh'
export const SENDGRID_NAME = process.env.SENDGRID_FROM_NAME  || 'Cambridge Center of Excellence'

// ── WhatsApp Business API (optional) ────────────────────────────────────────
export const WABA_TOKEN    = process.env.WABA_TOKEN    || ''
export const WABA_PHONE_ID = process.env.WABA_PHONE_ID || ''

// ── App ─────────────────────────────────────────────────────────────────────
export const APP_URL     = 'https://cce-erp.vercel.app'
export const SHEETS_URL  = process.env.SHEETS_WEBHOOK_URL || ''
export const CRON_SECRET = process.env.CRON_SECRET        || ''
