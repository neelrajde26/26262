/* ============================================
   AICTE FlowGuard — Database Engine
   Powered by Native node:sqlite (SQLite3)
   ============================================ */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'flowguard.db');
const db = new DatabaseSync(DB_FILE);

// Enable WAL mode and foreign keys for performance and relational integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const { hash } = hashPassword(password, salt);
  return hash === storedHash;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      states TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      region TEXT,
      institution_id TEXT,
      bureau TEXT,
      committee_type TEXT,
      email TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      aicte_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      region TEXT NOT NULL,
      established INTEGER,
      status TEXT DEFAULT 'active',
      contact_person TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(region) REFERENCES regions(id)
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      stages TEXT NOT NULL,
      applicable_to TEXT NOT NULL,
      version TEXT DEFAULT '1.0',
      effective_date TEXT,
      created_by TEXT,
      is_demo INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      application_number TEXT UNIQUE NOT NULL,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      type TEXT NOT NULL,
      program_name TEXT,
      workflow_template_id TEXT NOT NULL,
      current_stage TEXT NOT NULL,
      status TEXT NOT NULL,
      region TEXT NOT NULL,
      assigned_officer TEXT,
      assigned_officer_name TEXT,
      submitted_date TEXT NOT NULL,
      current_stage_due_date TEXT,
      observations TEXT,
      return_reason TEXT,
      attachments TEXT,
      priority TEXT DEFAULT 'normal',
      is_new_institution INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(institution_id) REFERENCES institutions(id),
      FOREIGN KEY(region) REFERENCES regions(id),
      FOREIGN KEY(workflow_template_id) REFERENCES workflow_templates(id)
    );

    CREATE TABLE IF NOT EXISTS stage_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evc_events (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      application_number TEXT NOT NULL,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      status TEXT NOT NULL,
      committee_id TEXT,
      committee_name TEXT,
      planned_date TEXT,
      completed_date TEXT,
      region TEXT NOT NULL,
      is_new_institution INTEGER DEFAULT 0,
      meeting_mode TEXT DEFAULT 'physical',
      notes TEXT,
      report TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES applications(id),
      FOREIGN KEY(institution_id) REFERENCES institutions(id)
    );

    CREATE TABLE IF NOT EXISTS undertakings (
      id TEXT PRIMARY KEY,
      application_id TEXT,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      condition TEXT NOT NULL,
      due_date TEXT NOT NULL,
      required_evidence TEXT NOT NULL,
      status TEXT NOT NULL,
      verification_owner TEXT NOT NULL,
      verification_owner_name TEXT NOT NULL,
      region TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(institution_id) REFERENCES institutions(id)
    );

    CREATE TABLE IF NOT EXISTS undertaking_submissions (
      id TEXT PRIMARY KEY,
      undertaking_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      stored_path TEXT,
      submitted_at TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      submitter_name TEXT NOT NULL,
      status TEXT NOT NULL,
      review_notes TEXT,
      FOREIGN KEY(undertaking_id) REFERENCES undertakings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      issue_date TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      expiry_date TEXT,
      status TEXT NOT NULL,
      file_name TEXT NOT NULL,
      stored_path TEXT,
      region TEXT NOT NULL,
      renewal_status TEXT,
      verification_status TEXT NOT NULL,
      verified_by TEXT,
      verified_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(institution_id) REFERENCES institutions(id)
    );

    CREATE TABLE IF NOT EXISTS escalation_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_days INTEGER NOT NULL,
      reminder_days INTEGER NOT NULL,
      escalation_level1_role TEXT NOT NULL,
      escalation_level1_days INTEGER NOT NULL,
      escalation_level2_role TEXT NOT NULL,
      escalation_level2_days INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      is_demo INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      recipient_id TEXT,
      recipient_role TEXT,
      recipient_region TEXT,
      recipient_institution TEXT,
      entity_type TEXT,
      entity_id TEXT,
      escalation_level INTEGER DEFAULT 0,
      read INTEGER DEFAULT 0,
      status TEXT DEFAULT 'delivered',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_trail (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT,
      ip_address TEXT,
      timestamp TEXT NOT NULL
    );

    -- Indexes for fast querying & pendency monitoring
    CREATE INDEX IF NOT EXISTS idx_apps_region_status ON applications(region, status);
    CREATE INDEX IF NOT EXISTS idx_apps_due ON applications(current_stage_due_date);
    CREATE INDEX IF NOT EXISTS idx_apps_institution ON applications(institution_id);
    CREATE INDEX IF NOT EXISTS idx_stage_history_app ON stage_history(application_id);
    CREATE INDEX IF NOT EXISTS idx_evc_status ON evc_events(status);
    CREATE INDEX IF NOT EXISTS idx_und_inst_status ON undertakings(institution_id, status);
    CREATE INDEX IF NOT EXISTS idx_docs_inst_expiry ON documents(institution_id, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id, read);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_trail(entity_id, timestamp);
  `);
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function seedDatabase(force = false) {
  initSchema();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0 && !force) {
    return;
  }

  // Clear existing if force
  if (force) {
    db.exec(`
      DELETE FROM audit_trail;
      DELETE FROM notifications;
      DELETE FROM undertaking_submissions;
      DELETE FROM undertakings;
      DELETE FROM documents;
      DELETE FROM evc_events;
      DELETE FROM stage_history;
      DELETE FROM applications;
      DELETE FROM workflow_templates;
      DELETE FROM institutions;
      DELETE FROM users;
      DELETE FROM regions;
      DELETE FROM escalation_rules;
    `);
  }

  // 1. Seed Regions
  const insertRegion = db.prepare('INSERT INTO regions VALUES (?, ?, ?, ?)');
  const regions = [
    ['reg-north', 'Northern Region', 'NR', JSON.stringify(['Delhi', 'Haryana', 'Punjab', 'Uttar Pradesh', 'Uttarakhand'])],
    ['reg-south', 'Southern Region', 'SR', JSON.stringify(['Tamil Nadu', 'Karnataka', 'Kerala', 'Andhra Pradesh', 'Telangana'])],
    ['reg-west', 'Western Region', 'WR', JSON.stringify(['Maharashtra', 'Gujarat', 'Rajasthan', 'Goa'])],
    ['reg-east', 'Eastern Region', 'ER', JSON.stringify(['West Bengal', 'Odisha', 'Bihar', 'Jharkhand'])]
  ];
  regions.forEach(r => insertRegion.run(...r));

  // 2. Seed Users
  const { hash, salt } = hashPassword('demo123');
  const insertUser = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const nowStr = new Date().toISOString();
  const users = [
    ['user-inst1', 'inst_demotech', hash, salt, 'Rajesh Sharma', 'institution', 'reg-north', 'inst-001', null, null, 'rajesh@demo.flowguard.in', 1, nowStr],
    ['user-inst2', 'inst_southeng', hash, salt, 'Lakshmi Venkatesh', 'institution', 'reg-south', 'inst-002', null, null, 'lakshmi@demo.flowguard.in', 1, nowStr],
    ['user-inst3', 'inst_westpoly', hash, salt, 'Amit Patel', 'institution', 'reg-west', 'inst-003', null, null, 'amit@demo.flowguard.in', 1, nowStr],
    ['user-ro1', 'ro_north', hash, salt, 'Dr. Priya Mehta', 'regional_officer', 'reg-north', null, null, null, 'priya.ro@demo.flowguard.in', 1, nowStr],
    ['user-ro2', 'ro_south', hash, salt, 'Dr. Suresh Kumar', 'regional_officer', 'reg-south', null, null, null, 'suresh.ro@demo.flowguard.in', 1, nowStr],
    ['user-bo1', 'bo_bureau1', hash, salt, 'Ananya Gupta', 'bureau_officer', 'reg-north', null, 'Engineering', null, 'ananya.bo@demo.flowguard.in', 1, nowStr],
    ['user-evc1', 'evc_expert1', hash, salt, 'Prof. K. Ramachandran', 'committee', null, null, null, 'EVC', 'ram.evc@demo.flowguard.in', 1, nowStr],
    ['user-ca1', 'ca_authority', hash, salt, 'Dr. Meera Joshi', 'competent_authority', null, null, null, null, 'meera.ca@demo.flowguard.in', 1, nowStr],
    ['user-admin', 'admin', hash, salt, 'System Administrator', 'admin', null, null, null, null, 'admin@demo.flowguard.in', 1, nowStr]
  ];
  users.forEach(u => insertUser.run(...u));

  // 3. Seed Institutions
  const insertInst = db.prepare('INSERT INTO institutions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const institutions = [
    ['inst-001', 'Demo Technical Institute of Engineering', 'DTIE', 'AICTE/1-99999901/2025', 'Engineering', 'Delhi', 'New Delhi', 'reg-north', 2015, 'active', 'Rajesh Sharma', 'rajesh@demo.flowguard.in', '+91-11-23456789', nowStr],
    ['inst-002', 'Southern Engineering College (Demo)', 'SEC', 'AICTE/1-99999902/2024', 'Engineering', 'Tamil Nadu', 'Chennai', 'reg-south', 2010, 'active', 'Lakshmi Venkatesh', 'lakshmi@demo.flowguard.in', '+91-44-23456789', nowStr],
    ['inst-003', 'Western Polytechnic Institute (Demo)', 'WPI', 'AICTE/1-99999903/2026', 'Polytechnic', 'Maharashtra', 'Pune', 'reg-west', 2024, 'active', 'Amit Patel', 'amit@demo.flowguard.in', '+91-20-23456789', nowStr],
    ['inst-004', 'Northern Management Academy (Demo)', 'NMA', 'AICTE/1-99999904/2023', 'Management', 'Haryana', 'Gurgaon', 'reg-north', 2018, 'active', 'Vikram Singh', 'vikram@demo.flowguard.in', '+91-124-23456789', nowStr],
    ['inst-005', 'South India Pharmacy College (Demo)', 'SIPC', 'AICTE/1-99999905/2025', 'Pharmacy', 'Karnataka', 'Bangalore', 'reg-south', 2020, 'active', 'Dr. Asha Rao', 'asha@demo.flowguard.in', '+91-80-23456789', nowStr]
  ];
  institutions.forEach(i => insertInst.run(...i));

  // 4. Seed Workflow Templates
  const insertTemplate = db.prepare('INSERT INTO workflow_templates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const templates = [
    [
      'wf-scrutiny-evc-sac',
      'Scrutiny + EVC + SAC',
      'Comprehensive approval workflow for new institutions and major programs including Expert Visit and Standing Approval Committee review',
      JSON.stringify([
        { id: 'scrutiny', name: 'Scrutiny', order: 1, timelineDays: 15, required: true },
        { id: 're-scrutiny', name: 'Re-Scrutiny', order: 2, timelineDays: 10, required: false },
        { id: 'evc-pending', name: 'EVC Scheduling', order: 3, timelineDays: 10, required: true },
        { id: 'evc-scheduled', name: 'EVC Inspection', order: 4, timelineDays: 15, required: true },
        { id: 'evc-completed', name: 'EVC Evaluation', order: 5, timelineDays: 7, required: true },
        { id: 'sac-review', name: 'SAC Review', order: 6, timelineDays: 10, required: true },
        { id: 'approved', name: 'Competent Decision', order: 7, timelineDays: 5, required: true }
      ]),
      JSON.stringify(['new-institution', 'new-program']),
      '1.0',
      '2026-01-01',
      'admin',
      1,
      nowStr
    ],
    [
      'wf-scrutiny-only',
      'Scrutiny Only',
      'Fast-track administrative review workflow for minor modifications and intake alterations',
      JSON.stringify([
        { id: 'scrutiny', name: 'Scrutiny', order: 1, timelineDays: 15, required: true },
        { id: 're-scrutiny', name: 'Re-Scrutiny', order: 2, timelineDays: 10, required: false },
        { id: 'approved', name: 'Decision', order: 3, timelineDays: 5, required: true }
      ]),
      JSON.stringify(['intake-change', 'minor-modification']),
      '1.0',
      '2026-01-01',
      'admin',
      1,
      nowStr
    ],
    [
      'wf-evc-shc',
      'EVC + SHC',
      'Enforcement review with Expert Visit inspection and Standing Hearing Committee compliance evaluation',
      JSON.stringify([
        { id: 'scrutiny', name: 'Preliminary Review', order: 1, timelineDays: 10, required: true },
        { id: 'evc-pending', name: 'EVC Scheduling', order: 2, timelineDays: 10, required: true },
        { id: 'evc-scheduled', name: 'EVC Visit', order: 3, timelineDays: 15, required: true },
        { id: 'evc-completed', name: 'EVC Report Evaluation', order: 4, timelineDays: 7, required: true },
        { id: 'shc-review', name: 'SHC Hearing', order: 5, timelineDays: 10, required: true },
        { id: 'approved', name: 'Final Order', order: 6, timelineDays: 5, required: true }
      ]),
      JSON.stringify(['closure', 'show-cause']),
      '1.0',
      '2026-01-01',
      'admin',
      1,
      nowStr
    ]
  ];
  templates.forEach(t => insertTemplate.run(...t));

  // 5. Seed Applications & Stage History
  const insertApp = db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertHistory = db.prepare('INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  const applications = [
    {
      id: 'app-001',
      number: 'FG/NR/2026/0001',
      instId: 'inst-001',
      instName: 'Demo Technical Institute of Engineering',
      type: 'new-program',
      prog: 'B.Tech Computer Science & AI',
      template: 'wf-scrutiny-evc-sac',
      stage: 'scrutiny',
      status: 'scrutiny',
      reg: 'reg-north',
      officer: 'user-ro1',
      officerName: 'Dr. Priya Mehta',
      submitted: dateOffset(-12),
      due: dateOffset(3),
      obs: 'Faculty qualifications and lab infrastructure documents under verification.',
      retReason: null,
      att: JSON.stringify(['application_form.pdf', 'faculty_matrix.xlsx', 'lab_layout.pdf']),
      prio: 'normal',
      isNew: 0,
      history: [
        { stage: 'submitted', action: 'Application submitted', actorId: 'user-inst1', actorName: 'Rajesh Sharma', date: dateOffset(-12), notes: 'Initial submission' },
        { stage: 'scrutiny', action: 'Assigned for scrutiny', actorId: 'user-ro1', actorName: 'Dr. Priya Mehta', date: dateOffset(-10), notes: 'Documents in order' }
      ]
    },
    {
      id: 'app-002',
      number: 'FG/NR/2026/0002',
      instId: 'inst-004',
      instName: 'Northern Management Academy (Demo)',
      type: 'new-program',
      prog: 'MBA in Finance & Analytics',
      template: 'wf-scrutiny-evc-sac',
      stage: 'returned',
      status: 'returned',
      reg: 'reg-north',
      officer: 'user-ro1',
      officerName: 'Dr. Priya Mehta',
      submitted: dateOffset(-18),
      due: dateOffset(-3),
      obs: 'Clarification required regarding library volume count and AICTE cadre ratio compliance.',
      retReason: 'Deficient library holdings. Please upload updated accession register proof and faculty cadre ratio proof.',
      att: JSON.stringify(['application_form.pdf', 'library_receipt.pdf']),
      prio: 'normal',
      isNew: 0,
      history: [
        { stage: 'submitted', action: 'Application submitted', actorId: 'user-inst1', actorName: 'Vikram Singh', date: dateOffset(-18), notes: 'Submitted' },
        { stage: 'scrutiny', action: 'Assigned for scrutiny', actorId: 'user-ro1', actorName: 'Dr. Priya Mehta', date: dateOffset(-15), notes: 'Scrutiny ongoing' },
        { stage: 'returned', action: 'Application returned', actorId: 'user-ro1', actorName: 'Dr. Priya Mehta', date: dateOffset(-10), notes: 'Returned for clarification' }
      ]
    },
    {
      id: 'app-003',
      number: 'FG/SR/2026/0001',
      instId: 'inst-002',
      instName: 'Southern Engineering College (Demo)',
      type: 'new-institution',
      prog: 'Integrated Engineering Campus Establishment',
      template: 'wf-scrutiny-evc-sac',
      stage: 'evc-pending',
      status: 'evc-pending',
      reg: 'reg-south',
      officer: 'user-ro2',
      officerName: 'Dr. Suresh Kumar',
      submitted: dateOffset(-25),
      due: dateOffset(5),
      obs: 'Scrutiny passed. Physical campus inspection required by Expert Visit Committee.',
      retReason: null,
      att: JSON.stringify(['master_plan.pdf', 'land_title_deed.pdf', 'trust_registration.pdf']),
      prio: 'high',
      isNew: 1,
      history: [
        { stage: 'submitted', action: 'Application submitted', actorId: 'user-inst2', actorName: 'Lakshmi Venkatesh', date: dateOffset(-25), notes: 'Submitted' },
        { stage: 'scrutiny', action: 'Scrutiny completed', actorId: 'user-ro2', actorName: 'Dr. Suresh Kumar', date: dateOffset(-20), notes: 'Eligible for EVC' },
        { stage: 'evc-pending', action: 'Advanced to EVC scheduling', actorId: 'user-ro2', actorName: 'Dr. Suresh Kumar', date: dateOffset(-18), notes: 'Schedule EVC team' }
      ]
    },
    {
      id: 'app-004',
      number: 'FG/WR/2026/0001',
      instId: 'inst-003',
      instName: 'Western Polytechnic Institute (Demo)',
      type: 'new-institution',
      prog: 'Polytechnic Diploma Institute',
      template: 'wf-scrutiny-evc-sac',
      stage: 'evc-scheduled',
      status: 'evc-scheduled',
      reg: 'reg-west',
      officer: 'user-bo1',
      officerName: 'Ananya Gupta',
      submitted: dateOffset(-30),
      due: dateOffset(7),
      obs: 'EVC team assigned and physical visit scheduled for campus inspection.',
      retReason: null,
      att: JSON.stringify(['polytechnic_application.pdf', 'building_blueprint.pdf']),
      prio: 'high',
      isNew: 1,
      history: [
        { stage: 'submitted', action: 'Application submitted', actorId: 'user-inst3', actorName: 'Amit Patel', date: dateOffset(-30), notes: 'Submitted' },
        { stage: 'scrutiny', action: 'Scrutiny completed', actorId: 'user-bo1', actorName: 'Ananya Gupta', date: dateOffset(-20), notes: 'All documents valid' },
        { stage: 'evc-scheduled', action: 'EVC Visit scheduled', actorId: 'user-evc1', actorName: 'Prof. K. Ramachandran', date: dateOffset(-15), notes: 'Inspection scheduled' }
      ]
    },
    {
      id: 'app-005',
      number: 'FG/SR/2026/0002',
      instId: 'inst-005',
      instName: 'South India Pharmacy College (Demo)',
      type: 'new-program',
      prog: 'Pharm.D (Doctor of Pharmacy)',
      template: 'wf-scrutiny-evc-sac',
      stage: 'sac-review',
      status: 'sac-review',
      reg: 'reg-south',
      officer: 'user-ro2',
      officerName: 'Dr. Suresh Kumar',
      submitted: dateOffset(-45),
      due: dateOffset(4),
      obs: 'EVC completed with favorable remarks. Awaiting final SAC committee review.',
      retReason: null,
      att: JSON.stringify(['pharmd_curriculum.pdf', 'evc_inspection_report.pdf']),
      prio: 'normal',
      isNew: 0,
      history: [
        { stage: 'submitted', action: 'Application submitted', actorId: 'user-inst2', actorName: 'Dr. Asha Rao', date: dateOffset(-45), notes: 'Submitted' },
        { stage: 'scrutiny', action: 'Scrutiny completed', actorId: 'user-ro2', actorName: 'Dr. Suresh Kumar', date: dateOffset(-35), notes: 'Passed' },
        { stage: 'evc-completed', action: 'EVC Report filed', actorId: 'user-evc1', actorName: 'Prof. K. Ramachandran', date: dateOffset(-20), notes: 'Favorable inspection' },
        { stage: 'sac-review', action: 'Placed before SAC', actorId: 'user-ro2', actorName: 'Dr. Suresh Kumar', date: dateOffset(-5), notes: 'Awaiting SAC approval' }
      ]
    },
    {
      id: 'app-006',
      number: 'FG/NR/2026/0003',
      instId: 'inst-001',
      instName: 'Demo Technical Institute of Engineering',
      type: 'intake-change',
      prog: 'B.Tech Mechanical Engineering — Intake Increase (60 to 120)',
      template: 'wf-scrutiny-only',
      stage: 'approved',
      status: 'approved',
      reg: 'reg-north',
      officer: 'user-ro1',
      officerName: 'Dr. Priya Mehta',
      submitted: dateOffset(-40),
      due: null,
      obs: 'Intake expansion approved subject to maintaining faculty ratio and building compliance undertaking.',
      retReason: null,
      att: JSON.stringify(['intake_proposal.pdf', 'approval_letter.pdf']),
      prio: 'normal',
      isNew: 0,
      history: [
        { stage: 'submitted', action: 'Application submitted', actorId: 'user-inst1', actorName: 'Rajesh Sharma', date: dateOffset(-40), notes: 'Submitted' },
        { stage: 'scrutiny', action: 'Scrutiny completed', actorId: 'user-ro1', actorName: 'Dr. Priya Mehta', date: dateOffset(-25), notes: 'Adequate infrastructure' },
        { stage: 'approved', action: 'Approved with conditions', actorId: 'user-ca1', actorName: 'Dr. Meera Joshi', date: dateOffset(-10), notes: 'Intake increase approved' }
      ]
    },
    {
      id: 'app-007',
      number: 'FG/SR/2026/0003',
      instId: 'inst-005',
      instName: 'South India Pharmacy College (Demo)',
      type: 'new-program',
      prog: 'B.Pharm (Practice)',
      template: 'wf-scrutiny-evc-sac',
      stage: 'scrutiny',
      status: 'scrutiny',
      reg: 'reg-south',
      officer: 'user-ro2',
      officerName: 'Dr. Suresh Kumar',
      submitted: dateOffset(-30),
      due: dateOffset(-5),
      obs: 'Hospital clinical tie-up MoU verification overdue.',
      retReason: null,
      att: JSON.stringify(['practice_form.pdf', 'hospital_mou.pdf']),
      prio: 'normal',
      isNew: 0,
      history: [
        { stage: 'submitted', action: 'Application submitted', actorId: 'user-inst2', actorName: 'Dr. Asha Rao', date: dateOffset(-30), notes: 'Submitted' },
        { stage: 'scrutiny', action: 'Assigned for scrutiny', actorId: 'user-ro2', actorName: 'Dr. Suresh Kumar', date: dateOffset(-25), notes: 'Assigned' }
      ]
    }
  ];

  applications.forEach(a => {
    insertApp.run(
      a.id, a.number, a.instId, a.instName, a.type, a.prog, a.template, a.stage, a.status,
      a.reg, a.officer, a.officerName, a.submitted, a.due, a.obs, a.retReason, a.att, a.prio, a.isNew,
      nowStr, nowStr
    );
    a.history.forEach((h, idx) => {
      insertHistory.run(`hist-${a.id}-${idx}`, a.id, h.stage, h.action, h.actorId, h.actorName, h.date, h.notes);
    });
  });

  // 6. Seed EVC Events
  const insertEvc = db.prepare('INSERT INTO evc_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const evcEvents = [
    ['evc-001', 'app-003', 'FG/SR/2026/0001', 'inst-002', 'Southern Engineering College (Demo)', 'pending-schedule', null, null, null, null, 'reg-south', 1, 'physical', 'Awaiting committee constitution and inspection schedule.', null, nowStr, nowStr],
    ['evc-002', 'app-004', 'FG/WR/2026/0001', 'inst-003', 'Western Polytechnic Institute (Demo)', 'scheduled', 'user-evc1', 'Prof. K. Ramachandran', dateOffset(5), null, 'reg-west', 1, 'physical', 'Inspection scheduled. Inspection team verified.', null, nowStr, nowStr],
    ['evc-003', 'app-005', 'FG/SR/2026/0002', 'inst-005', 'South India Pharmacy College (Demo)', 'completed', 'user-evc1', 'Prof. K. Ramachandran', dateOffset(-22), dateOffset(-20), 'reg-south', 0, 'physical', 'Inspection completed.', 'All physical infrastructure, equipment, pilot plant, and faculty verified. Recommended favorably.', nowStr, nowStr]
  ];
  evcEvents.forEach(e => insertEvc.run(...e));

  // 7. Seed Undertakings & Submissions
  const insertUnd = db.prepare('INSERT INTO undertakings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertSub = db.prepare('INSERT INTO undertaking_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const undertakings = [
    {
      id: 'und-001',
      appId: 'app-006',
      instId: 'inst-001',
      instName: 'Demo Technical Institute of Engineering',
      condition: 'Maintain student-to-faculty ratio of 15:1 for enhanced B.Tech Mechanical intake',
      due: dateOffset(60),
      evidence: 'Appointment orders, biometric records, and university teacher approval letters',
      status: 'pending',
      owner: 'user-ro1',
      ownerName: 'Dr. Priya Mehta',
      reg: 'reg-north',
      subs: []
    },
    {
      id: 'und-002',
      appId: null,
      instId: 'inst-002',
      instName: 'Southern Engineering College (Demo)',
      condition: 'Submit renewed Fire Safety NOC from State Fire Department',
      due: dateOffset(-3),
      evidence: 'Valid Fire Safety NOC certificate signed by Divisional Fire Officer',
      status: 'submitted',
      owner: 'user-ro2',
      ownerName: 'Dr. Suresh Kumar',
      reg: 'reg-south',
      subs: [
        { id: 'sub-001', file: 'fire_noc_2026_signed.pdf', date: dateOffset(-5), actor: 'user-inst2', actorName: 'Lakshmi Venkatesh', status: 'under-review', notes: 'Renewal submitted for officer review' }
      ]
    },
    {
      id: 'und-003',
      appId: null,
      instId: 'inst-004',
      instName: 'Northern Management Academy (Demo)',
      condition: 'Submit statutory audited balance sheet and P&L statement for FY 2025-26',
      due: dateOffset(-15),
      evidence: 'Audited financial statements signed by Chartered Accountant',
      status: 'overdue',
      owner: 'user-ro1',
      ownerName: 'Dr. Priya Mehta',
      reg: 'reg-north',
      subs: []
    },
    {
      id: 'und-004',
      appId: null,
      instId: 'inst-005',
      instName: 'South India Pharmacy College (Demo)',
      condition: 'Submit Anti-Ragging Committee constitution and signed student declarations',
      due: dateOffset(30),
      evidence: 'Committee notification order and affidavit compilation',
      status: 'verified',
      owner: 'user-ro2',
      ownerName: 'Dr. Suresh Kumar',
      reg: 'reg-south',
      subs: [
        { id: 'sub-002', file: 'antiragging_affidavits.pdf', date: dateOffset(-10), actor: 'user-inst2', actorName: 'Dr. Asha Rao', status: 'accepted', notes: 'Verified and found compliant' }
      ]
    }
  ];

  undertakings.forEach(u => {
    insertUnd.run(u.id, u.appId, u.instId, u.instName, u.condition, u.due, u.evidence, u.status, u.owner, u.ownerName, u.reg, nowStr, nowStr);
    u.subs.forEach(s => {
      insertSub.run(s.id, u.id, s.file, null, s.date, s.actor, s.actorName, s.status, s.notes);
    });
  });

  // 8. Seed Documents
  const insertDoc = db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const documents = [
    ['doc-001', 'inst-001', 'Demo Technical Institute of Engineering', 'Lease Agreement', 'Registered land lease deed with Municipal Authority', '2020-04-01', '2020-04-01', dateOffset(45), 'expiring-soon', 'lease_agreement_mcd.pdf', null, 'reg-north', null, 'verified', 'user-ro1', dateOffset(-180), nowStr, nowStr],
    ['doc-002', 'inst-002', 'Southern Engineering College (Demo)', 'Campus Lease Agreement', 'Campus lease with State Industrial Development Corp', '2018-07-15', '2018-07-15', dateOffset(-10), 'expired', 'lease_tidc.pdf', null, 'reg-south', 'renewal-pending', 'pending', null, null, nowStr, nowStr],
    ['doc-003', 'inst-003', 'Western Polytechnic Institute (Demo)', 'Land Ownership Certificate', 'Perpetual title certificate from Sub-Registrar', '2023-01-10', '2023-01-10', null, 'valid', 'land_title_certificate.pdf', null, 'reg-west', null, 'verified', 'user-bo1', dateOffset(-60), nowStr, nowStr],
    ['doc-004', 'inst-004', 'Northern Management Academy (Demo)', 'Fire Safety Certificate', 'Fire NOC from State Fire Services', '2024-06-01', '2024-06-01', dateOffset(-30), 'expired', 'fire_noc_haryana.pdf', null, 'reg-north', null, 'expired', null, null, nowStr, nowStr],
    ['doc-005', 'inst-001', 'Demo Technical Institute of Engineering', 'Building Completion Certificate', 'Occupancy and building safety certificate', '2015-08-20', '2015-08-20', null, 'valid', 'bcc_academic_block.pdf', null, 'reg-north', null, 'verified', 'user-ro1', dateOffset(-200), nowStr, nowStr]
  ];
  documents.forEach(d => insertDoc.run(...d));

  // 9. Seed Escalation Rules
  const insertEsc = db.prepare('INSERT INTO escalation_rules VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const escalationRules = [
    ['esc-001', 'Application Scrutiny Delay', 'application_overdue', 5, 3, 'bureau_officer', 5, 'competent_authority', 10, 1, 1, nowStr],
    ['esc-002', 'Undertaking Compliance SLA Breach', 'undertaking_overdue', 0, 7, 'bureau_officer', 7, 'competent_authority', 15, 1, 1, nowStr],
    ['esc-003', 'Statutory Document Expiry Warning', 'document_expiry', 0, 60, 'regional_officer', 0, 'bureau_officer', 30, 1, 1, nowStr],
    ['esc-004', 'EVC Inspection Scheduling Delay', 'evc_scheduling_overdue', 10, 5, 'bureau_officer', 10, 'competent_authority', 15, 1, 1, nowStr]
  ];
  escalationRules.forEach(e => insertEsc.run(...e));

  // 10. Seed Notifications
  const insertNotif = db.prepare('INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const notifications = [
    ['ntf-001', 'deadline_approaching', 'Scrutiny deadline approaching', 'Application FG/NR/2026/0001 scrutiny deadline is in 3 days.', 'user-ro1', 'regional_officer', 'reg-north', null, 'application', 'app-001', 0, 0, 'delivered', dateOffset(-1) + 'T09:00:00Z'],
    ['ntf-002', 'overdue', 'Application Stage Overdue', 'Application FG/SR/2026/0003 scrutiny review is 5 days overdue.', 'user-ro2', 'regional_officer', 'reg-south', null, 'application', 'app-007', 0, 0, 'delivered', dateOffset(0) + 'T08:00:00Z'],
    ['ntf-003', 'escalation', 'SLA Escalation Level 1: Overdue Undertaking', 'Northern Management Academy compliance submission is 15 days overdue. Escalated to Bureau Officer.', 'user-bo1', 'bureau_officer', 'reg-north', null, 'undertaking', 'und-003', 1, 0, 'delivered', dateOffset(-2) + 'T10:00:00Z'],
    ['ntf-004', 'document_expiring', 'Statutory Lease Expiring', 'Lease agreement for Demo Technical Institute expires in 45 days. Renewal required.', 'user-inst1', 'institution', null, 'inst-001', 'document', 'doc-001', 0, 0, 'delivered', dateOffset(-3) + 'T07:00:00Z']
  ];
  notifications.forEach(n => insertNotif.run(...n));

  // 11. Seed Audit Trail
  const insertAudit = db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const audits = [
    ['aud-001', 'user-inst1', 'Rajesh Sharma', 'application_submitted', 'application', 'app-001', 'Submitted new program application: B.Tech CS & AI', null, null, '127.0.0.1', dateOffset(-12) + 'T10:00:00Z'],
    ['aud-002', 'user-ro1', 'Dr. Priya Mehta', 'application_assigned', 'application', 'app-001', 'Assigned application for regional scrutiny', null, null, '127.0.0.1', dateOffset(-10) + 'T11:00:00Z'],
    ['aud-003', 'user-ro1', 'Dr. Priya Mehta', 'application_returned', 'application', 'app-002', 'Returned application for library volume clarification', null, null, '127.0.0.1', dateOffset(-10) + 'T14:00:00Z'],
    ['aud-004', 'user-evc1', 'Prof. K. Ramachandran', 'evc_scheduled', 'evc', 'evc-002', 'Scheduled EVC visit for Western Polytechnic Institute', null, null, '127.0.0.1', dateOffset(-15) + 'T10:00:00Z'],
    ['aud-005', 'user-ca1', 'Dr. Meera Joshi', 'application_approved', 'application', 'app-006', 'Approved intake increase for B.Tech Mechanical Engineering', null, null, '127.0.0.1', dateOffset(-10) + 'T15:00:00Z'],
    ['aud-006', 'system', 'Escalation Engine', 'escalation_triggered', 'undertaking', 'und-003', 'Triggered Level 1 escalation for overdue balance sheet submission', null, null, '127.0.0.1', dateOffset(-2) + 'T10:00:00Z'],
    ['aud-007', 'user-admin', 'System Administrator', 'user_login', 'user', 'user-admin', 'Administrator signed into FlowGuard', null, null, '127.0.0.1', dateOffset(-1) + 'T08:00:00Z']
  ];
  audits.forEach(a => insertAudit.run(...a));
}

// Auto-seed if database is empty on load
initSchema();
seedDatabase(false);

module.exports = {
  db,
  initSchema,
  seedDatabase,
  hashPassword,
  verifyPassword
};
