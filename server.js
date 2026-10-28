/* ============================================
   AICTE FlowGuard — Full-Stack Server & REST API
   ============================================ */

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const url = require('node:url');

const { db, seedDatabase, hashPassword } = require('./server/db.js');
const {
  ROLES,
  authenticateUser,
  getSessionFromRequest,
  hasPermission,
  getScopeClause
} = require('./server/auth.js');
const WorkflowEngine = require('./server/workflow-engine.js');
const Scheduler = require('./server/scheduler.js');
const AIService = require('./server/ai-service.js');

const PORT = process.env.PORT || 5500;
const PUBLIC_DIR = path.join(__dirname);
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// JSON response helper
function sendJSON(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// Parse request body
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({ raw: body });
      }
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // -------------------------------------------------------------
  // API ROUTING
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    const session = getSessionFromRequest(req);

    // 1. Health Check
    if (pathname === '/api/health' && method === 'GET') {
      return sendJSON(res, 200, {
        status: 'healthy',
        platform: 'AICTE FlowGuard',
        version: '2.0.0',
        environment: 'SIH-2026',
        database: 'node:sqlite (WAL Mode)',
        scheduler: 'active',
        timestamp: new Date().toISOString()
      });
    }

    // 2. Authentication: Login
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.username || !body.password) {
        return sendJSON(res, 400, { error: 'Username and password required' });
      }
      const result = authenticateUser(body.username, body.password);
      if (!result.success) {
        return sendJSON(res, 401, { error: result.error });
      }
      const cookie = `flowguard_token=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`;
      return sendJSON(res, 200, { success: true, user: result.user, token: result.token }, { 'Set-Cookie': cookie });
    }

    // 3. Authentication: Logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
      if (session) {
        db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'aud-' + Date.now().toString(36),
          session.userId,
          session.fullName,
          'user_logout',
          'user',
          session.userId,
          `${session.fullName} signed out`,
          null,
          null,
          '127.0.0.1',
          new Date().toISOString()
        );
      }
      return sendJSON(res, 200, { success: true }, { 'Set-Cookie': 'flowguard_token=; Path=/; Max-Age=0' });
    }

    // 4. Authentication: Me
    if (pathname === '/api/auth/me' && method === 'GET') {
      if (!session) return sendJSON(res, 401, { error: 'Not authenticated' });
      return sendJSON(res, 200, { user: session, roles: ROLES });
    }

    // --- PROTECTED ROUTES BELOW ---
    if (!session) {
      return sendJSON(res, 401, { error: 'Unauthorized: Valid session token required' });
    }

    // 5. Applications: List
    if (pathname === '/api/applications' && method === 'GET') {
      const scope = getScopeClause(session);
      let query = `SELECT * FROM applications WHERE ${scope.sql}`;
      const params = [...scope.params];

      if (parsedUrl.query.status) {
        query += ' AND status = ?';
        params.push(parsedUrl.query.status);
      }
      if (parsedUrl.query.region) {
        query += ' AND region = ?';
        params.push(parsedUrl.query.region);
      }
      if (parsedUrl.query.type) {
        query += ' AND type = ?';
        params.push(parsedUrl.query.type);
      }
      if (parsedUrl.query.search) {
        query += ' AND (application_number LIKE ? OR institution_name LIKE ? OR program_name LIKE ?)';
        const s = `%${parsedUrl.query.search}%`;
        params.push(s, s, s);
      }

      query += ' ORDER BY submitted_date DESC';
      const apps = db.prepare(query).all(...params);

      // Parse JSON strings
      apps.forEach(a => {
        if (typeof a.attachments === 'string') {
          try { a.attachments = JSON.parse(a.attachments); } catch(e) { a.attachments = []; }
        }
      });

      return sendJSON(res, 200, { applications: apps });
    }

    // 6. Applications: Detail
    if (pathname.match(/^\/api\/applications\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const scope = getScopeClause(session);
      const app = db.prepare(`SELECT * FROM applications WHERE id = ? AND (${scope.sql})`).get(id, ...scope.params);
      if (!app) return sendJSON(res, 404, { error: 'Application not found or access restricted' });

      if (typeof app.attachments === 'string') {
        try { app.attachments = JSON.parse(app.attachments); } catch(e) { app.attachments = []; }
      }

      const history = db.prepare('SELECT * FROM stage_history WHERE application_id = ? ORDER BY date DESC').all(id);
      const audits = db.prepare('SELECT * FROM audit_trail WHERE entity_id = ? ORDER BY timestamp DESC').all(id);
      const evc = db.prepare('SELECT * FROM evc_events WHERE application_id = ?').get(id);
      const undertakings = db.prepare('SELECT * FROM undertakings WHERE application_id = ?').all(id);
      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(app.workflow_template_id);

      return sendJSON(res, 200, {
        application: app,
        stageHistory: history,
        audits,
        evc,
        undertakings,
        template: template ? { ...template, stages: JSON.parse(template.stages) } : null
      });
    }

    // 7. Applications: Create
    if (pathname === '/api/applications' && method === 'POST') {
      if (!hasPermission(session.role, 'submit_application')) {
        return sendJSON(res, 403, { error: 'Forbidden: Role not authorized to submit applications' });
      }
      const body = await parseBody(req);
      if (!body.programName || !body.workflowTemplateId) {
        return sendJSON(res, 400, { error: 'Program name and workflow template required' });
      }

      const instId = session.institutionId || body.institutionId;
      const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId);
      if (!inst) return sendJSON(res, 400, { error: 'Invalid institution' });

      const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(body.workflowTemplateId);
      if (!template) return sendJSON(res, 400, { error: 'Invalid workflow template' });

      const stages = JSON.parse(template.stages);
      const firstStage = stages[0]?.id || 'scrutiny';
      const firstSlaDays = stages[0]?.timelineDays || 15;

      const year = new Date().getFullYear();
      const count = db.prepare('SELECT COUNT(*) as c FROM applications').get().c + 1;
      const seq = String(count).padStart(4, '0');
      const regRow = db.prepare('SELECT code FROM regions WHERE id = ?').get(inst.region);
      const regCode = regRow?.code || 'NR';
      const appNumber = `FG/${regCode}/${year}/${seq}`;
      const appId = 'app-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
      const now = new Date().toISOString();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + firstSlaDays);

      db.prepare(`
        INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        appId,
        appNumber,
        inst.id,
        inst.name,
        body.type || 'new-program',
        body.programName,
        template.id,
        firstStage,
        firstStage,
        inst.region,
        null,
        null,
        now.split('T')[0],
        dueDate.toISOString().split('T')[0],
        body.notes || '',
        null,
        JSON.stringify(body.attachments || ['application_form.pdf']),
        body.priority || (body.type === 'new-institution' ? 'high' : 'normal'),
        body.type === 'new-institution' ? 1 : 0,
        now,
        now
      );

      // Record stage history
      db.prepare('INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        'hist-' + Date.now().toString(36),
        appId,
        'submitted',
        'Application Submitted',
        session.userId,
        session.fullName,
        now,
        body.notes || 'Application submitted'
      );

      // Record audit
      db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'aud-' + Date.now().toString(36),
        session.userId,
        session.fullName,
        'application_submitted',
        'application',
        appId,
        `Submitted application ${appNumber} (${body.programName})`,
        null,
        null,
        '127.0.0.1',
        now
      );

      return sendJSON(res, 201, { success: true, applicationId: appId, applicationNumber: appNumber });
    }

    // 8. Applications: Advance Stage
    if (pathname.match(/^\/api\/applications\/[^/]+\/advance$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const result = WorkflowEngine.advanceStage(id, body.nextStage, body.notes, session);
      return sendJSON(res, result.success ? 200 : 400, result);
    }

    // 9. Applications: Return
    if (pathname.match(/^\/api\/applications\/[^/]+\/return$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const result = WorkflowEngine.returnApplication(id, body.returnReason, session);
      return sendJSON(res, result.success ? 200 : 400, result);
    }

    // 10. Applications: Approve
    if (pathname.match(/^\/api\/applications\/[^/]+\/approve$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const result = WorkflowEngine.approveApplication(id, body.notes, session);
      return sendJSON(res, result.success ? 200 : 400, result);
    }

    // 11. Applications: Reject
    if (pathname.match(/^\/api\/applications\/[^/]+\/reject$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const result = WorkflowEngine.rejectApplication(id, body.rejectionReason, session);
      return sendJSON(res, result.success ? 200 : 400, result);
    }

    // 12. EVC Events: List
    if (pathname === '/api/evc' && method === 'GET') {
      const scope = getScopeClause(session);
      let query = `SELECT * FROM evc_events WHERE 1=1`;
      const params = [];
      if (session.role === 'committee') {
        query += ' AND (committee_id = ? OR committee_id IS NULL)';
        params.push(session.userId);
      } else if (session.role === 'regional_officer') {
        query += ' AND region = ?';
        params.push(session.region);
      }
      query += ' ORDER BY created_at DESC';
      const events = db.prepare(query).all(...params);
      return sendJSON(res, 200, { evcEvents: events });
    }

    // 13. EVC: Schedule
    if (pathname.match(/^\/api\/evc\/[^/]+\/schedule$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const now = new Date().toISOString();

      const expert = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(body.expertId);
      if (!expert) return sendJSON(res, 400, { error: 'Invalid committee expert selected' });

      db.prepare(`
        UPDATE evc_events
        SET status = 'scheduled',
            committee_id = ?,
            committee_name = ?,
            planned_date = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?
      `).run(expert.id, expert.full_name, body.plannedDate, body.notes || '', now, id);

      const evt = db.prepare('SELECT * FROM evc_events WHERE id = ?').get(id);

      // Advance app status if pending
      if (evt && evt.application_id) {
        db.prepare(`
          UPDATE applications
          SET status = 'evc-scheduled', current_stage = 'evc-scheduled', updated_at = ?
          WHERE id = ? AND status = 'evc-pending'
        `).run(now, evt.application_id);
      }

      // Record audit
      db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'aud-' + Date.now().toString(36),
        session.userId,
        session.fullName,
        'evc_scheduled',
        'evc',
        id,
        `Scheduled EVC inspection for ${evt.institution_name} on ${body.plannedDate} lead by ${expert.full_name}`,
        null,
        null,
        '127.0.0.1',
        now
      );

      return sendJSON(res, 200, { success: true, message: 'EVC inspection scheduled successfully' });
    }

    // 14. EVC: Submit Report
    if (pathname.match(/^\/api\/evc\/[^/]+\/report$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const now = new Date().toISOString();

      const fullReport = `[Recommendation: ${(body.recommendation || 'FAVORABLE').toUpperCase()}]\n${body.report}`;

      db.prepare(`
        UPDATE evc_events
        SET status = 'completed',
            completed_date = ?,
            report = ?,
            updated_at = ?
        WHERE id = ?
      `).run(body.completedDate || now.split('T')[0], fullReport, now, id);

      const evt = db.prepare('SELECT * FROM evc_events WHERE id = ?').get(id);

      if (evt && evt.application_id) {
        db.prepare(`
          UPDATE applications
          SET status = 'evc-completed', current_stage = 'evc-completed', updated_at = ?
          WHERE id = ?
        `).run(now, evt.application_id);

        db.prepare('INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          'hist-' + Date.now().toString(36),
          evt.application_id,
          'evc-completed',
          'EVC Inspection Report Filed',
          session.userId,
          session.fullName,
          now,
          fullReport
        );
      }

      // Audit
      db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'aud-' + Date.now().toString(36),
        session.userId,
        session.fullName,
        'evc_completed',
        'evc',
        id,
        `EVC report filed for ${evt.institution_name}: ${body.recommendation}`,
        null,
        null,
        '127.0.0.1',
        now
      );

      return sendJSON(res, 200, { success: true, message: 'EVC report filed successfully' });
    }

    // 15. Undertakings: List
    if (pathname === '/api/undertakings' && method === 'GET') {
      const scope = getScopeClause(session);
      let query = `SELECT * FROM undertakings WHERE ${scope.sql} ORDER BY due_date ASC`;
      const unds = db.prepare(query).all(...scope.params);

      // Attach submissions
      for (const u of unds) {
        u.submissions = db.prepare('SELECT * FROM undertaking_submissions WHERE undertaking_id = ? ORDER BY submitted_at ASC').all(u.id);
      }

      return sendJSON(res, 200, { undertakings: unds });
    }

    // 16. Undertakings: Create
    if (pathname === '/api/undertakings' && method === 'POST') {
      const body = await parseBody(req);
      const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(body.institutionId);
      if (!inst) return sendJSON(res, 400, { error: 'Invalid institution' });

      const id = 'und-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO undertakings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        body.applicationId || null,
        inst.id,
        inst.name,
        body.condition,
        body.dueDate,
        body.requiredEvidence,
        'pending',
        body.verificationOwnerId || session.userId,
        body.verificationOwnerName || session.fullName,
        inst.region,
        now,
        now
      );

      return sendJSON(res, 201, { success: true, undertakingId: id });
    }

    // 17. Undertakings: Submit Evidence
    if (pathname.match(/^\/api\/undertakings\/[^/]+\/submit-evidence$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const now = new Date().toISOString();

      const subId = 'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
      db.prepare(`
        INSERT INTO undertaking_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subId,
        id,
        body.fileName || 'compliance_evidence.pdf',
        body.storedPath || null,
        now,
        session.userId,
        session.fullName,
        'under-review',
        body.notes || ''
      );

      db.prepare("UPDATE undertakings SET status = 'submitted', updated_at = ? WHERE id = ?").run(now, id);

      return sendJSON(res, 200, { success: true, submissionId: subId });
    }

    // 18. Undertakings: Review
    if (pathname.match(/^\/api\/undertakings\/[^/]+\/review$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const now = new Date().toISOString();

      db.prepare("UPDATE undertakings SET status = ?, updated_at = ? WHERE id = ?").run(body.decision, now, id);

      db.prepare(`
        UPDATE undertaking_submissions
        SET status = ?, review_notes = ?
        WHERE undertaking_id = ?
        ORDER BY submitted_at DESC LIMIT 1
      `).run(body.decision === 'verified' ? 'accepted' : body.decision, body.reviewNotes || '', id);

      return sendJSON(res, 200, { success: true, status: body.decision });
    }

    // 19. Documents: List
    if (pathname === '/api/documents' && method === 'GET') {
      const scope = getScopeClause(session);
      const docs = db.prepare(`SELECT * FROM documents WHERE ${scope.sql} ORDER BY expiry_date ASC`).all(...scope.params);
      return sendJSON(res, 200, { documents: docs });
    }

    // 20. Documents: Add
    if (pathname === '/api/documents' && method === 'POST') {
      const body = await parseBody(req);
      const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(session.institutionId || body.institutionId);
      if (!inst) return sendJSON(res, 400, { error: 'Invalid institution' });

      const id = 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        inst.id,
        inst.name,
        body.type,
        body.description || '',
        body.issueDate,
        body.effectiveDate || body.issueDate,
        body.expiryDate || null,
        'valid',
        body.fileName || 'document.pdf',
        body.storedPath || null,
        inst.region,
        null,
        'pending',
        null,
        null,
        now,
        now
      );

      return sendJSON(res, 201, { success: true, documentId: id });
    }

    // 21. Documents: Renew
    if (pathname.match(/^\/api\/documents\/[^/]+\/renew$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const body = await parseBody(req);
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE documents
        SET issue_date = ?,
            expiry_date = ?,
            file_name = ?,
            status = 'valid',
            renewal_status = 'renewed',
            verification_status = 'pending',
            updated_at = ?
        WHERE id = ?
      `).run(body.issueDate, body.expiryDate, body.fileName, now, id);

      return sendJSON(res, 200, { success: true, message: 'Document renewal submitted' });
    }

    // 22. Documents: Verify
    if (pathname.match(/^\/api\/documents\/[^/]+\/verify$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE documents
        SET verification_status = 'verified',
            verified_by = ?,
            verified_date = ?,
            updated_at = ?
        WHERE id = ?
      `).run(session.userId, now, now, id);

      return sendJSON(res, 200, { success: true, message: 'Document verified' });
    }

    // 23. Notifications: List
    if (pathname === '/api/notifications' && method === 'GET') {
      const notifs = db.prepare(`
        SELECT * FROM notifications
        WHERE recipient_id = ?
           OR recipient_role = ?
           OR (recipient_region = ? AND ? IN ('regional_officer', 'bureau_officer'))
           OR (recipient_institution = ? AND ? = 'institution')
        ORDER BY created_at DESC
        LIMIT 50
      `).all(session.userId, session.role, session.region, session.role, session.institutionId, session.role);

      return sendJSON(res, 200, { notifications: notifs });
    }

    // 24. Notifications: Mark Read
    if (pathname.match(/^\/api\/notifications\/[^/]+\/read$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
      return sendJSON(res, 200, { success: true });
    }

    // 25. Notifications: Mark All Read
    if (pathname === '/api/notifications/read-all' && method === 'POST') {
      db.prepare(`
        UPDATE notifications
        SET read = 1
        WHERE recipient_id = ? OR recipient_role = ?
      `).run(session.userId, session.role);
      return sendJSON(res, 200, { success: true });
    }

    // 26. Notifications: Simulate Escalation
    if (pathname === '/api/notifications/simulate-escalation' && method === 'POST') {
      const id = 'ntf-' + Date.now().toString(36);
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        'escalation',
        'CRITICAL ESCALATION: SLA Stage Breach Alert',
        `Urgent escalation triggered: Application FG/SR/2026/0003 overdue by 5+ days. Escalated for senior officer review.`,
        session.userId,
        session.role,
        session.region,
        null,
        'application',
        'app-007',
        2,
        0,
        'delivered',
        now
      );
      return sendJSON(res, 200, { success: true, notificationId: id });
    }

    // 27. Reports & Analytics
    if (pathname === '/api/reports/stats' && method === 'GET') {
      const totalApps = db.prepare('SELECT COUNT(*) as c FROM applications').get().c;
      const approvedApps = db.prepare("SELECT COUNT(*) as c FROM applications WHERE status = 'approved'").get().c;
      const overdueApps = db.prepare("SELECT COUNT(*) as c FROM applications WHERE current_stage_due_date < date('now') AND status NOT IN ('approved', 'rejected', 'cancelled')").get().c;
      const pendingUnd = db.prepare("SELECT COUNT(*) as c FROM undertakings WHERE status IN ('pending', 'overdue')").get().c;
      const verifiedUnd = db.prepare("SELECT COUNT(*) as c FROM undertakings WHERE status = 'verified'").get().c;
      const totalUnd = db.prepare('SELECT COUNT(*) as c FROM undertakings').get().c;

      const stageCounts = db.prepare('SELECT current_stage as stage, COUNT(*) as count FROM applications GROUP BY current_stage').all();
      const regionPerformance = db.prepare(`
        SELECT r.id, r.name, r.code, r.states,
               COUNT(a.id) as total,
               SUM(CASE WHEN a.status = 'approved' THEN 1 ELSE 0 END) as approved,
               SUM(CASE WHEN a.current_stage_due_date < date('now') AND a.status NOT IN ('approved', 'rejected') THEN 1 ELSE 0 END) as overdue
        FROM regions r
        LEFT JOIN applications a ON r.id = a.region
        GROUP BY r.id
      `).all();

      regionPerformance.forEach(r => {
        try { r.states = JSON.parse(r.states); } catch(e) { r.states = []; }
        r.sla = r.total > 0 ? Math.round(((r.total - r.overdue) / r.total) * 100) : 100;
      });

      return sendJSON(res, 200, {
        kpis: {
          totalApplications: totalApps,
          approvedApplications: approvedApps,
          overdueApplications: overdueApps,
          approvalRate: totalApps > 0 ? Math.round((approvedApps / totalApps) * 100) : 0,
          slaComplianceRate: totalApps > 0 ? Math.round(((totalApps - overdueApps) / totalApps) * 100) : 100,
          undertakingsComplianceRate: totalUnd > 0 ? Math.round((verifiedUnd / totalUnd) * 100) : 0,
          pendingUndertakings: pendingUnd
        },
        stageCounts,
        regionPerformance
      });
    }

    // 28. Audit Trail: List
    if (pathname === '/api/audit' && method === 'GET') {
      const audits = db.prepare('SELECT * FROM audit_trail ORDER BY timestamp DESC LIMIT 100').all();
      return sendJSON(res, 200, { audits });
    }

    // 29. Admin: Workflows
    if (pathname === '/api/admin/workflows' && method === 'GET') {
      const tmpls = db.prepare('SELECT * FROM workflow_templates').all();
      tmpls.forEach(t => {
        try { t.stages = JSON.parse(t.stages); } catch(e) {}
        try { t.applicableTo = JSON.parse(t.applicable_to); } catch(e) {}
      });
      return sendJSON(res, 200, { templates: tmpls });
    }

    // 30. Admin: Escalation Rules
    if (pathname === '/api/admin/escalation-rules' && method === 'GET') {
      const rules = db.prepare('SELECT * FROM escalation_rules').all();
      return sendJSON(res, 200, { escalationRules: rules });
    }

    // 31. Admin: Users
    if (pathname === '/api/admin/users' && method === 'GET') {
      const users = db.prepare('SELECT id, username, full_name, role, region, institution_id, email, active, created_at FROM users').all();
      return sendJSON(res, 200, { users });
    }

    // 32. Admin: Reset Demo Data
    if (pathname === '/api/admin/reset-seed' && method === 'POST') {
      if (session.role !== 'admin') {
        return sendJSON(res, 403, { error: 'Admin role required' });
      }
      seedDatabase(true);
      return sendJSON(res, 200, { success: true, message: 'Database reset to demo seed data' });
    }

    // 33. Scheduler: Manual Trigger
    if (pathname === '/api/scheduler/run' && method === 'POST') {
      const summary = Scheduler.runSchedulerOnce();
      return sendJSON(res, 200, { success: true, summary });
    }

    // 34. AI Assistant: Summarize Application
    if (pathname === '/api/ai/summarize-application' && method === 'POST') {
      const body = await parseBody(req);
      const summary = await AIService.summarizeApplication(body.applicationId);
      return sendJSON(res, 200, summary);
    }

    // 35. AI Assistant: Document Checklist
    if (pathname === '/api/ai/document-checklist' && method === 'POST') {
      const body = await parseBody(req);
      const checklist = AIService.generateChecklist(body.applicationType);
      return sendJSON(res, 200, checklist);
    }

    // 36. AI Assistant: Search Assistant
    if (pathname === '/api/ai/search-assistant' && method === 'POST') {
      const body = await parseBody(req);
      const result = AIService.regulatorySearch(body.query);
      return sendJSON(res, 200, result);
    }

    // Unmatched API endpoint
    return sendJSON(res, 404, { error: 'API endpoint not found' });
  }

  // -------------------------------------------------------------
  // STATIC FILE SERVING
  // -------------------------------------------------------------
  let relativePath = pathname.substring(1);
  if (!relativePath || relativePath === '/') {
    relativePath = 'index.html';
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  // Security check: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

// Start Background SLA Scheduler (runs every 60 seconds)
Scheduler.startScheduler(60000);

server.listen(PORT, () => {
  console.log(`
  ==============================================================
   🛡️  AICTE FlowGuard Full-Stack Platform Active!
   --------------------------------------------------------------
   🌐 Web Application URL : http://localhost:${PORT}
   🏥 API Health Check    : http://localhost:${PORT}/api/health
   🗄️ Database Engine     : Native node:sqlite (data/flowguard.db)
   ⏱️ SLA Scheduler       : Active (Due date checks & escalations)
  ==============================================================
  `);
});
