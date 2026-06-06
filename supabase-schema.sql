-- CCE ERP — Cambridge Center of Excellence
-- Lead Management & CRM System
-- Run in Supabase SQL Editor

-- Staff / Users
CREATE TABLE staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'marketer',
  -- roles: pm, marketer, admin, finance, admission, receptionist
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Courses
CREATE TABLE courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  mode TEXT DEFAULT 'in-person',
  -- modes: in-person, online, hybrid
  duration TEXT DEFAULT '',
  fee DECIMAL(10,2) DEFAULT 0,
  scholarship_available BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Leads
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  -- sources: facebook, linkedin, website, manual, referral, walk-in
  source_campaign TEXT DEFAULT '',
  status TEXT DEFAULT 'new',
  -- statuses: new, assigned, contacted, follow_up, pending_registration, registered, next_session, not_qualified, inquiry
  course_interest TEXT DEFAULT '',
  mode_preference TEXT DEFAULT '',
  -- in-person, online
  scholarship_interest BOOLEAN DEFAULT false,
  assigned_to UUID REFERENCES staff(id),
  assigned_at TIMESTAMPTZ,
  whatsapp_sent BOOLEAN DEFAULT false,
  whatsapp_sent_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'Ghana',
  fb_lead_id TEXT DEFAULT '',
  linkedin_lead_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lead Comments / Activity Log
CREATE TABLE lead_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  staff_name TEXT DEFAULT '',
  comment TEXT NOT NULL,
  status_change TEXT DEFAULT '',
  -- if status was changed with this comment
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  type TEXT DEFAULT 'info',
  -- types: new_lead, assignment, status_change, reminder
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp Messages Log
CREATE TABLE whatsapp_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  -- sent, delivered, failed
  marketer_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Facebook Lead Ads Config
CREATE TABLE fb_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id TEXT DEFAULT '',
  page_access_token TEXT DEFAULT '',
  form_id TEXT DEFAULT '',
  verify_token TEXT DEFAULT 'cce_webhook_2026',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_config ENABLE ROW LEVEL SECURITY;

-- Full access policies (for MVP — tighten later)
CREATE POLICY "all staff" ON staff FOR ALL USING (true);
CREATE POLICY "all courses" ON courses FOR ALL USING (true);
CREATE POLICY "all leads" ON leads FOR ALL USING (true);
CREATE POLICY "all comments" ON lead_comments FOR ALL USING (true);
CREATE POLICY "all notifications" ON notifications FOR ALL USING (true);
CREATE POLICY "all wa_log" ON whatsapp_log FOR ALL USING (true);
CREATE POLICY "all fb_config" ON fb_config FOR ALL USING (true);

-- Indexes
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_source ON leads(source);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_comments_lead ON lead_comments(lead_id);
CREATE INDEX idx_notifications_staff ON notifications(staff_id);
CREATE INDEX idx_notifications_unread ON notifications(staff_id, is_read);

-- Insert default PM
INSERT INTO staff (name, email, role) VALUES ('Project Manager', 'pm@cce.edu.gh', 'pm');


-- ══════════════════════════════════════════════════════════
-- ADDITIONS — Run these if updating an existing deployment
-- ══════════════════════════════════════════════════════════

-- LinkedIn Config (mirrors fb_config pattern)
CREATE TABLE IF NOT EXISTS linkedin_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT DEFAULT '',
  client_secret TEXT DEFAULT '',
  access_token TEXT DEFAULT '',
  organization_id TEXT DEFAULT '',
  form_ids TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE linkedin_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all linkedin_config" ON linkedin_config FOR ALL USING (true);

-- Add city to leads if not exists
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';

-- Seed sample staff for demo
INSERT INTO staff (name, email, phone, role) VALUES
  ('Abena Mensah', 'abena@cce.edu.gh', '0244000001', 'marketer'),
  ('Kofi Boateng', 'kofi@cce.edu.gh', '0244000002', 'marketer'),
  ('Finance Officer', 'finance@cce.edu.gh', '0244000003', 'finance'),
  ('Admissions', 'admissions@cce.edu.gh', '0244000004', 'admission')
ON CONFLICT (email) DO NOTHING;

-- Seed sample courses
INSERT INTO courses (name, description, mode, duration, fee, scholarship_available) VALUES
  ('Professional Certificate in Project Management', 'PMI-aligned project management course', 'in-person', '3 months', 2500, true),
  ('Data Analysis with Excel & Python', 'Practical data skills for business', 'hybrid', '2 months', 1800, false),
  ('Digital Marketing Masterclass', 'SEO, social media, paid ads', 'online', '6 weeks', 1200, true),
  ('Business Administration Diploma', 'Comprehensive business management', 'in-person', '6 months', 4500, true),
  ('Human Resource Management', 'HR fundamentals and best practices', 'hybrid', '3 months', 2000, false)
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 — Registration, Admissions, Payments, School Fees
-- Run in Supabase SQL Editor AFTER the base schema
-- ══════════════════════════════════════════════════════════════════════════════

-- Full registration form submissions (from the public reg link)
CREATE TABLE IF NOT EXISTS registrations (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             UUID REFERENCES leads(id) ON DELETE CASCADE,
  marketer_id         UUID REFERENCES staff(id),
  marketer_name       TEXT DEFAULT '',
  -- Personal info
  full_name           TEXT NOT NULL,
  phone               TEXT DEFAULT '',
  email               TEXT DEFAULT '',
  dob                 DATE,
  gender              TEXT DEFAULT '',
  address             TEXT DEFAULT '',
  city                TEXT DEFAULT '',
  nationality         TEXT DEFAULT 'Ghanaian',
  -- Course info
  course_interest     TEXT DEFAULT '',
  mode_preference     TEXT DEFAULT '',
  scholarship_interest BOOLEAN DEFAULT false,
  education_level     TEXT DEFAULT '',
  employment_status   TEXT DEFAULT '',
  how_heard           TEXT DEFAULT '',
  goals               TEXT DEFAULT '',
  -- Emergency contact
  emergency_name      TEXT DEFAULT '',
  emergency_phone     TEXT DEFAULT '',
  emergency_relation  TEXT DEFAULT '',
  -- Payment
  paystack_ref        TEXT DEFAULT '',
  amount_paid         DECIMAL(10,2) DEFAULT 0,
  paid_at             TIMESTAMPTZ,
  status              TEXT DEFAULT 'pending', -- pending | paid | refunded
  -- Admission tracking
  admission_letter_sent       BOOLEAN DEFAULT false,
  admission_letter_sent_at    TIMESTAMPTZ,
  admission_letter_email_sent BOOLEAN DEFAULT false,
  admission_letter_wa_sent    BOOLEAN DEFAULT false,
  -- School fees tracking
  school_fee_amount   DECIMAL(10,2) DEFAULT 0,
  school_fee_paid     DECIMAL(10,2) DEFAULT 0,
  school_fee_status   TEXT DEFAULT 'pending', -- pending | partial | paid
  school_fee_due_date DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all registrations" ON registrations FOR ALL USING (true);

-- Payments table (registration fees + school fees)
CREATE TABLE IF NOT EXISTS payments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  marketer_id   UUID REFERENCES staff(id),
  payment_type  TEXT DEFAULT 'registration', -- registration | school_fee | partial
  amount        DECIMAL(10,2) NOT NULL,
  reference     TEXT UNIQUE NOT NULL,
  channel       TEXT DEFAULT 'paystack',     -- paystack | bank_transfer | cash | momo
  status        TEXT DEFAULT 'pending',       -- pending | success | failed | refunded
  paid_at       TIMESTAMPTZ DEFAULT now(),
  notes         TEXT DEFAULT '',
  recorded_by   UUID REFERENCES staff(id),  -- for manual entries by finance
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all payments" ON payments FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_payments_marketer ON payments(marketer_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);

-- School fee payment plans / invoices
CREATE TABLE IF NOT EXISTS school_fee_invoices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  student_name    TEXT DEFAULT '',
  course          TEXT DEFAULT '',
  total_fee       DECIMAL(10,2) DEFAULT 0,
  amount_paid     DECIMAL(10,2) DEFAULT 0,
  balance         DECIMAL(10,2) DEFAULT 0,
  due_date        DATE,
  status          TEXT DEFAULT 'pending', -- pending | partial | paid | overdue
  paystack_link   TEXT DEFAULT '',        -- pre-generated payment link
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE school_fee_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all school_fee_invoices" ON school_fee_invoices FOR ALL USING (true);

-- Admission letters log
CREATE TABLE IF NOT EXISTS admission_letters (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  student_name    TEXT DEFAULT '',
  student_email   TEXT DEFAULT '',
  student_phone   TEXT DEFAULT '',
  course          TEXT DEFAULT '',
  mode            TEXT DEFAULT '',
  marketer_name   TEXT DEFAULT '',
  sent_via_email  BOOLEAN DEFAULT false,
  sent_via_wa     BOOLEAN DEFAULT false,
  sent_by         UUID REFERENCES staff(id),
  sent_at         TIMESTAMPTZ DEFAULT now(),
  letter_content  TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE admission_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all admission_letters" ON admission_letters FOR ALL USING (true);

-- Email send log
CREATE TABLE IF NOT EXISTS email_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  to_email    TEXT NOT NULL,
  to_name     TEXT DEFAULT '',
  subject     TEXT NOT NULL,
  body        TEXT DEFAULT '',
  type        TEXT DEFAULT 'admission', -- admission | reg_confirm | school_fee | general
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  status      TEXT DEFAULT 'sent',      -- sent | failed | bounced
  provider    TEXT DEFAULT 'sendgrid',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all email_log" ON email_log FOR ALL USING (true);

-- Google Ads config (for future webhook capture)
CREATE TABLE IF NOT EXISTS google_ads_config (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id     TEXT DEFAULT '',
  developer_token TEXT DEFAULT '',
  webhook_secret  TEXT DEFAULT 'cce_gads_2026',
  is_active       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE google_ads_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all google_ads_config" ON google_ads_config FOR ALL USING (true);

-- Additional columns on leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reg_fee_paid     DECIMAL(10,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reg_paid_at      TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS registration_id  UUID REFERENCES registrations(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS docs_sent        BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS docs_sent_at     TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS admission_sent   BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS admission_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS school_fee_status TEXT DEFAULT 'pending';

-- Additional columns on courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS reg_fee        DECIMAL(10,2) DEFAULT 150;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS start_date     DATE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS next_cohort    DATE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS max_students   INT DEFAULT 30;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS syllabus_url   TEXT DEFAULT '';

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_registrations_lead     ON registrations(lead_id);
CREATE INDEX IF NOT EXISTS idx_registrations_marketer ON registrations(marketer_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status   ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_admission_letters_lead ON admission_letters(lead_id);
CREATE INDEX IF NOT EXISTS idx_school_fee_reg         ON school_fee_invoices(registration_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 3 — Cohorts, Attendance, Receipts, SMS, Instructors
-- ══════════════════════════════════════════════════════════════════════════════

-- Cohorts (one per course at a time)
CREATE TABLE IF NOT EXISTS cohorts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id       UUID REFERENCES courses(id) ON DELETE SET NULL,
  course_name     TEXT NOT NULL,
  cohort_number   INT DEFAULT 1,
  label           TEXT DEFAULT '',          -- e.g. "Cohort 3 — Project Management"
  mode            TEXT DEFAULT 'in-person', -- in-person | online | hybrid
  start_date      DATE NOT NULL,
  end_date        DATE,
  class_day       TEXT DEFAULT 'Saturday',  -- day of week
  class_time      TEXT DEFAULT '09:00',
  location        TEXT DEFAULT '',          -- physical address or Zoom link
  max_students    INT DEFAULT 30,
  instructor_id   UUID REFERENCES staff(id),
  status          TEXT DEFAULT 'upcoming',  -- upcoming | active | completed | cancelled
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all cohorts" ON cohorts FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_cohorts_course  ON cohorts(course_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_status  ON cohorts(status);

-- Cohort Enrolments — links registered students to a cohort
CREATE TABLE IF NOT EXISTS enrolments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id       UUID REFERENCES cohorts(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  student_name    TEXT NOT NULL,
  student_phone   TEXT DEFAULT '',
  student_email   TEXT DEFAULT '',
  mode            TEXT DEFAULT 'in-person', -- in-person | online
  rsvp_status     TEXT DEFAULT 'pending',   -- pending | confirmed | declined | no_response
  rsvp_token      TEXT DEFAULT '',          -- unique token for RSVP link
  rsvp_responded_at TIMESTAMPTZ,
  reminder_1month_sent  BOOLEAN DEFAULT false,
  reminder_1week_sent   BOOLEAN DEFAULT false,
  reminder_2day_sent    BOOLEAN DEFAULT false,
  reminder_1day_sent    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all enrolments" ON enrolments FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_enrolments_cohort ON enrolments(cohort_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_lead   ON enrolments(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrolments_unique ON enrolments(cohort_id, lead_id);

-- Class Sessions (each Saturday = one session)
CREATE TABLE IF NOT EXISTS class_sessions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id       UUID REFERENCES cohorts(id) ON DELETE CASCADE,
  session_number  INT DEFAULT 1,
  session_date    DATE NOT NULL,
  class_code_inperson TEXT DEFAULT '',  -- 6-char code shown on board for in-person
  class_code_online   TEXT DEFAULT '',  -- 6-char code shown on screen for online
  attendance_open     BOOLEAN DEFAULT false,
  attendance_opened_at TIMESTAMPTZ,
  attendance_closed_at TIMESTAMPTZ,
  attendance_link_sent BOOLEAN DEFAULT false,
  attendance_link_sent_at TIMESTAMPTZ,
  instructor_id   UUID REFERENCES staff(id),
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all class_sessions" ON class_sessions FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_sessions_cohort ON class_sessions(cohort_id);

-- Attendance Records
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      UUID REFERENCES class_sessions(id) ON DELETE CASCADE,
  cohort_id       UUID REFERENCES cohorts(id) ON DELETE CASCADE,
  enrolment_id    UUID REFERENCES enrolments(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  student_name    TEXT NOT NULL,
  student_phone   TEXT DEFAULT '',
  mode            TEXT DEFAULT 'in-person',  -- in-person | online
  code_used       TEXT DEFAULT '',           -- code they typed
  code_valid      BOOLEAN DEFAULT false,
  checked_in_at   TIMESTAMPTZ DEFAULT now(),
  ip_address      TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all attendance" ON attendance FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_attendance_session  ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_cohort   ON attendance(cohort_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique ON attendance(session_id, lead_id);

-- Payment Receipts log
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id      UUID REFERENCES payments(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  receipt_number  TEXT UNIQUE NOT NULL,
  student_name    TEXT NOT NULL,
  student_email   TEXT DEFAULT '',
  student_phone   TEXT DEFAULT '',
  amount          DECIMAL(10,2) NOT NULL,
  payment_type    TEXT DEFAULT 'registration', -- registration | school_fee | partial
  payment_channel TEXT DEFAULT 'paystack',
  reference       TEXT DEFAULT '',
  sent_via_email  BOOLEAN DEFAULT false,
  sent_via_wa     BOOLEAN DEFAULT false,
  sent_via_sms    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all receipts" ON receipts FOR ALL USING (true);

-- SMS Log
CREATE TABLE IF NOT EXISTS sms_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT DEFAULT 'reminder',  -- reminder | receipt | attendance | general
  provider    TEXT DEFAULT 'arkesel',
  status      TEXT DEFAULT 'sent',      -- sent | failed | delivered
  cost        DECIMAL(6,4) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all sms_log" ON sms_log FOR ALL USING (true);

-- Add instructor role to staff roles comment
-- ALTER TABLE staff ... (no change needed, role column is TEXT)

-- Add columns
ALTER TABLE leads       ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES cohorts(id);
ALTER TABLE staff       ADD COLUMN IF NOT EXISTS instructor_for TEXT DEFAULT ''; -- course name
ALTER TABLE courses     ADD COLUMN IF NOT EXISTS active_cohort_id UUID;
