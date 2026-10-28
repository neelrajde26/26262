/* ============================================
   AICTE FlowGuard — Automated SLA Scheduler & Escalation Engine
   Safe for repeated runs without duplicate alerts
   ============================================ */

const { db } = require('./db.js');

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  const diffTime = target - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function hasRecentAlert(entityType, entityId, alertType, escalationLevel = 0) {
  const check = db.prepare(`
    SELECT id FROM notifications
    WHERE entity_type = ?
      AND entity_id = ?
      AND type = ?
      AND escalation_level = ?
      AND datetime(created_at) > datetime('now', '-24 hours')
    LIMIT 1
  `).get(entityType, entityId, alertType, escalationLevel);

  return !!check;
}

function createNotification(notif) {
  const id = 'ntf-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    notif.type,
    notif.title,
    notif.message,
    notif.recipientId || null,
    notif.recipientRole || null,
    notif.recipientRegion || null,
    notif.recipientInstitution || null,
    notif.entityType,
    notif.entityId,
    notif.escalationLevel || 0,
    0,
    'in_app',
    now
  );

  return id;
}

const Scheduler = {
  // Execute a single pass of SLA due-date checks and escalation evaluation
  runSchedulerOnce() {
    const summary = {
      timestamp: new Date().toISOString(),
      checkedApplications: 0,
      checkedUndertakings: 0,
      checkedDocuments: 0,
      checkedEvc: 0,
      alertsGenerated: 0,
      escalationsTriggered: 0,
      duplicatesPrevented: 0
    };

    // Load active escalation rules
    const rules = db.prepare('SELECT * FROM escalation_rules WHERE active = 1').all();
    const appRule = rules.find(r => r.trigger_type === 'application_overdue');
    const undRule = rules.find(r => r.trigger_type === 'undertaking_overdue');
    const docRule = rules.find(r => r.trigger_type === 'document_expiry');
    const evcRule = rules.find(r => r.trigger_type === 'evc_scheduling_overdue');

    // 1. Check Applications
    const activeApps = db.prepare(`
      SELECT * FROM applications
      WHERE status NOT IN ('approved', 'rejected', 'cancelled')
        AND current_stage_due_date IS NOT NULL
    `).all();

    summary.checkedApplications = activeApps.length;

    for (const app of activeApps) {
      const days = daysUntil(app.current_stage_due_date);

      // A. Approaching deadline
      if (days !== null && days >= 0 && days <= (appRule?.reminder_days || 3)) {
        if (!hasRecentAlert('application', app.id, 'deadline_approaching', 0)) {
          createNotification({
            type: 'deadline_approaching',
            title: 'Stage Deadline Approaching',
            message: `Application ${app.application_number} (${app.institution_name}) scrutiny/stage due in ${days} day(s).`,
            recipientRole: 'regional_officer',
            recipientRegion: app.region,
            entityType: 'application',
            entityId: app.id,
            escalationLevel: 0
          });
          summary.alertsGenerated++;
        } else {
          summary.duplicatesPrevented++;
        }
      }

      // B. Overdue
      if (days !== null && days < 0) {
        const overdueDays = Math.abs(days);

        // Standard Overdue Alert
        if (!hasRecentAlert('application', app.id, 'overdue', 0)) {
          createNotification({
            type: 'overdue',
            title: 'Application Stage Overdue',
            message: `Application ${app.application_number} stage SLA is ${overdueDays} day(s) overdue.`,
            recipientRole: 'regional_officer',
            recipientRegion: app.region,
            entityType: 'application',
            entityId: app.id,
            escalationLevel: 0
          });
          summary.alertsGenerated++;
        } else {
          summary.duplicatesPrevented++;
        }

        // Escalation Level 1
        const l1Days = appRule?.escalation_level1_days || 5;
        if (overdueDays >= l1Days) {
          if (!hasRecentAlert('application', app.id, 'escalation', 1)) {
            createNotification({
              type: 'escalation',
              title: `Level 1 Escalation: Stage Delay (${overdueDays}d overdue)`,
              message: `Application ${app.application_number} exceeded scrutiny SLA by ${overdueDays} days. Escalated to ${appRule?.escalation_level1_role || 'Bureau Officer'}.`,
              recipientRole: appRule?.escalation_level1_role || 'bureau_officer',
              recipientRegion: app.region,
              entityType: 'application',
              entityId: app.id,
              escalationLevel: 1
            });
            summary.escalationsTriggered++;
          } else {
            summary.duplicatesPrevented++;
          }
        }

        // Escalation Level 2
        const l2Days = appRule?.escalation_level2_days || 10;
        if (overdueDays >= l2Days) {
          if (!hasRecentAlert('application', app.id, 'escalation', 2)) {
            createNotification({
              type: 'escalation',
              title: `CRITICAL Level 2 Escalation: Severe Stage SLA Breach`,
              message: `Application ${app.application_number} is ${overdueDays} days overdue. Escalated to Competent Authority for priority intervention.`,
              recipientRole: appRule?.escalation_level2_role || 'competent_authority',
              entityType: 'application',
              entityId: app.id,
              escalationLevel: 2
            });
            summary.escalationsTriggered++;
          } else {
            summary.duplicatesPrevented++;
          }
        }
      }
    }

    // 2. Check Undertakings
    const activeUndertakings = db.prepare(`
      SELECT * FROM undertakings
      WHERE status IN ('pending', 'submitted', 'overdue')
    `).all();

    summary.checkedUndertakings = activeUndertakings.length;

    for (const und of activeUndertakings) {
      const days = daysUntil(und.due_date);

      if (days !== null && days < 0) {
        const overdueDays = Math.abs(days);

        // Update undertaking status to overdue if still pending
        if (und.status === 'pending') {
          db.prepare("UPDATE undertakings SET status = 'overdue', updated_at = datetime('now') WHERE id = ?").run(und.id);
        }

        // Escalation Level 1
        const l1Days = undRule?.escalation_level1_days || 7;
        if (overdueDays >= l1Days) {
          if (!hasRecentAlert('undertaking', und.id, 'escalation', 1)) {
            createNotification({
              type: 'escalation',
              title: 'Escalation: Institutional Compliance Undertaking Overdue',
              message: `${und.institution_name} has breached compliance undertaking deadline by ${overdueDays} days. Escalated for enforcement review.`,
              recipientRole: undRule?.escalation_level1_role || 'bureau_officer',
              recipientRegion: und.region,
              entityType: 'undertaking',
              entityId: und.id,
              escalationLevel: 1
            });
            summary.escalationsTriggered++;
          } else {
            summary.duplicatesPrevented++;
          }
        }
      }
    }

    // 3. Check Documents
    const statutoryDocs = db.prepare(`
      SELECT * FROM documents
      WHERE expiry_date IS NOT NULL
    `).all();

    summary.checkedDocuments = statutoryDocs.length;

    for (const doc of statutoryDocs) {
      const days = daysUntil(doc.expiry_date);

      if (days !== null) {
        if (days < 0 && doc.status !== 'expired' && doc.status !== 'renewal-pending') {
          db.prepare("UPDATE documents SET status = 'expired', updated_at = datetime('now') WHERE id = ?").run(doc.id);

          if (!hasRecentAlert('document', doc.id, 'document_expired', 0)) {
            createNotification({
              type: 'document_expired',
              title: 'Statutory Document Expired',
              message: `${doc.type} for ${doc.institution_name} has expired on ${doc.expiry_date}. Immediate renewal required.`,
              recipientRole: 'institution',
              recipientInstitution: doc.institution_id,
              entityType: 'document',
              entityId: doc.id,
              escalationLevel: 0
            });
            summary.alertsGenerated++;
          } else {
            summary.duplicatesPrevented++;
          }
        } else if (days <= 60 && days >= 0 && doc.status !== 'expiring-soon' && doc.status !== 'renewal-pending') {
          db.prepare("UPDATE documents SET status = 'expiring-soon', updated_at = datetime('now') WHERE id = ?").run(doc.id);

          if (!hasRecentAlert('document', doc.id, 'document_expiring', 0)) {
            createNotification({
              type: 'document_expiring',
              title: 'Statutory Document Expiring Soon',
              message: `${doc.type} for ${doc.institution_name} will expire in ${days} days. Please file renewal.`,
              recipientRole: 'institution',
              recipientInstitution: doc.institution_id,
              entityType: 'document',
              entityId: doc.id,
              escalationLevel: 0
            });
            summary.alertsGenerated++;
          } else {
            summary.duplicatesPrevented++;
          }
        }
      }
    }

    return summary;
  },

  // Start background interval runner
  startScheduler(intervalMs = 60000) {
    console.log(`⏱️ FlowGuard SLA Scheduler active (Interval: ${intervalMs / 1000}s)`);
    // Run immediately on boot
    this.runSchedulerOnce();
    // Run periodically
    return setInterval(() => {
      try {
        this.runSchedulerOnce();
      } catch (err) {
        console.error('⚠️ Scheduler execution error:', err.message);
      }
    }, intervalMs);
  }
};

module.exports = Scheduler;
