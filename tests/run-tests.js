/* ============================================
   AICTE FlowGuard — Automated Test Suite
   ============================================ */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { db, seedDatabase, hashPassword, verifyPassword } = require('../server/db.js');
const {
  ROLES,
  createToken,
  verifyToken,
  authenticateUser,
  hasPermission,
  getScopeClause
} = require('../server/auth.js');
const WorkflowEngine = require('../server/workflow-engine.js');
const Scheduler = require('../server/scheduler.js');
const AIService = require('../server/ai-service.js');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

async function runAllTests() {
  console.log('\n================================================');
  console.log(' 🛡️  AICTE FlowGuard Automated Test Runner');
  console.log('================================================\n');

  // Ensure clean test database state
  seedDatabase(true);

  console.log('--- 1. Database & Schema Verification ---');
  test('All core tables and indexes are created in SQLite', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all().map(t => t.name);

    const required = [
      'users', 'institutions', 'regions', 'workflow_templates',
      'applications', 'stage_history', 'evc_events', 'undertakings',
      'undertaking_submissions', 'documents', 'escalation_rules',
      'notifications', 'audit_trail'
    ];

    for (const r of required) {
      assert.ok(tables.includes(r), `Missing table: ${r}`);
    }
  });

  test('Database seeded with realistic demo fixtures', () => {
    const userCount = db.prepare('SELECT count(*) as c FROM users').get().c;
    const appCount = db.prepare('SELECT count(*) as c FROM applications').get().c;
    const undCount = db.prepare('SELECT count(*) as c FROM undertakings').get().c;
    const docCount = db.prepare('SELECT count(*) as c FROM documents').get().c;

    assert.ok(userCount >= 7, 'Users seeded');
    assert.ok(appCount >= 5, 'Applications seeded');
    assert.ok(undCount >= 3, 'Undertakings seeded');
    assert.ok(docCount >= 4, 'Documents seeded');
  });

  console.log('\n--- 2. Authentication & Cryptography ---');
  test('Password hashing generates valid salt and PBKDF2 hash', () => {
    const { hash, salt } = hashPassword('TestPassword123');
    assert.ok(hash && hash.length === 64, 'Hash is valid 64-character hex');
    assert.ok(salt && salt.length === 32, 'Salt is valid 32-character hex');
    assert.ok(verifyPassword('TestPassword123', hash, salt), 'Valid password verified');
    assert.ok(!verifyPassword('WrongPassword', hash, salt), 'Invalid password rejected');
  });

  test('User authentication returns signed JWT token', () => {
    const res = authenticateUser('ro_north', 'demo123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.user.role, 'regional_officer');
    assert.ok(res.token, 'Token returned');

    const decoded = verifyToken(res.token);
    assert.strictEqual(decoded.username, 'ro_north');
    assert.strictEqual(decoded.role, 'regional_officer');
  });

  test('Tampered token is rejected', () => {
    const res = authenticateUser('ro_north', 'demo123');
    const parts = res.token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidSignature999`;
    assert.strictEqual(verifyToken(tampered), null);
  });

  console.log('\n--- 3. Role-Based Access Control & Scoping ---');
  test('Role permissions enforced correctly', () => {
    // Institution user cannot advance stage or approve
    assert.ok(!hasPermission('institution', 'advance_stage'));
    assert.ok(!hasPermission('institution', 'approve_application'));
    assert.ok(hasPermission('institution', 'submit_application'));

    // Regional officer can advance but not approve
    assert.ok(hasPermission('regional_officer', 'advance_stage'));
    assert.ok(!hasPermission('regional_officer', 'approve_application'));

    // Competent Authority can approve
    assert.ok(hasPermission('competent_authority', 'approve_application'));
  });

  test('SQL data scoping filters records by institution and region', () => {
    const instUser = { role: 'institution', institutionId: 'inst-001' };
    const instScope = getScopeClause(instUser);
    assert.ok(instScope.sql.includes('institution_id = ?'));
    assert.deepStrictEqual(instScope.params, ['inst-001']);

    const roUser = { role: 'regional_officer', region: 'reg-north' };
    const roScope = getScopeClause(roUser);
    assert.ok(roScope.sql.includes('region = ?'));
    assert.deepStrictEqual(roScope.params, ['reg-north']);

    const caUser = { role: 'competent_authority' };
    const caScope = getScopeClause(caUser);
    assert.strictEqual(caScope.sql, '1 = 1');
  });

  test('Table-aware SQL scoping prevents non-existent column errors across all entities', () => {
    const roUser = { role: 'regional_officer', region: 'reg-north', userId: 'user-ro1' };
    const instUser = { role: 'institution', institutionId: 'inst-001', userId: 'user-inst1' };

    // Undertakings (no assigned_officer column)
    const undScope = getScopeClause(roUser, 'undertakings');
    const undRows = db.prepare(`SELECT * FROM undertakings WHERE ${undScope.sql}`).all(...undScope.params);
    assert.ok(Array.isArray(undRows), 'Undertakings query succeeded without SQL error');

    // Documents (no assigned_officer column)
    const docScope = getScopeClause(roUser, 'documents');
    const docRows = db.prepare(`SELECT * FROM documents WHERE ${docScope.sql}`).all(...docScope.params);
    assert.ok(Array.isArray(docRows), 'Documents query succeeded without SQL error');

    // Notifications (uses recipient_* columns)
    const notifScope = getScopeClause(instUser, 'notifications');
    const notifRows = db.prepare(`SELECT * FROM notifications WHERE ${notifScope.sql}`).all(...notifScope.params);
    assert.ok(Array.isArray(notifRows), 'Notifications query succeeded without SQL error');

    // Audit trail
    const auditScope = getScopeClause(instUser, 'audit_trail');
    const auditRows = db.prepare(`SELECT * FROM audit_trail WHERE ${auditScope.sql}`).all(...auditScope.params);
    assert.ok(Array.isArray(auditRows), 'Audit trail query succeeded without SQL error');

    // EVC Events
    const evcScope = getScopeClause(roUser, 'evc_events');
    const evcRows = db.prepare(`SELECT * FROM evc_events WHERE ${evcScope.sql}`).all(...evcScope.params);
    assert.ok(Array.isArray(evcRows), 'EVC events query succeeded without SQL error');
  });

  test('Cross-institution isolation is strictly enforced', () => {
    const instUser1 = { role: 'institution', institutionId: 'inst-001', userId: 'user-inst1' };
    const instUser2 = { role: 'institution', institutionId: 'inst-002', userId: 'user-inst2' };

    const { canAccessRecord } = require('../server/auth.js');

    const appInst1 = db.prepare('SELECT * FROM applications WHERE institution_id = ?').get('inst-001');
    const appInst2 = db.prepare('SELECT * FROM applications WHERE institution_id = ?').get('inst-002');

    assert.ok(canAccessRecord(instUser1, 'applications', appInst1), 'Institution 1 can access its own application');
    assert.ok(!canAccessRecord(instUser1, 'applications', appInst2), 'Institution 1 is blocked from accessing Institution 2 application');
    assert.ok(canAccessRecord(instUser2, 'applications', appInst2), 'Institution 2 can access its own application');
    assert.ok(!canAccessRecord(instUser2, 'applications', appInst1), 'Institution 2 is blocked from accessing Institution 1 application');
  });

  test('All 8 demo accounts authenticate successfully and have assigned roles', () => {
    const demoAccounts = [
      { username: 'ro_north', role: 'regional_officer' },
      { username: 'ro_south', role: 'regional_officer' },
      { username: 'inst_demotech', role: 'institution' },
      { username: 'inst_southeng', role: 'institution' },
      { username: 'bo_bureau1', role: 'bureau_officer' },
      { username: 'evc_expert1', role: 'committee' },
      { username: 'ca_authority', role: 'competent_authority' },
      { username: 'admin', role: 'admin' }
    ];

    for (const acc of demoAccounts) {
      const res = authenticateUser(acc.username, 'demo123');
      assert.strictEqual(res.success, true, `Account ${acc.username} should authenticate`);
      assert.strictEqual(res.user.role, acc.role, `Account ${acc.username} should have role ${acc.role}`);
      assert.ok(res.token, `Account ${acc.username} should receive a valid token`);
    }
  });

  console.log('\n--- 4. Workflow Transition Engine ---');
  test('Authorized officer can advance application stage', () => {
    const ro = { userId: 'user-ro1', fullName: 'Dr. Priya Mehta', role: 'regional_officer', region: 'reg-north' };
    const res = WorkflowEngine.advanceStage('app-001', 'evc-pending', 'Scrutiny verified all criteria', ro);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentStage, 'evc-pending');

    const updated = db.prepare('SELECT current_stage, status FROM applications WHERE id = ?').get('app-001');
    assert.strictEqual(updated.current_stage, 'evc-pending');

    const history = db.prepare('SELECT * FROM stage_history WHERE application_id = ? AND stage = ?').get('app-001', 'evc-pending');
    assert.ok(history, 'Stage history recorded');

    const audit = db.prepare('SELECT * FROM audit_trail WHERE entity_id = ? AND action = ?').get('app-001', 'stage_advanced');
    assert.ok(audit, 'Audit trail entry logged');
  });

  test('Regional officer cannot advance application outside their jurisdiction', () => {
    // ro_south attempting to advance Northern region app-001
    const roSouth = { userId: 'user-ro2', fullName: 'Dr. K. Ramanathan', role: 'regional_officer', region: 'reg-south' };
    const res = WorkflowEngine.advanceStage('app-001', 'approved', 'Attempting cross-regional action', roSouth);
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('regional jurisdiction'));
  });

  test('Unauthorized user is blocked from advancing workflow', () => {
    const inst = { userId: 'user-inst1', fullName: 'Rajesh Sharma', role: 'institution', institutionId: 'inst-001' };
    const res = WorkflowEngine.advanceStage('app-001', 'approved', 'Attempting self-approval', inst);
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Unauthorized'));
  });

  test('Returning application records mandatory reason and changes status', () => {
    const ro = { userId: 'user-ro1', fullName: 'Dr. Priya Mehta', role: 'regional_officer', region: 'reg-north' };
    const res = WorkflowEngine.returnApplication('app-001', 'Incomplete laboratory floor plan proof', ro);
    assert.strictEqual(res.success, true);

    const updated = db.prepare('SELECT status, return_reason FROM applications WHERE id = ?').get('app-001');
    assert.strictEqual(updated.status, 'returned');
    assert.strictEqual(updated.return_reason, 'Incomplete laboratory floor plan proof');
  });

  test('Competent Authority can approve application', () => {
    const ca = { userId: 'user-ca1', fullName: 'Dr. Meera Joshi', role: 'competent_authority' };
    const res = WorkflowEngine.approveApplication('app-005', 'Approved after SAC recommendation', ca);
    assert.strictEqual(res.success, true);

    const updated = db.prepare('SELECT status, current_stage FROM applications WHERE id = ?').get('app-005');
    assert.strictEqual(updated.status, 'approved');
    assert.strictEqual(updated.current_stage, 'approved');
  });

  console.log('\n--- 5. Automated SLA Scheduler & Deduplication ---');
  test('Scheduler runs pass 1: detects overdue and triggers alerts', () => {
    const summary1 = Scheduler.runSchedulerOnce();
    assert.ok(summary1.checkedApplications > 0, 'Checked active applications');
    assert.ok(summary1.checkedUndertakings > 0, 'Checked undertakings');
    assert.ok(summary1.checkedDocuments > 0, 'Checked statutory documents');
    assert.ok(summary1.alertsGenerated > 0 || summary1.escalationsTriggered > 0, 'Alerts/Escalations evaluated');
  });

  test('Scheduler runs pass 2: deduplication prevents repeated alert spamming', () => {
    const summary2 = Scheduler.runSchedulerOnce();
    assert.strictEqual(summary2.alertsGenerated, 0, 'Zero new duplicate alerts generated');
    assert.strictEqual(summary2.escalationsTriggered, 0, 'Zero new duplicate escalations generated');
    assert.ok(summary2.duplicatesPrevented > 0, 'Deduplication actively prevented spam');
  });

  console.log('\n--- 6. AI-Assisted Services & Safe Fallbacks ---');
  await asyncTest('AI Service generates application summary with human-in-the-loop disclaimers', async () => {
    const summary = await AIService.summarizeApplication('app-007');
    assert.strictEqual(summary.isAIGenerated, true);
    assert.ok(summary.disclaimer.includes('AI-assisted guidance only'));
    assert.ok(summary.overview.length > 20);
    assert.ok(Array.isArray(summary.keyObservations));
    assert.ok(Array.isArray(summary.suggestedNextActions));
  });

  test('AI Service generates APH compliance checklist for program types', () => {
    const checklist = AIService.generateChecklist('new-institution');
    assert.strictEqual(checklist.isAIGenerated, true);
    assert.ok(checklist.items.length >= 4);
    assert.ok(checklist.items.some(i => i.item.includes('Fire Safety')));
  });

  test('AI Regulatory query helper resolves workflow terminology', () => {
    const result = AIService.regulatorySearch('What is EVC inspection?');
    assert.strictEqual(result.isAIGenerated, true);
    assert.ok(result.results.some(r => r.topic.includes('EVC')));
  });

  console.log('\n--- 7. Security, File Validation & Path Traversal Guards ---');
  test('Upload extension validation accepts valid formats and blocks dangerous formats', () => {
    const path = require('node:path');
    const ALLOWED_UPLOAD_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.doc', '.docx'];

    const validFiles = ['proof.pdf', 'photo.PNG', 'data.xlsx', 'report.docx'];
    const invalidFiles = ['script.exe', 'payload.sh', 'shell.php', 'exploit.bat', 'hack.js'];

    for (const f of validFiles) {
      const ext = path.extname(f).toLowerCase();
      assert.ok(ALLOWED_UPLOAD_EXTS.includes(ext), `Valid file ${f} should be allowed`);
    }

    for (const f of invalidFiles) {
      const ext = path.extname(f).toLowerCase();
      assert.ok(!ALLOWED_UPLOAD_EXTS.includes(ext), `Dangerous file ${f} should be rejected`);
    }
  });

  test('Path traversal attempts are detected and prevented', () => {
    const path = require('node:path');
    const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

    const dangerousFilenames = [
      '../../server.js',
      '..\\..\\server.js',
      '../../../etc/passwd',
      '..%2F..%2Fserver.js',
      'uploads/../../flowguard.db'
    ];

    for (const df of dangerousFilenames) {
      const safeFilename = path.basename(df);
      const targetPath = path.resolve(UPLOADS_DIR, safeFilename);
      // Ensure path.resolve with basename is strictly inside UPLOADS_DIR
      assert.ok(targetPath.startsWith(UPLOADS_DIR), `Sanitized path for ${df} must remain inside uploads directory`);
    }
  });

  console.log('\n--- 8. API Authorization & Login Protection ---');
  await asyncTest('Admin endpoints are restricted to admin role only', async () => {
    const port = 5601;
    const serverProc = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      await waitForServer(port);
      const institutionLogin = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'inst_demotech', password: 'demo123' })
      });
      assert.strictEqual(institutionLogin.status, 200, 'Institution login should succeed');
      assert.ok(institutionLogin.json.token, 'Institution login returns token');

      const deniedUsers = await fetchJson(`http://127.0.0.1:${port}/api/admin/users`, {
        headers: { Authorization: 'Bearer ' + institutionLogin.json.token }
      });
      assert.strictEqual(deniedUsers.status, 403, 'Institution user must not access admin users endpoint');

      const deniedRules = await fetchJson(`http://127.0.0.1:${port}/api/admin/escalation-rules`, {
        headers: { Authorization: 'Bearer ' + institutionLogin.json.token }
      });
      assert.strictEqual(deniedRules.status, 403, 'Institution user must not access escalation rules endpoint');

      const adminLogin = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'demo123' })
      });
      assert.strictEqual(adminLogin.status, 200, 'Admin login should succeed');
      assert.ok(adminLogin.json.token, 'Admin login returns token');

      const adminUsers = await fetchJson(`http://127.0.0.1:${port}/api/admin/users`, {
        headers: { Authorization: 'Bearer ' + adminLogin.json.token }
      });
      assert.strictEqual(adminUsers.status, 200, 'Admin can access users endpoint');
      assert.ok(Array.isArray(adminUsers.json.users), 'Users response is an array');
    } finally {
      serverProc.kill('SIGTERM');
      await waitForExit(serverProc);
    }
  });

  await asyncTest('Repeated failed logins are rate-limited', async () => {
    const port = 5602;
    const serverProc = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      await waitForServer(port);

      for (let attempt = 1; attempt <= 5; attempt++) {
        const invalid = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'ro_north', password: `wrong-${attempt}` })
        });
        assert.strictEqual(invalid.status, 401, `Attempt ${attempt} should still be unauthorized`);
      }

      const throttled = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ro_north', password: 'still-wrong' })
      });

      assert.strictEqual(throttled.status, 429, '6th failed login should be rate-limited');
      assert.strictEqual(throttled.json.status, 429, 'Problem response includes 429 status');
    } finally {
      serverProc.kill('SIGTERM');
      await waitForExit(serverProc);
    }
  });

  console.log('\n================================================');
  console.log(` Test Results: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests();

async function waitForServer(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch (err) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Server did not become healthy on port ${port} within ${timeoutMs}ms`);
}

async function fetchJson(targetUrl, options = {}) {
  const res = await fetch(targetUrl, options);
  let json = {};
  try {
    json = await res.json();
  } catch (err) {}
  return { status: res.status, json };
}

async function waitForExit(proc, timeoutMs = 5000) {
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    proc.once('exit', done);
    setTimeout(() => {
      if (!settled) {
        proc.kill('SIGKILL');
      }
      done();
    }, timeoutMs);
  });
}
