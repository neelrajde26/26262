/* ============================================
   AICTE FlowGuard — Application Detail Page
   Synchronized directly with SQLite Backend
   ============================================ */

const ApplicationDetailPage = {
  currentApplicationId: null,

  async render(params) {
    const container = document.getElementById('page-container');
    const appId = params?.id || this.currentApplicationId;
    this.currentApplicationId = appId;

    if (!appId) {
      Router.navigate('applications');
      return;
    }

    container.innerHTML = Components.renderLoadingState('Loading application details from SQLite database...');

    let detailRes;
    try {
      detailRes = await Store.fetchApplicationDetail(appId);
    } catch (err) {
      container.innerHTML = Components.renderErrorState(
        'Application Not Found or Access Restricted',
        err.message || 'You may not have authorization to view this application under data scoping rules.',
        "Router.navigate('applications')"
      );
      return;
    }

    const app = Store._normalizeApp(detailRes.application);
    const template = detailRes.template;
    const audits = (detailRes.audits || []).map(a => Store._normalizeAudit(a));
    const history = detailRes.stageHistory || [];
    const evc = detailRes.evc ? Store._normalizeEvc(detailRes.evc) : null;
    const undertakings = (detailRes.undertakings || []).map(u => Store._normalizeUnd(u));

    const dueDate = app.currentStageDueDate;
    const dueDays = dueDate ? Utils.daysUntil(dueDate) : null;
    const isActive = !['approved', 'rejected', 'cancelled'].includes(app.status);
    const isOverdue = dueDays !== null && dueDays < 0 && isActive;

    const canAdvance = Auth.canPerformAction('advance', app) && isActive && app.status !== 'returned';
    const canReturn = Auth.canPerformAction('return', app) && isActive;
    const canApprove = Auth.canPerformAction('approve', app) && isActive;

    const typeLabels = {
      'new-institution': 'New Institution',
      'new-program': 'New Program',
      'intake-change': 'Intake Change',
      'show-cause': 'Show Cause',
      'closure': 'Closure',
      'minor-modification': 'Minor Modification',
      'verification-visit': 'Verification Visit'
    };

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
          <div class="card-header">
            <h4 style="font-weight:600;">Approval Workflow Pipeline</h4>
            <span style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${Utils.escapeHtml(template?.name || 'Workflow Pipeline')}</span>
          </div>
          <div class="card-body">
            ${template ? this.renderStageProgress(app, template.stages) : Components.stageProgress(app)}
          </div>
        </div>

        <!-- Tabs -->
        <div class="card">
          <div class="tabs" role="tablist">
            <button class="tab-btn active" onclick="ApplicationDetailPage.switchTab(this, 'tab-details')" role="tab">
              <span class="material-icons-round">info</span> Details
            </button>
            <button class="tab-btn" onclick="ApplicationDetailPage.switchTab(this, 'tab-history')" role="tab">
              <span class="material-icons-round">timeline</span> Stage History (${history.length})
            </button>
            <button class="tab-btn" onclick="ApplicationDetailPage.switchTab(this, 'tab-audit')" role="tab">
              <span class="material-icons-round">history</span> Audit Trail (${audits.length})
            </button>
            ${evc ? `
              <button class="tab-btn" onclick="ApplicationDetailPage.switchTab(this, 'tab-evc')" role="tab">
                <span class="material-icons-round">groups</span> EVC Inspection
              </button>` : ''
            }
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
                <span class="detail-label">Program / Specialization</span>
                <span class="detail-value">${Utils.escapeHtml(app.programName || '—')}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Application Type</span>
                <span class="detail-value">${Utils.escapeHtml(typeLabels[app.type] || app.type)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Region</span>
                <span class="detail-value">${Utils.escapeHtml(app.region.toUpperCase())}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Submitted Date</span>
                <span class="detail-value">${Utils.formatDate(app.submittedDate)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Current Stage SLA Due Date</span>
                <span class="detail-value ${isOverdue ? 'overdue' : ''}">${dueDate ? Utils.formatDate(dueDate) : 'Completed'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Assigned Officer</span>
                <span class="detail-value">${Utils.escapeHtml(app.assignedOfficerName || 'Bureau Assigned')}</span>
              </div>
            </div>

            ${app.returnReason ? `
              <div class="alert alert-warning" style="margin-bottom: var(--space-4);">
                <div class="alert-icon"><span class="material-icons-round">warning</span></div>
                <div class="alert-content">
                  <h4 style="font-size: var(--font-size-sm); font-weight: 600;">Return Reason / Clarification Required:</h4>
                  <p style="margin: 0; font-size: var(--font-size-sm);">${Utils.escapeHtml(app.returnReason)}</p>
                </div>
              </div>` : ''
            }

            <div style="margin-top: var(--space-4);">
              <h4 style="font-size: var(--font-size-sm); font-weight: 600; margin-bottom: var(--space-2);">Attachments & Filed Documentation</h4>
              <div style="display:flex; gap: var(--space-2); flex-wrap: wrap;">
                ${Array.isArray(app.attachments) && app.attachments.length ?
                  app.attachments.map(att => `
                    <div class="badge badge-neutral" style="padding: var(--space-2) var(--space-3); font-size: var(--font-size-xs); display:flex; align-items:center; gap: 6px;">
                      <span class="material-icons-round" style="font-size:16px;">description</span>
                      <span>${Utils.escapeHtml(att)}</span>
                    </div>
                  `).join('') :
                  '<span style="color:var(--text-tertiary); font-size:var(--font-size-sm)">Standard APH Form Attached</span>'
                }
              </div>
            </div>
          </div>

          <!-- Stage History Tab -->
          <div id="tab-history" class="tab-panel">
            ${history.length === 0 ?
              Components.renderEmptyState('No Stage History', 'No transitions recorded yet.') :
              `<div class="timeline" style="padding: var(--space-3);">
                ${history.map(h => `
                  <div class="timeline-item" style="display:flex; gap: var(--space-3); margin-bottom: var(--space-4); border-left: 2px solid var(--border-color); padding-left: var(--space-4); position:relative;">
                    <div style="flex:1">
                      <div style="font-weight: 600; font-size: var(--font-size-sm);">${Utils.escapeHtml(h.action || h.stage)}</div>
                      <div style="font-size: var(--font-size-xs); color: var(--text-secondary); margin: 2px 0;">By: ${Utils.escapeHtml(h.actor_name || h.actorName || 'System')} • ${Utils.formatDate(h.date)}</div>
                      ${h.notes ? `<div style="font-size: var(--font-size-xs); background: var(--bg-tertiary); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); margin-top: 4px;">${Utils.escapeHtml(h.notes)}</div>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>`
            }
          </div>

          <!-- Audit Trail Tab -->
          <div id="tab-audit" class="tab-panel">
            ${audits.length === 0 ?
              Components.renderEmptyState('No Audit Entries', 'No system audit trail recorded for this record.') :
              `<div class="data-table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Details</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${audits.map(a => `
                      <tr>
                        <td><span class="badge badge-info">${Utils.escapeHtml(a.action)}</span></td>
                        <td>${Utils.escapeHtml(a.actorName || a.actor || 'System')}</td>
                        <td>${Utils.escapeHtml(a.details)}</td>
                        <td style="font-size:var(--font-size-xs)">${Utils.formatDate(a.timestamp)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>`
            }
          </div>

          <!-- EVC Inspection Tab -->
          ${evc ? `
            <div id="tab-evc" class="tab-panel">
              <div class="detail-grid">
                <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${Utils.statusBadge(evc.status)}</span></div>
                <div class="detail-item"><span class="detail-label">Committee Lead</span><span class="detail-value">${Utils.escapeHtml(evc.committeeName || 'Unassigned')}</span></div>
                <div class="detail-item"><span class="detail-label">Planned Inspection Date</span><span class="detail-value">${evc.plannedDate ? Utils.formatDate(evc.plannedDate) : 'Pending Schedule'}</span></div>
                <div class="detail-item"><span class="detail-label">Completed Date</span><span class="detail-value">${evc.completedDate ? Utils.formatDate(evc.completedDate) : 'Not Completed'}</span></div>
              </div>
              ${evc.report ? `
                <div style="margin-top: var(--space-4);">
                  <h4 style="font-weight: 600; font-size: var(--font-size-sm); margin-bottom: 6px;">Inspection Report:</h4>
                  <pre style="background:var(--bg-tertiary); padding:var(--space-3); border-radius:var(--radius-sm); font-size:var(--font-size-xs); white-space:pre-wrap;">${Utils.escapeHtml(evc.report)}</pre>
                </div>` : ''
              }
            </div>` : ''
          }
        </div>
      </div>
    `;
  },

  renderStageProgress(app, stages) {
    if (!Array.isArray(stages)) return '';
    const currentIdx = stages.findIndex(s => s.id === app.currentStage);

    return `
      <div class="stage-progress">
        ${stages.map((stage, idx) => {
          let stateClass = '';
          let icon = 'radio_button_unchecked';

          if (app.status === 'approved' || app.status === 'rejected') {
            stateClass = app.status === 'approved' ? 'completed' : (idx === stages.length - 1 ? 'returned' : 'completed');
            icon = app.status === 'approved' ? 'check_circle' : (idx === stages.length - 1 ? 'cancel' : 'check_circle');
          } else if (app.status === 'returned' && idx === currentIdx) {
            stateClass = 'returned';
            icon = 'undo';
          } else if (idx < currentIdx || (currentIdx === -1 && app.status === 'approved')) {
            stateClass = 'completed';
            icon = 'check_circle';
          } else if (idx === currentIdx) {
            stateClass = 'active';
            icon = 'pending';
          } else if (!stage.required) {
            stateClass = 'skipped';
            icon = 'remove_circle_outline';
          }

          const connector = idx < stages.length - 1 ?
            `<div class="stage-connector ${idx < currentIdx ? 'completed' : ''}"></div>` : '';

          return `
            <div class="stage-node ${stateClass}">
              <div class="stage-circle"><span class="material-icons-round">${icon}</span></div>
              <div class="stage-label">${Utils.escapeHtml(stage.name)}</div>
            </div>
            ${connector}
          `;
        }).join('')}
      </div>
    `;
  },

  switchTab(button, tabId) {
    const parent = button.closest('.card');
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    button.classList.add('active');
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');
  },

  showAdvanceModal(appId) {
    const app = Store.getById('applications', appId);
    if (!app) return;
    const template = Store.getById('workflowTemplates', app.workflowTemplateId);
    const stages = template?.stages || [];
    const currentIdx = stages.findIndex(s => s.id === app.currentStage);
    const availableStages = stages.filter((s, idx) => idx > currentIdx || app.status === 'returned');

    if (!availableStages.length) {
      Components.showToast('No further stages defined in this workflow template.', 'info');
      return;
    }

    Components.showModal('Advance Workflow Stage', `
      <div class="form-group">
        <label class="form-label">Target Next Stage *</label>
        <select class="form-select" id="advance-stage-select">
          ${availableStages.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.name)} (SLA: ${s.timelineDays || 15} days)</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Review Officer Remarks</label>
        <textarea class="form-textarea" id="advance-notes" rows="3" placeholder="Enter findings, verification checklist compliance, or committee notes..."></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ApplicationDetailPage.doAdvance('${appId}')">
        <span class="material-icons-round">arrow_forward</span> Advance Stage
      </button>
    `);
  },

  async doAdvance(appId) {
    const nextStage = document.getElementById('advance-stage-select').value;
    const notes = document.getElementById('advance-notes').value.trim();

    try {
      await Store.advanceStage(appId, nextStage, notes);
      Components.closeModal();
      Components.showToast('Application advanced to next stage successfully', 'success', 'Stage Advanced');
      await this.render({ id: appId });
    } catch (err) {
      Components.showToast(err.message || 'Failed to advance stage', 'error');
    }
  },

  showReturnModal(appId) {
    Components.showModal('Return Application for Clarification', `
      <div class="form-group">
        <label class="form-label"><span class="material-icons-round" style="color:var(--color-warning-700)">warning</span> Reason & Required Clarification *</label>
        <textarea class="form-textarea" id="return-reason" rows="4" placeholder="Detail the deficiencies, missing statutory documents, or discrepancy..." required></textarea>
        <div class="form-help">This reason will be recorded on the official file and notified to the institution.</div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-warning" onclick="ApplicationDetailPage.doReturn('${appId}')">
        <span class="material-icons-round">undo</span> Return Application
      </button>
    `);
  },

  async doReturn(appId) {
    const reason = document.getElementById('return-reason').value.trim();
    if (!reason) {
      Components.showToast('Please provide a specific return reason', 'error');
      return;
    }

    try {
      await Store.returnApplication(appId, reason);
      Components.closeModal();
      Components.showToast('Application returned to institution for clarification', 'warning');
      await this.render({ id: appId });
    } catch (err) {
      Components.showToast(err.message || 'Failed to return application', 'error');
    }
  },

  showApproveModal(appId) {
    Components.showModal('Issue Approval Order', `
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">
        This action issues the statutory approval order. Must only be executed by the authorized Competent Authority.
      </p>
      <div class="form-group">
        <label class="form-label">Approval Conditions / Remarks</label>
        <textarea class="form-textarea" id="approve-notes" rows="3" placeholder="Approval order notes, intake sanctions, or compliance conditions..."></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="ApplicationDetailPage.doApprove('${appId}')">
        <span class="material-icons-round">verified</span> Confirm Approval
      </button>
    `);
  },

  async doApprove(appId) {
    const notes = document.getElementById('approve-notes').value.trim();
    try {
      await Store.approveApplication(appId, notes);
      Components.closeModal();
      Components.showToast('Official approval recorded successfully', 'success', 'Approval Order Issued');
      await this.render({ id: appId });
    } catch (err) {
      Components.showToast(err.message || 'Failed to approve application', 'error');
    }
  },

  showRejectModal(appId) {
    Components.showModal('Record Application Rejection', `
      <div class="form-group">
        <label class="form-label"><span class="material-icons-round" style="color:var(--color-danger)">cancel</span> Rejection Grounds & Observations *</label>
        <textarea class="form-textarea" id="reject-reason" rows="4" placeholder="Detail the grounds for rejection as determined by Competent Authority..." required></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="ApplicationDetailPage.doReject('${appId}')">
        <span class="material-icons-round">cancel</span> Confirm Rejection
      </button>
    `);
  },

  async doReject(appId) {
    const reason = document.getElementById('reject-reason').value.trim();
    if (!reason) {
      Components.showToast('Please provide the grounds for rejection', 'error');
      return;
    }
    try {
      await Store.rejectApplication(appId, reason);
      Components.closeModal();
      Components.showToast('Application rejection recorded', 'error', 'Decision Recorded');
      await this.render({ id: appId });
    } catch (err) {
      Components.showToast(err.message || 'Failed to reject application', 'error');
    }
  },

  async showAISummary(appId) {
    Components.showToast('Synthesizing AI Case Brief with policy rules...', 'info');
    let summary;
    try {
      summary = await API.getAISummary(appId);
    } catch (err) {
      Components.showToast('AI service response error: ' + err.message, 'warning');
      return;
    }

    const bodyHtml = `
      <div style="font-size: var(--font-size-sm); line-height: 1.6;">
        <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3);">
          <span class="badge badge-info" style="display: flex; align-items: center; gap: 4px;">
            <span class="material-icons-round" style="font-size: 14px;">auto_awesome</span> AI Case Brief
          </span>
          <span style="font-size: var(--font-size-xs); color: var(--text-tertiary);">Decision-Support Only</span>
        </div>

        <div style="background: var(--bg-tertiary); padding: var(--space-3) var(--space-4); border-radius: var(--border-radius); border-left: 4px solid var(--color-primary-500); margin-bottom: var(--space-4);">
          <p style="margin: 0; font-weight: var(--font-weight-medium); color: var(--text-primary);">${Utils.escapeHtml(summary.overview)}</p>
        </div>

        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-2); color: var(--text-primary); font-weight: 600;">
          <span class="material-icons-round" style="font-size: 16px; vertical-align: middle; color: var(--color-warning-700);">fact_check</span> Key Operational Observations
        </h4>
        <ul style="padding-left: var(--space-4); margin-bottom: var(--space-4); color: var(--text-secondary);">
          ${(summary.keyObservations || []).map(o => `<li style="margin-bottom: var(--space-1);">${Utils.escapeHtml(o)}</li>`).join('')}
        </ul>

        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-2); color: var(--text-primary); font-weight: 600;">
          <span class="material-icons-round" style="font-size: 16px; vertical-align: middle; color: var(--color-success-700);">checklist</span> Recommended Next Human Actions
        </h4>
        <ul style="padding-left: var(--space-4); margin-bottom: var(--space-4); color: var(--text-secondary);">
          ${(summary.suggestedNextActions || []).map(a => `<li style="margin-bottom: var(--space-1);">${Utils.escapeHtml(a)}</li>`).join('')}
        </ul>

        <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); background: var(--color-warning-50); border: 1px solid var(--color-warning-100); padding: var(--space-2) var(--space-3); border-radius: var(--border-radius-sm);">
          <strong>⚠ Safeguard Disclaimer:</strong> ${Utils.escapeHtml(summary.disclaimer)}
        </div>
      </div>
    `;

    Components.showModal('AI Case Brief', bodyHtml, `<button class="btn btn-primary" onclick="Components.closeModal()">Dismiss Brief</button>`);
  }
};
