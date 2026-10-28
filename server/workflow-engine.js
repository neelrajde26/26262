/* ============================================
   AICTE FlowGuard — Workflow Engine
   Configurable, State-Machine Stage Routing
   ============================================ */

const { db } = require('./db.js');
const { hasPermission } = require('./auth.js');

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const WorkflowEngine = {
  // Advance an application to the next configured workflow stage
  advanceStage(applicationId, nextStageId, notes, user) {
    if (!hasPermission(user.role, 'advance_stage') && !hasPermission(user.role, 'approve_application')) {
      return { success: false, error: 'Unauthorized: You do not have permission to advance workflow stages.' };
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) return { success: false, error: 'Application not found' };

    if (['approved', 'rejected', 'cancelled'].includes(app.status)) {
      return { success: false, error: `Cannot advance application in '${app.status}' terminal state.` };
    }

    const tmplRow = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(app.workflow_template_id);
    if (!tmplRow) return { success: false, error: 'Workflow template definition not found' };

    const stages = JSON.parse(tmplRow.stages);
    const targetStageDef = stages.find(s => s.id === nextStageId);
    if (!targetStageDef) {
      return { success: false, error: `Target stage '${nextStageId}' is not defined in workflow template.` };
    }

    const currentIdx = stages.findIndex(s => s.id === app.current_stage);
    const targetIdx = stages.findIndex(s => s.id === nextStageId);

    if (targetIdx <= currentIdx && app.status !== 'returned') {
      return { success: false, error: 'Cannot transition backward or to identical stage via advance action.' };
    }

    // Determine SLA timeline
    const timelineDays = targetStageDef.timelineDays || 15;
    const nextDueDate = nextStageId === 'approved' ? null : dateOffset(timelineDays);
    const now = new Date().toISOString();

    // Begin transaction updates
    const prevStatus = app.status;
    const prevStage = app.current_stage;

    db.prepare(`
      UPDATE applications
      SET current_stage = ?,
          status = ?,
          current_stage_due_date = ?,
          return_reason = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(nextStageId, nextStageId, nextDueDate, now, applicationId);

    // Record stage history
    const historyId = 'hist-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      applicationId,
      nextStageId,
      `Stage advanced: ${targetStageDef.name}`,
      user.userId,
      user.fullName,
      now,
      notes || ''
    );

    // Record immutable audit entry
    const auditId = 'aud-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      user.userId,
      user.fullName,
      'stage_advanced',
      'application',
      applicationId,
      `Advanced application ${app.application_number} from '${prevStage}' to '${nextStageId}'. Notes: ${notes || 'None'}`,
      JSON.stringify({ stage: prevStage, status: prevStatus }),
      JSON.stringify({ stage: nextStageId, status: nextStageId, dueDate: nextDueDate }),
      '127.0.0.1',
      now
    );

    // If advanced to EVC pending, automatically ensure EVC event record is ready
    if (nextStageId === 'evc-pending') {
      const existingEvc = db.prepare('SELECT id FROM evc_events WHERE application_id = ?').get(applicationId);
      if (!existingEvc) {
        const evcId = 'evc-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
        db.prepare(`
          INSERT INTO evc_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          evcId,
          applicationId,
          app.application_number,
          app.institution_id,
          app.institution_name,
          'pending-schedule',
          null,
          null,
          null,
          null,
          app.region,
          app.is_new_institution,
          'physical',
          'Awaiting committee constitution and inspection date assignment.',
          null,
          now,
          now
        );
      }
    }

    // Notify institution
    const notifId = 'ntf-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      notifId,
      'stage_advanced',
      'Application Stage Advanced',
      `Application ${app.application_number} has moved to '${targetStageDef.name}'. Due date: ${nextDueDate || 'N/A'}.`,
      null,
      'institution',
      app.region,
      app.institution_id,
      'application',
      applicationId,
      0,
      0,
      'delivered',
      now
    );

    return {
      success: true,
      applicationId,
      currentStage: nextStageId,
      dueDate: nextDueDate,
      message: `Application advanced to '${targetStageDef.name}' successfully.`
    };
  },

  // Return application for correction or clarification
  returnApplication(applicationId, returnReason, user) {
    if (!hasPermission(user.role, 'return_application')) {
      return { success: false, error: 'Unauthorized: You do not have permission to return applications.' };
    }

    if (!returnReason || !returnReason.trim()) {
      return { success: false, error: 'A specific reason and compliance requirement must be provided for returned applications.' };
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) return { success: false, error: 'Application not found' };

    const now = new Date().toISOString();
    const returnDueDate = dateOffset(7); // 7-day correction SLA

    db.prepare(`
      UPDATE applications
      SET status = 'returned',
          return_reason = ?,
          current_stage_due_date = ?,
          updated_at = ?
      WHERE id = ?
    `).run(returnReason.trim(), returnDueDate, now, applicationId);

    // Record stage history
    const historyId = 'hist-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      applicationId,
      'returned',
      'Application Returned for Clarification',
      user.userId,
      user.fullName,
      now,
      returnReason.trim()
    );

    // Record audit
    const auditId = 'aud-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      user.userId,
      user.fullName,
      'application_returned',
      'application',
      applicationId,
      `Returned application ${app.application_number}. Reason: ${returnReason.trim()}`,
      JSON.stringify({ status: app.status }),
      JSON.stringify({ status: 'returned', returnReason: returnReason.trim() }),
      '127.0.0.1',
      now
    );

    // High-priority notification to institution
    const notifId = 'ntf-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      notifId,
      'returned',
      'Action Required: Application Returned',
      `Application ${app.application_number} has been returned for clarification: "${returnReason.trim().substring(0, 100)}"`,
      null,
      'institution',
      app.region,
      app.institution_id,
      'application',
      applicationId,
      0,
      0,
      'delivered',
      now
    );

    return {
      success: true,
      applicationId,
      status: 'returned',
      message: 'Application returned for clarification successfully.'
    };
  },

  // Final approval recorded by Competent Authority
  approveApplication(applicationId, notes, user) {
    if (!hasPermission(user.role, 'approve_application')) {
      return { success: false, error: 'Unauthorized: Only authorized Competent Authorities can approve applications.' };
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) return { success: false, error: 'Application not found' };

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE applications
      SET current_stage = 'approved',
          status = 'approved',
          current_stage_due_date = NULL,
          observations = ?,
          updated_at = ?
      WHERE id = ?
    `).run(notes || 'Approved by Competent Authority', now, applicationId);

    // Record stage history
    const historyId = 'hist-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      applicationId,
      'approved',
      'Application Approved',
      user.userId,
      user.fullName,
      now,
      notes || 'Approval order recorded'
    );

    // Audit
    const auditId = 'aud-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      user.userId,
      user.fullName,
      'application_approved',
      'application',
      applicationId,
      `Competent Authority approved application ${app.application_number}: ${notes || 'No conditions'}`,
      JSON.stringify({ status: app.status }),
      JSON.stringify({ status: 'approved' }),
      '127.0.0.1',
      now
    );

    // Notify institution & regional officer
    const notifId = 'ntf-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      notifId,
      'approved',
      'Application Approved!',
      `Approval order issued for application ${app.application_number} (${app.program_name || 'Program'}).`,
      null,
      'institution',
      app.region,
      app.institution_id,
      'application',
      applicationId,
      0,
      0,
      'delivered',
      now
    );

    return {
      success: true,
      applicationId,
      status: 'approved',
      message: `Application ${app.application_number} officially approved.`
    };
  },

  // Final rejection recorded by Competent Authority
  rejectApplication(applicationId, rejectionReason, user) {
    if (!hasPermission(user.role, 'reject_application')) {
      return { success: false, error: 'Unauthorized: Only authorized Competent Authorities can record rejections.' };
    }

    if (!rejectionReason || !rejectionReason.trim()) {
      return { success: false, error: 'Specific reason is required when recording an application rejection.' };
    }

    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) return { success: false, error: 'Application not found' };

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE applications
      SET current_stage = 'rejected',
          status = 'rejected',
          current_stage_due_date = NULL,
          observations = ?,
          updated_at = ?
      WHERE id = ?
    `).run(`Rejected: ${rejectionReason.trim()}`, now, applicationId);

    // Record stage history
    const historyId = 'hist-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      applicationId,
      'rejected',
      'Application Rejected',
      user.userId,
      user.fullName,
      now,
      rejectionReason.trim()
    );

    // Audit
    const auditId = 'aud-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      user.userId,
      user.fullName,
      'application_rejected',
      'application',
      applicationId,
      `Competent Authority rejected application ${app.application_number}. Reason: ${rejectionReason.trim()}`,
      JSON.stringify({ status: app.status }),
      JSON.stringify({ status: 'rejected' }),
      '127.0.0.1',
      now
    );

    // Notify institution
    const notifId = 'ntf-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    db.prepare(`
      INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      notifId,
      'rejected',
      'Application Decision: Rejected',
      `Application ${app.application_number} was rejected by Competent Authority. Reason: ${rejectionReason.trim()}`,
      null,
      'institution',
      app.region,
      app.institution_id,
      'application',
      applicationId,
      0,
      0,
      'delivered',
      now
    );

    return {
      success: true,
      applicationId,
      status: 'rejected',
      message: `Application ${app.application_number} recorded as rejected.`
    };
  }
};

module.exports = WorkflowEngine;
