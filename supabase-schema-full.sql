-- ╔══════════════════════════════════════════════════════════╗
-- ║  CCE ERP — COMPLETE DATABASE SCHEMA                     ║
-- ║  Cambridge Center of Excellence                         ║
-- ║  Run this ONCE in Supabase SQL Editor (fresh install)   ║
-- ║  For existing DBs: run supabase-schema-migration.sql    ║
-- ╚══════════════════════════════════════════════════════════╝

-- ══ STAFF ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'marketer',
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ COURSES ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  mode TEXT DEFAULT 'in-person',
  duration TEXT DEFAULT '',
  fee DECIMAL(10,2) DEFAULT 0,
  scholarship_available BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ LEADS ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  source_campaign TEXT DEFAULT '',
  status TEXT DEFAULT 'new',
  course_interest TEXT DEFAULT '',
  mode_preference TEXT DEFAULT '',
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
  lead_score INT DEFAULT 0,
  reg_fee_paid DECIMAL(10,2) DEFAULT 0,
  reg_paid_at TIMESTAMPTZ,
  school_fee_status TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══ LEAD COMMENTS ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lead_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  staff_name TEXT DEFAULT '',
  comment TEXT NOT NULL,
  status_change TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ NOTIFICATIONS ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  type TEXT DEFAULT 'info',
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ REGISTRATIONS ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  course_interest TEXT DEFAULT '',
  mode_preference TEXT DEFAULT '',
  scholarship_interest BOOLEAN DEFAULT false,
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'Ghana',
  emergency_contact TEXT DEFAULT '',
  education_level TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  amount_paid DECIMAL(10,2) DEFAULT 0,
  payment_reference TEXT DEFAULT '',
  marketer_id UUID REFERENCES staff(id),
  marketer_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  school_fee_amount DECIMAL(10,2) DEFAULT 0,
  school_fee_status TEXT DEFAULT '',
  school_fee_due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══ PAYMENTS ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  payment_type TEXT DEFAULT 'registration',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  reference TEXT DEFAULT '',
  channel TEXT DEFAULT 'paystack',
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ COHORTS ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cohorts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  course_name TEXT DEFAULT '',
  name TEXT DEFAULT '',
  label TEXT DEFAULT '',
  mode TEXT DEFAULT 'in-person',
  start_date DATE,
  end_date DATE,
  class_day TEXT DEFAULT '',
  class_time TEXT DEFAULT '',
  location TEXT DEFAULT '',
  max_students INT DEFAULT 30,
  instructor_id UUID REFERENCES staff(id),
  status TEXT DEFAULT 'upcoming',
  notes TEXT DEFAULT '',
  reminder_1month_sent BOOLEAN DEFAULT false,
  reminder_1week_sent BOOLEAN DEFAULT false,
  reminder_2day_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══ ENROLMENTS ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS enrolments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID REFERENCES cohorts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  student_phone TEXT DEFAULT '',
  student_email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  mode TEXT DEFAULT 'in-person',
  rsvp_status TEXT DEFAULT 'pending',
  rsvp_token TEXT DEFAULT '',
  rsvp_responded_at TIMESTAMPTZ,
  reminder_1month_sent BOOLEAN DEFAULT false,
  reminder_1week_sent BOOLEAN DEFAULT false,
  reminder_2day_sent BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ CLASS SESSIONS ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS class_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID REFERENCES cohorts(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_number INT DEFAULT 1,
  session_time TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  attendance_open BOOLEAN DEFAULT false,
  attendance_code TEXT DEFAULT '',
  class_code_inperson TEXT DEFAULT '',
  class_code_online TEXT DEFAULT '',
  attendance_opened_at TIMESTAMPTZ,
  attendance_closed_at TIMESTAMPTZ,
  attendance_link_sent BOOLEAN DEFAULT false,
  attendance_link_sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  opened_by UUID REFERENCES staff(id),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ ATTENDANCE ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES class_sessions(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES cohorts(id) ON DELETE CASCADE,
  enrolment_id UUID REFERENCES enrolments(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  student_phone TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  mode TEXT DEFAULT 'in-person',
  code_used TEXT DEFAULT '',
  code_valid BOOLEAN DEFAULT false,
  ip_address TEXT DEFAULT '',
  checked_in_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ ADMISSION LETTERS ═════════════════════════════════════
CREATE TABLE IF NOT EXISTS admission_letters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  course TEXT DEFAULT '',
  mode TEXT DEFAULT '',
  letter_html TEXT DEFAULT '',
  sent_via TEXT DEFAULT '',
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ SCHOOL FEE INVOICES ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS school_fee_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  student_name TEXT DEFAULT '',
  course TEXT DEFAULT '',
  total_fee DECIMAL(10,2) DEFAULT 0,
  scholarship_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  net_fee DECIMAL(10,2) DEFAULT 0,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0,
  due_date DATE,
  payment_plan TEXT DEFAULT 'full',
  paystack_link TEXT DEFAULT '',
  status TEXT DEFAULT 'unpaid',
  notes TEXT DEFAULT '',
  sent_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══ COURSE FEE PAYMENTS ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS course_fee_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES school_fee_invoices(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  method TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'pending_cash',
  reference TEXT DEFAULT '',
  receipt_no TEXT DEFAULT '',
  recorded_by UUID REFERENCES staff(id),
  paid_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ DOCUMENTS ═════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'brochure',
  description TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  file_url TEXT DEFAULT '',
  file_size BIGINT DEFAULT 0,
  trigger_event TEXT DEFAULT 'manual',
  course TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  sends_count INT DEFAULT 0,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ RECEIPTS ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  receipt_no TEXT NOT NULL,
  student_name TEXT DEFAULT '',
  student_email TEXT DEFAULT '',
  student_phone TEXT DEFAULT '',
  amount DECIMAL(10,2) DEFAULT 0,
  payment_type TEXT DEFAULT '',
  sent_via TEXT DEFAULT '',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ SMS LOG ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sms_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  provider TEXT DEFAULT 'arkesel',
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ WHATSAPP LOG ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS whatsapp_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  marketer_name TEXT DEFAULT '',
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ EMAIL LOG ═════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  to_name TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  type TEXT DEFAULT 'general',
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══ FACEBOOK CONFIG ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS fb_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id TEXT DEFAULT '',
  page_access_token TEXT DEFAULT '',
  form_id TEXT DEFAULT '',
  verify_token TEXT DEFAULT 'cce_webhook_2026',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_config ENABLE ROW LEVEL SECURITY;

-- Full access policies (MVP — tighten with auth later)
CREATE POLICY "all" ON staff FOR ALL USING (true);
CREATE POLICY "all" ON courses FOR ALL USING (true);
CREATE POLICY "all" ON leads FOR ALL USING (true);
CREATE POLICY "all" ON lead_comments FOR ALL USING (true);
CREATE POLICY "all" ON notifications FOR ALL USING (true);
CREATE POLICY "all" ON registrations FOR ALL USING (true);
CREATE POLICY "all" ON payments FOR ALL USING (true);
CREATE POLICY "all" ON cohorts FOR ALL USING (true);
CREATE POLICY "all" ON enrolments FOR ALL USING (true);
CREATE POLICY "all" ON class_sessions FOR ALL USING (true);
CREATE POLICY "all" ON attendance FOR ALL USING (true);
CREATE POLICY "all" ON admission_letters FOR ALL USING (true);
CREATE POLICY "all" ON school_fee_invoices FOR ALL USING (true);
CREATE POLICY "all" ON course_fee_payments FOR ALL USING (true);
CREATE POLICY "all" ON documents FOR ALL USING (true);
CREATE POLICY "all" ON receipts FOR ALL USING (true);
CREATE POLICY "all" ON sms_log FOR ALL USING (true);
CREATE POLICY "all" ON whatsapp_log FOR ALL USING (true);
CREATE POLICY "all" ON email_log FOR ALL USING (true);
CREATE POLICY "all" ON fb_config FOR ALL USING (true);

-- ══════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_lead ON lead_comments(lead_id);
CREATE INDEX IF NOT EXISTS idx_notif_staff ON notifications(staff_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(staff_id, is_read);
CREATE INDEX IF NOT EXISTS idx_reg_lead ON registrations(lead_id);
CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_payments_reg ON payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_status ON cohorts(status);
CREATE INDEX IF NOT EXISTS idx_enrol_cohort ON enrolments(cohort_id);
CREATE INDEX IF NOT EXISTS idx_enrol_lead ON enrolments(lead_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cohort ON class_sessions(cohort_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON class_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_attend_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attend_lead ON attendance(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_lead ON school_fee_invoices(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cohort ON school_fee_invoices(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cfp_invoice ON course_fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cfp_status ON course_fee_payments(status);
CREATE INDEX IF NOT EXISTS idx_docs_trigger ON documents(trigger_event);
CREATE INDEX IF NOT EXISTS idx_sms_lead ON sms_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_lead ON whatsapp_log(lead_id);

-- ══════════════════════════════════════════════════════════
-- DEFAULT DATA
-- ══════════════════════════════════════════════════════════
INSERT INTO staff (name, email, role, phone) VALUES
  ('Project Manager', 'pm@cce.edu.gh', 'pm', '')
ON CONFLICT (email) DO NOTHING;
