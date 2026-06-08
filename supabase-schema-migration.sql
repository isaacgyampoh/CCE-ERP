-- ╔══════════════════════════════════════════════════════════╗
-- ║  CCE ERP — DATABASE MIGRATION                           ║
-- ║  Run in Supabase SQL Editor on an existing database     ║
-- ║  Safe to run multiple times (IF NOT EXISTS / IF EXISTS) ║
-- ╚══════════════════════════════════════════════════════════╝

-- ══ leads — add fee & school fee tracking columns ══════════
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS reg_fee_paid DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reg_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS school_fee_status TEXT DEFAULT '';

-- ══ registrations — add school fee columns ════════════════
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS school_fee_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS school_fee_status TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS school_fee_due_date DATE;

-- ══ cohorts — add label (display name) column ═════════════
ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS label TEXT DEFAULT '';

-- Relax name NOT NULL only if the column exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cohorts' AND column_name = 'name'
  ) THEN
    ALTER TABLE cohorts ALTER COLUMN name SET DEFAULT '';
  END IF;
END $$;

-- ══ enrolments — add student_phone/email + reminder flags ═
ALTER TABLE enrolments
  ADD COLUMN IF NOT EXISTS student_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS student_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS reminder_1month_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1week_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_2day_sent BOOLEAN DEFAULT false;

-- Back-fill student_phone/email from existing phone/email columns
UPDATE enrolments SET student_phone = phone WHERE student_phone = '' AND phone != '';
UPDATE enrolments SET student_email = email WHERE student_email = '' AND email != '';

-- ══ class_sessions — add dual attendance codes + timestamps ═
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS session_number INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS class_code_inperson TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS class_code_online TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS attendance_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_link_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_link_sent_at TIMESTAMPTZ;

-- Back-fill attendance_opened_at from legacy opened_at
UPDATE class_sessions
  SET attendance_opened_at = opened_at
  WHERE attendance_opened_at IS NULL AND opened_at IS NOT NULL;

-- ══ attendance — add lead_id, student_phone, code tracking ═
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS code_used TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS code_valid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT '';

-- Back-fill student_phone from existing phone column
UPDATE attendance SET student_phone = phone WHERE student_phone = '' AND phone != '';

-- ══ school_fee_invoices — add cohort, scholarship, discount ═
ALTER TABLE school_fee_invoices
  ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scholarship_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_fee DECIMAL(10,2) DEFAULT 0;

-- Back-fill net_fee for existing invoices (total - 0 scholarship - 0 discount = total)
UPDATE school_fee_invoices
  SET net_fee = total_fee - COALESCE(scholarship_amount, 0) - COALESCE(discount_amount, 0)
  WHERE net_fee = 0 AND total_fee > 0;

-- ══ receipts — add student contact columns ════════════════
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS student_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS student_phone TEXT DEFAULT '';

-- ══ NEW TABLE: course_fee_payments ════════════════════════
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

ALTER TABLE course_fee_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'course_fee_payments' AND policyname = 'all'
  ) THEN
    CREATE POLICY "all" ON course_fee_payments FOR ALL USING (true);
  END IF;
END $$;

-- ══ NEW TABLE: documents ══════════════════════════════════
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

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'all'
  ) THEN
    CREATE POLICY "all" ON documents FOR ALL USING (true);
  END IF;
END $$;

-- ══ NEW INDEXES ════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_enrol_lead ON enrolments(lead_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON class_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_attend_lead ON attendance(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_lead ON school_fee_invoices(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cohort ON school_fee_invoices(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cfp_invoice ON course_fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cfp_status ON course_fee_payments(status);
CREATE INDEX IF NOT EXISTS idx_docs_trigger ON documents(trigger_event);
