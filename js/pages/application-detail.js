/* ============================================
   AICTE FlowGuard — Application Detail Page
   ============================================ */

const ApplicationDetailPage = {
  render(params) {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();
    const app = Store.getById('applications', params?.id);

    if (!app) {
      container.innerHTML = `<div class="empty-state"><span class="material-icons-round">search_off</span><h3>Application not found</h3><p>The requested application does not exist or has been removed.</p><button class="btn btn-primary" onclick="Router.navigate('applications')" style="margin-top:var(--space-4)"><span class="material-icons-round">arrow_back</span> Back to Applications</button></div>`;
      return;
    }

    // Authorization check
    const scopedApps = Auth.filterByScope([app], 'application');
    if (scopedApps.length === 0) {
      container.innerHTML = `<div class="permission-denied"><span class="material-icons-round">lock</span><h3>Access Denied</h3><p>You do not have permission to view this application.</p><button class="btn btn-primary" onclick="Router.navigate('applications')" style="margin-top:var(--space-4)"><span class="material-icons-round">arrow_back</span> Back to Applications</button></div>`;
      return;
    }

    const template = Store.getById('workflowTemplates', app.workflowTemplateId);
    const audits = Store.getAudits(app.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const dueDate = app.currentStageDueDate;
    const dueDays = dueDate ? Utils.daysUntil(dueDate) : null;
    const isActive = !['approved', 'rejected', 'cancelled'].includes(app.status);
    const isOverdue = dueDays !== null && dueDays < 0 && isActive;

    const canAdvance = Auth.canPerformAction('advance', app) && isActive && app.status !== 'returned';
    const canReturn = Auth.canPerformAction('return', app) && isActive;
    const canApprove = Auth.canPerformAction('approve', app) && isActive;

    const typeLabels = { 'new-institution': 'New Institution', 'new-program': 'New Program', 'intake-change': 'Intake Change', 'show-cause': 'Show Cause', 'closure': 'Closure', 'minor-modification': 'Minor Modification', 'verification-visit': 'Verification Visit' };

    container.innerHTML = `
      <div>
        <button class="btn btn-ghost" onclick="Router.navigate('applications')" style="margin-bottom: var(--space-3);">
          <span class="material-icons-round">arrow_back</span> Back to Applications
        </button>

        <!-- Header -->
        <div class="detail-header">
          <div class="detail-title-group">
            <div class="detail-app-id">${Utils.escapeHtml(app.applicationNumber)}</div>
            <h2 class="detail-institution-name">${Utils.escapeHtml(app.institutionName)}</h2>
            <div style="display:flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; margin-top: var(--space-1);">
              ${Utils.statusBadge(app.status)}
              <span class="badge badge-neutral">${Utils.escapeHtml(typeLabels[app.type] || app.type)}</span>
              ${app.isNewInstitution ? '<span class="badge badge-info"><span class="material-icons-round">star</span> New Institution</span>' : ''}
              ${isOverdue ? '<span class="badge badge-danger"><span class="material-icons-round">alarm</span> Overdue</span>' : ''}
              ${app.priority === 'high' ? '<span class="badge badge-warning"><span class="material-icons-round">priority_high</span> High Priority</span>' : ''}
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn btn-outline" onclick="ApplicationDetailPage.showAISummary('${app.id}')">
              <span class="material-icons-round">psychology</span> AI Case Brief
            </button>
            ${canAdvance ? `<button class="btn btn-primary" onclick="ApplicationDetailPage.showAdvanceModal('${app.id}')"><span class="material-icons-round">arrow_forward</span> Advance Stage</button>` : ''}
            ${canReturn ? `<button class="btn btn-warning" onclick="ApplicationDetailPage.showReturnModal('${app.id}')"><span class="material-icons-round">undo</span> Return</button>` : ''}
            ${canApprove ? `<button class="btn btn-success" onclick="ApplicationDetailPage.showApproveModal('${app.id}')"><span class="material-icons-round">verified</span> Approve</button>` : ''}
            ${canApprove ? `<button class="btn btn-danger" onclick="ApplicationDetailPage.showRejectModal('${app.id}')"><span class="material-icons-round">cancel</span> Reject</button>` : ''}
          </div>
        </div>

        <!-- Stage Progress -->
        <div class="card" style="margin-bottom: var(--space-5);">
          <div class="card-header"><h4>Workflow Progress</h4><span style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${Utils.escapeHtml(template?.name || 'Unknown')}</span></div>
          <div class="card-body">
            ${Components.stageProgress(app)}
          </div>
        </div>

        <!-- Tabs -->
        <div class="card">
          <div class="tabs" role="tablist">
            <button class="tab-btn active" onclick="ApplicationDetailPage.switchTab(this, 'tab-details')" role="tab">
              <span class="material-icons-round">info</span> Details
            </button>
            <button class="tab-btn" onclick="ApplicationDetailPage.switchTab(this, 'tab-history')" role="tab">
              <span class="material-icons-round">timeline</span> History
            </button>
            <button class="tab-btn" onclick="ApplicationDetailPage.switchTab(this, 'tab-audit')" role="tab">
              <span class="material-icons-round">history</span> Audit Trail
            </button>
          </div>

          <!-- Details Tab -->
          <div id="tab-details" class="tab-panel active">
            <div class="detail-grid" style="margin-bottom: var(--space-5);">
              <div class="detail-item">
                <span class="detail-label">Application Number</span>
                <span class="detail-value">${Utils.escapeHtml(app.applicationNumber)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Institution</span>
                <span class="detail-value">${Utils.escapeHtml(app.institutionName)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Program</span>
                <span class="detail-value">${Utils.escapeHtml(app.programName || '—')}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Type</span>
                <span class="detail-value">${Utils.escapeHtml(typeLabels[app.type] || app.type)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Submitted</span>
                <span class="detail-value">${Utils.formatDate(app.submittedDate)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Current Stage</span>
                <span class="detail-value">${Utils.statusBadge(app.currentStage)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Assigned Officer</span>
                <span class="detail-value">${Utils.escapeHtml(app.assignedOfficerName || 'Unassigned')}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Due Date</span>
                <span class="detail-value ${isOverdue ? 'overdue' : ''}">
                  ${dueDate ? Utils.formatDate(dueDate) : '—'}
                  ${isOverdue ? ` (${Math.abs(dueDays)} days overdue)` : (dueDays !== null && isActive ? ` (${dueDays} days left)` : '')}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Region</span>
                <span class="detail-value">${Utils.escapeHtml(Store.getById('regions', app.region)?.name || app.region)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Workflow Template</span>
                <span class="detail-value">${Utils.escapeHtml(template?.name || '—')}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Case Age</span>
                <span class="detail-value">${app.submittedDate ? Utils.daysAgo(app.submittedDate) + ' days' : '—'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Priority</span>
                <span class="detail-value">${app.priority === 'high' ? '<span class="badge badge-warning">High</span>' : '<span class="badge badge-neutral">Normal</span>'}</span>
              </div>
            </div>

            ${app.returnReason ? `
            <div class="card" style="margin-bottom: var(--space-4); border-left: 4px solid var(--color-warning-500);">
              <div class="card-body">
                <h4 style="color: var(--color-warning-700); margin-bottom: var(--space-2);"><span class="material-icons-round" style="vertical-align:middle;margin-right:4px">undo</span>Return Reason</h4>
                <p style="font-size: var(--font-size-sm);">${Utils.escapeHtml(app.returnReason)}</p>
              </div>
            </div>` : ''}

            ${app.observations ? `
            <div style="margin-bottom: var(--space-4);">
              <h4 style="margin-bottom: var(--space-2);">Observations</h4>
              <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">${Utils.escapeHtml(app.observations)}</p>
            </div>` : ''}

            ${app.attachments?.length ? `
            <div>
              <h4 style="margin-bottom: var(--space-2);">Attachments</h4>
              <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
                ${app.attachments.map(f => `
                  <div class="evidence-item" style="display:inline-flex;padding:var(--space-2) var(--space-3);background:var(--bg-tertiary);border-radius:var(--border-radius-sm);">
                    <div class="evidence-file"><span class="material-icons-round">attach_file</span> ${Utils.escapeHtml(f)}</div>
                  </div>
                `).join('')}
              </div>
            </div>` : ''}
          </div>

          <!-- History Tab -->
          <div id="tab-history" class="tab-panel">
            <div class="timeline">
              ${(app.stageHistory || []).slice().reverse().map(entry => {
                let dotClass = '';
                if (entry.action.toLowerCase().includes('approved') || entry.action.toLowerCase().includes('completed')) dotClass = 'completed';
                else if (entry.action.toLowerCase().includes('returned')) dotClass = 'returned';
                else if (entry.action.toLowerCase().includes('reject')) dotClass = 'rejected';
                else dotClass = 'active';

                return `
                  <div class="timeline-item">
                    <div class="timeline-dot ${dotClass}"></div>
                    <div class="timeline-content">
                      <div class="timeline-title">${Utils.escapeHtml(entry.action)}</div>
                      <div class="timeline-meta">
                        <strong>${Utils.escapeHtml(entry.actorName)}</strong> · ${Utils.formatDateTime(entry.date)}
                      </div>
                      ${entry.notes ? `<p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-1)">${Utils.escapeHtml(entry.notes)}</p>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${(!app.stageHistory || app.stageHistory.length === 0) ? '<div class="empty-state"><span class="material-icons-round">timeline</span><h3>No history</h3></div>' : ''}
          </div>

          <!-- Audit Tab -->
          <div id="tab-audit" class="tab-panel">
            ${audits.length === 0 ? '<div class="empty-state"><span class="material-icons-round">history</span><h3>No audit entries</h3></div>' : `
              ${audits.map(a => `
                <div class="audit-entry">
                  <span class="audit-actor">${Utils.escapeHtml(a.actorName)}</span>
                  <span class="audit-action">${Utils.escapeHtml(a.details)}</span>
                  <span class="audit-time">${Utils.formatDateTime(a.timestamp)}</span>
                </div>
              `).join('')}
            `}
          </div>
        </div>

        <p style="margin-top: var(--space-4); font-size: var(--font-size-xs); color: var(--text-tertiary);">
          ⚠ Demo data — workflow stages and timelines are demonstration values, not official AICTE policy.
        </p>
      </div>
    `;
  },

  switchTab(btn, tabId) {
    btn.closest('.card').querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    btn.closest('.card').querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
  },

  // Advance to next stage
  showAdvanceModal(appId) {
    const app = Store.getById('applications', appId);
    const template = Store.getById('workflowTemplates', app.workflowTemplateId);
    if (!template) return;

    const stages = template.stages;
    const currentIdx = stages.findIndex(s => s.id === app.currentStage);
    const nextStages = stages.slice(currentIdx + 1).filter(s => s.required);

    if (nextStages.length === 0) {
      Components.showToast('No further stages available.', 'info');
      return;
    }

    Components.showModal('Advance Stage', `
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">
        Move application <strong>${Utils.escapeHtml(app.applicationNumber)}</strong> to the next stage.
      </p>
      <div class="form-group">
        <label class="form-label">Next Stage</label>
        <select class="form-select" id="advance-stage">
          ${nextStages.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.name)} (${s.timelineDays} day timeline)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="advance-notes" placeholder="Add notes about this stage transition..."></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ApplicationDetailPage.doAdvance('${appId}')">
        <span class="material-icons-round">arrow_forward</span> Advance
      </button>
    `);
  },

  doAdvance(appId) {
    const session = Auth.getSession();
    const nextStage = document.getElementById('advance-stage').value;
    const notes = document.getElementById('advance-notes').value.trim();
    const app = Store.getById('applications', appId);
    const template = Store.getById('workflowTemplates', app.workflowTemplateId);
    const stageConfig = template?.stages?.find(s => s.id === nextStage);

    const history = app.stageHistory || [];
    history.push({
      stage: nextStage,
      date: Utils.now(),
      actor: session.userId,
      actorName: session.fullName,
      action: `Advanced to ${stageConfig?.name || nextStage}`,
      notes: notes,
    });

    Store.update('applications', appId, {
      currentStage: nextStage,
      status: nextStage,
      stageHistory: history,
      currentStageDueDate: Utils.dateOffset(stageConfig?.timelineDays || 15),
      returnReason: null,
    });

    Store.addAudit({
      actor: session.userId,
      actorName: session.fullName,
      action: 'stage_advanced',
      entityType: 'application',
      entityId: appId,
      details: `Advanced to ${stageConfig?.name || nextStage}. ${notes}`,
    });

    Components.closeModal();
    Components.showToast(`Application advanced to ${stageConfig?.name || nextStage}`, 'success');
    this.render({ id: appId });
  },

  // Return for clarification
  showReturnModal(appId) {
    Components.showModal('Return for Clarification', `
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">
        Return this application for clarification or additional information.
      </p>
      <div class="form-group">
        <label class="form-label"><span class="material-icons-round">warning</span> Reason (required)</label>
        <textarea class="form-textarea" id="return-reason" placeholder="Provide the reason for return..." required style="min-height:100px"></textarea>
        <div class="form-help">This reason will be visible to the institution.</div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-warning" onclick="ApplicationDetailPage.doReturn('${appId}')">
        <span class="material-icons-round">undo</span> Return Application
      </button>
    `);
  },

  doReturn(appId) {
    const session = Auth.getSession();
    const reason = document.getElementById('return-reason').value.trim();
    if (!reason) { Components.showToast('Please provide a reason for return.', 'error'); return; }

    const app = Store.getById('applications', appId);
    const history = app.stageHistory || [];
    history.push({
      stage: 'returned',
      date: Utils.now(),
      actor: session.userId,
      actorName: session.fullName,
      action: 'Returned for clarification',
      notes: reason,
    });

    Store.update('applications', appId, {
      currentStage: 'returned',
      status: 'returned',
      returnReason: reason,
      stageHistory: history,
    });

    Store.addAudit({
      actor: session.userId,
      actorName: session.fullName,
      action: 'application_returned',
      entityType: 'application',
      entityId: appId,
      details: `Returned: ${reason}`,
    });

    // Notify institution
    Store.addNotification({
      type: 'returned',
      title: 'Application returned for clarification',
      message: `Application ${app.applicationNumber} has been returned. Reason: ${reason}`,
      recipientInstitution: app.institutionId,
      recipientRole: 'institution',
      entityType: 'application',
      entityId: appId,
    });

    Components.closeModal();
    Components.showToast('Application returned', 'warning');
    this.render({ id: appId });
  },

  // Approve
  showApproveModal(appId) {
    Components.showModal('Approve Application', `
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">
        This action records the approval decision. Statutory decisions are made by the authorized competent authority.
      </p>
      <div class="form-group">
        <label class="form-label">Approval Notes</label>
        <textarea class="form-textarea" id="approve-notes" placeholder="Record approval notes..."></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="ApplicationDetailPage.doApprove('${appId}')">
        <span class="material-icons-round">verified</span> Confirm Approval
      </button>
    `);
  },

  doApprove(appId) {
    const session = Auth.getSession();
    const notes = document.getElementById('approve-notes').value.trim();
    const app = Store.getById('applications', appId);
    const history = app.stageHistory || [];
    history.push({ stage: 'approved', date: Utils.now(), actor: session.userId, actorName: session.fullName, action: 'Approved', notes });

    Store.update('applications', appId, { currentStage: 'approved', status: 'approved', stageHistory: history, currentStageDueDate: null, returnReason: null });
    Store.addAudit({ actor: session.userId, actorName: session.fullName, action: 'application_approved', entityType: 'application', entityId: appId, details: `Application approved. ${notes}` });

    Components.closeModal();
    Components.showToast('Application approved', 'success', 'Decision Recorded');
    this.render({ id: appId });
  },

  // Reject
  showRejectModal(appId) {
    Components.showModal('Reject Application', `
      <p style="font-size:var(--font-size-sm);color:var(--color-danger-500);margin-bottom:var(--space-4)">
        ⚠ This action records a rejection decision.
      </p>
      <div class="form-group">
        <label class="form-label"><span class="material-icons-round">warning</span> Rejection Reason (required)</label>
        <textarea class="form-textarea" id="reject-reason" placeholder="Provide the reason for rejection..." required></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="ApplicationDetailPage.doReject('${appId}')">
        <span class="material-icons-round">cancel</span> Confirm Rejection
      </button>
    `);
  },

  doReject(appId) {
    const session = Auth.getSession();
    const reason = document.getElementById('reject-reason').value.trim();
    if (!reason) { Components.showToast('Please provide a reason for rejection.', 'error'); return; }

    const app = Store.getById('applications', appId);
    const history = app.stageHistory || [];
    history.push({ stage: 'rejected', date: Utils.now(), actor: session.userId, actorName: session.fullName, action: 'Rejected', notes: reason });

    Store.update('applications', appId, { currentStage: 'rejected', status: 'rejected', stageHistory: history, currentStageDueDate: null });
    Store.addAudit({ actor: session.userId, actorName: session.fullName, action: 'application_rejected', entityType: 'application', entityId: appId, details: `Application rejected: ${reason}` });

    Components.closeModal();
    Components.showToast('Application rejected', 'error', 'Decision Recorded');
    this.render({ id: appId });
  },

  async showAISummary(appId) {
    const app = Store.getById('applications', appId);
    if (!app) return;

    Components.showToast('Generating AI Case Brief...', 'info');
    let summary;
    try {
      summary = await API.getAISummary(appId);
    } catch (e) {
      summary = {
        isAIGenerated: true,
        disclaimer: 'AI-assisted guidance only. Decisions and determinations must be verified and executed by authorized officials.',
        overview: `Application ${app.applicationNumber} (${app.programName || 'Program'}) is currently in '${app.currentStage}' stage under ${app.region}. Case has been active for ${app.submittedDate ? Utils.daysAgo(app.submittedDate) : 0} days.`,
        keyObservations: [
          app.observations ? `Officer remarks: "${app.observations}"` : 'No adverse observations recorded on file.',
          app.currentStageDueDate ? `Current stage SLA due date: ${Utils.formatDate(app.currentStageDueDate)}.` : 'No active due date countdown.',
          app.isNewInstitution ? 'Flagged as New Institution establishment requiring full infrastructure verification.' : 'Standard operational case.'
        ],
        suggestedNextActions: [
          'Verify uploaded supporting documents against APH specifications.',
          'Check compliance undertaking statuses before advancing.',
          'Ensure decision audit is signed by authorized reviewer.'
        ]
      };
    }

    const bodyHtml = `
      <div style="font-size: var(--font-size-sm); line-height: 1.6;">
        <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3);">
          <span class="badge badge-info" style="display: flex; align-items: center; gap: 4px;">
            <span class="material-icons-round" style="font-size: 14px;">auto_awesome</span> AI Case Brief
          </span>
          <span style="font-size: var(--font-size-xs); color: var(--text-tertiary);">Human Decision-Support Only</span>
        </div>

        <div style="background: var(--bg-tertiary); padding: var(--space-3) var(--space-4); border-radius: var(--border-radius); border-left: 4px solid var(--color-primary-500); margin-bottom: var(--space-4);">
          <p style="margin: 0; font-weight: var(--font-weight-medium); color: var(--text-primary);">${Utils.escapeHtml(summary.overview)}</p>
        </div>

        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-2); color: var(--text-primary);">
          <span class="material-icons-round" style="font-size: 16px; vertical-align: middle; color: var(--color-warning-700);">fact_check</span> Key Operational Observations
        </h4>
        <ul style="padding-left: var(--space-4); margin-bottom: var(--space-4); color: var(--text-secondary);">
          ${summary.keyObservations.map(o => `<li style="margin-bottom: var(--space-1);">${Utils.escapeHtml(o)}</li>`).join('')}
        </ul>

        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-2); color: var(--text-primary);">
          <span class="material-icons-round" style="font-size: 16px; vertical-align: middle; color: var(--color-success-700);">checklist</span> Recommended Next Human Actions
        </h4>
        <ul style="padding-left: var(--space-4); margin-bottom: var(--space-4); color: var(--text-secondary);">
          ${summary.suggestedNextActions.map(a => `<li style="margin-bottom: var(--space-1);">${Utils.escapeHtml(a)}</li>`).join('')}
        </ul>

        <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); background: var(--color-warning-50); border: 1px solid var(--color-warning-100); padding: var(--space-2) var(--space-3); border-radius: var(--border-radius-sm);">
          <strong>⚠ Safeguard Disclaimer:</strong> ${Utils.escapeHtml(summary.disclaimer)}
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-primary" onclick="Components.closeModal()">Dismiss Brief</button>
    `;

    Components.showModal(`AI Case Brief — ${app.applicationNumber}`, bodyHtml, footerHtml);
  }
};
