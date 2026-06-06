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
