/* ============================================
   AICTE FlowGuard — Undertakings & Compliance Page
   ============================================ */

const UndertakingsPage = {
  currentFilter: 'all',
  searchQuery: '',

  async render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();
    const isInstitution = session?.role === 'institution';
    const canReview = Auth.hasPermission('review_undertaking');
    const canCreate = ['admin', 'regional_officer', 'bureau_officer'].includes(session?.role);

    container.innerHTML = Components.renderLoadingState('Loading compliance undertakings...');

    try {
      await Store.fetchUndertakings();
    } catch (err) {
      console.error('Failed to load undertakings:', err);
    }

    let undertakings = Store.getAll('undertakings');
    undertakings = Auth.filterByScope(undertakings, 'undertaking');

    const total = undertakings.length;
    const pending = undertakings.filter(u => u.status === 'pending').length;
    const submitted = undertakings.filter(u => u.status === 'submitted').length;
    const verified = undertakings.filter(u => u.status === 'verified').length;
    const overdue = undertakings.filter(u => u.status === 'overdue' || (u.dueDate && Utils.daysUntil(u.dueDate) < 0 && u.status === 'pending')).length;

    // Filter list
    const filtered = undertakings.filter(u => {
      if (this.currentFilter !== 'all' && u.status !== this.currentFilter) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return (u.condition && u.condition.toLowerCase().includes(q)) ||
               (u.institutionName && u.institutionName.toLowerCase().includes(q)) ||
               (u.requiredEvidence && u.requiredEvidence.toLowerCase().includes(q));
      }
      return true;
    });

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-5); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">Institutional Undertakings & Compliance</h2>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            Monitor condition fulfillments, track evidence submissions, verify compliance deadlines, and log escalations.
          </p>
        </div>
        ${canCreate ? `
          <button class="btn btn-primary" onclick="UndertakingsPage.showAddModal()">
            <span class="material-icons-round">add</span> Assign Undertaking
          </button>
        ` : ''}
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-primary-50); color: var(--color-primary-600);">
            <span class="material-icons-round">fact_check</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Conditions</span>
            <span class="stat-value">${total}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-warning-50); color: var(--color-warning-700);">
            <span class="material-icons-round">hourglass_empty</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Pending Evidence</span>
            <span class="stat-value">${pending}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-info-50); color: var(--color-info-700);">
            <span class="material-icons-round">rate_review</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Under Review</span>
            <span class="stat-value">${submitted}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-success-50); color: var(--color-success-700);">
            <span class="material-icons-round">verified</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Verified Compliant</span>
            <span class="stat-value">${verified}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-danger-50); color: var(--color-danger-700);">
            <span class="material-icons-round">alarm</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Overdue</span>
            <span class="stat-value" style="color: var(--color-danger-500);">${overdue}</span>
          </div>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="card" style="margin-bottom: var(--space-5);">
        <div class="card-body" style="padding: var(--space-4);">
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center;">
            <div class="search-box" style="max-width: 340px; flex: 1;">
              <span class="material-icons-round search-icon">search</span>
              <input type="search" id="undertakings-search" class="search-input" placeholder="Search conditions, institution..." value="${Utils.escapeHtml(this.searchQuery)}">
            </div>
            <select id="undertakings-filter" class="form-input" style="width: auto;">
              <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="pending" ${this.currentFilter === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="submitted" ${this.currentFilter === 'submitted' ? 'selected' : ''}>Submitted (Review Needed)</option>
              <option value="verified" ${this.currentFilter === 'verified' ? 'selected' : ''}>Verified</option>
              <option value="returned" ${this.currentFilter === 'returned' ? 'selected' : ''}>Returned</option>
              <option value="overdue" ${this.currentFilter === 'overdue' ? 'selected' : ''}>Overdue</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Undertakings List -->
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <span class="material-icons-round">checklist</span>
          <h3>No Compliance Records Found</h3>
          <p>No institutional undertakings match your current filter criteria.</p>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          ${filtered.map(und => {
            const dueDays = Utils.daysUntil(und.dueDate);
            const isLate = dueDays < 0;
            const submissions = und.submissions || [];

            return `
              <div class="card undertaking-card ${und.status === 'overdue' ? 'overdue-card' : ''}" style="${und.status === 'overdue' ? 'border-left-color: var(--color-danger-500);' : ''}">
                <div class="card-body">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-2);">
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
                        <span style="font-weight: var(--font-weight-bold); font-size: var(--font-size-base); color: var(--text-primary);">${Utils.escapeHtml(und.institutionName)}</span>
                        ${und.applicationId ? `<span class="badge badge-neutral" style="cursor:pointer;" onclick="Router.navigate('application-detail', { id: '${und.applicationId}' })">App #${und.applicationId}</span>` : ''}
                      </div>
                      <h4 style="font-size: var(--font-size-base); font-weight: var(--font-weight-medium); color: var(--color-primary-600); line-height: 1.4;">
                        ${Utils.escapeHtml(und.condition)}
                      </h4>
                    </div>
                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                      ${Utils.statusBadge(und.status)}
                      ${isLate && und.status !== 'verified' ? `<span class="badge badge-danger"><span class="material-icons-round">priority_high</span> ${Math.abs(dueDays)}d overdue</span>` : ''}
                      ${!isLate && dueDays <= 15 && und.status !== 'verified' ? `<span class="badge badge-warning"><span class="material-icons-round">schedule</span> ${dueDays}d left</span>` : ''}
                    </div>
                  </div>

                  <div class="detail-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); margin: var(--space-3) 0; font-size: var(--font-size-xs); background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--border-radius);">
                    <div>
                      <span class="detail-label">Compliance Due Date</span>
                      <span class="detail-value ${isLate && und.status !== 'verified' ? 'overdue' : ''}">
                        ${Utils.formatDate(und.dueDate)} (${Utils.getAgeDisplay(dueDays)})
                      </span>
                    </div>
                    <div>
                      <span class="detail-label">Required Evidence</span>
                      <span class="detail-value">${Utils.escapeHtml(und.requiredEvidence)}</span>
                    </div>
                    <div>
                      <span class="detail-label">Verification Officer</span>
                      <span class="detail-value">${Utils.escapeHtml(und.verificationOwnerName || 'Unassigned')}</span>
                    </div>
                  </div>

                  <!-- Submissions Section -->
                  ${submissions.length > 0 ? `
                    <div class="evidence-list">
                      <strong style="font-size: var(--font-size-xs); color: var(--text-secondary); text-transform: uppercase;">Submitted Evidence History:</strong>
                      ${submissions.map((sub) => {
                        const filePath = sub.storedPath || sub.stored_path;
                        return `
                        <div class="evidence-item" style="margin-top: var(--space-2); display: flex; justify-content: space-between; align-items: center;">
                          <div class="evidence-file" style="display: flex; align-items: center; gap: var(--space-2);">
                            <span class="material-icons-round">description</span>
                            <div>
                              <div style="font-weight: var(--font-weight-medium);">${Utils.escapeHtml(sub.fileName || sub.file_name)}</div>
                              <div style="font-size: var(--font-size-xs); color: var(--text-tertiary);">Submitted by ${Utils.escapeHtml(sub.submitterName || sub.submitter_name || 'Staff')} • ${Utils.formatDateTime(sub.submittedAt || sub.submitted_at)}</div>
                              ${sub.reviewNotes || sub.review_notes ? `<div style="font-size: var(--font-size-xs); color: var(--color-warning-800); margin-top: 2px;"><strong>Review:</strong> ${Utils.escapeHtml(sub.reviewNotes || sub.review_notes)}</div>` : ''}
                            </div>
                          </div>
                          <div style="display: flex; align-items: center; gap: var(--space-2);">
                            ${filePath ? `
                              <a href="${API.getFileUrl(filePath)}" target="_blank" class="btn btn-ghost btn-xs" title="Download Evidence File">
                                <span class="material-icons-round">download</span> File
                              </a>
                            ` : ''}
                            ${Utils.statusBadge(sub.status)}
                          </div>
                        </div>
                      `;}).join('')}
                    </div>
                  ` : `
                    <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); font-style: italic; margin-top: var(--space-2);">
                      No evidence has been submitted yet.
                    </div>
                  `}
                </div>

                <!-- Footer Actions -->
                <div class="card-footer" style="display: flex; justify-content: flex-end; gap: var(--space-2); background: transparent; border-top: 1px solid var(--border-color); padding: var(--space-3);">
                  ${isInstitution && ['pending', 'returned', 'overdue'].includes(und.status) ? `
                    <button class="btn btn-primary btn-sm" onclick="UndertakingsPage.showSubmitEvidenceModal('${und.id}')">
                      <span class="material-icons-round">upload_file</span> Submit Evidence
                    </button>
                  ` : ''}

                  ${canReview && ['submitted', 'pending', 'overdue'].includes(und.status) ? `
                    <button class="btn btn-outline btn-sm" onclick="UndertakingsPage.showReviewModal('${und.id}')">
                      <span class="material-icons-round">fact_check</span> Review & Verify
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    // Event listeners
    const searchEl = document.getElementById('undertakings-search');
    if (searchEl) {
      searchEl.addEventListener('input', Utils.debounce((e) => {
        this.searchQuery = e.target.value.trim();
        this.render();
      }, 300));
    }

    const filterEl = document.getElementById('undertakings-filter');
    if (filterEl) {
      filterEl.addEventListener('change', (e) => {
        this.currentFilter = e.target.value;
        this.render();
      });
    }
  },

  showAddModal() {
    const institutions = Store.getAll('institutions');
    const officers = Store.getAll('users').filter(u => ['regional_officer', 'bureau_officer'].includes(u.role));

    const bodyHtml = `
      <form id="add-undertaking-form" onsubmit="event.preventDefault(); UndertakingsPage.handleAddSubmit();">
        <div class="form-group">
          <label class="form-label">Institution *</label>
          <select id="modal-und-inst" class="form-input" required>
            <option value="">Select Institution</option>
            ${institutions.map(inst => `<option value="${inst.id}">${Utils.escapeHtml(inst.name)} (${inst.state})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Compliance Condition / Undertaking *</label>
          <textarea id="modal-und-condition" class="form-input" rows="3" required placeholder="e.g. Fulfill student-faculty ratio 15:1; construct boundary wall; fire safety NOC..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Required Evidence Description *</label>
          <input type="text" id="modal-und-evidence" class="form-input" required placeholder="e.g. Appointment letters, Biometric records, Fire NOC from State Dept...">
        </div>
        <div class="form-group">
          <label class="form-label">Compliance Due Date *</label>
          <input type="date" id="modal-und-duedate" class="form-input" required value="${Utils.dateOffset(30)}" min="${Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Verification Officer *</label>
          <select id="modal-und-owner" class="form-input" required>
            ${officers.map(o => `<option value="${o.id}">${Utils.escapeHtml(o.fullName)} (${o.role})</option>`).join('')}
          </select>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-create-undertaking" onclick="UndertakingsPage.handleAddSubmit()">
        <span class="material-icons-round">check</span> Create Condition
      </button>
    `;

    Components.showModal('Assign Institutional Undertaking', bodyHtml, footerHtml);
  },

  async handleAddSubmit() {
    const instSelect = document.getElementById('modal-und-inst');
    const conditionInput = document.getElementById('modal-und-condition');
    const evidenceInput = document.getElementById('modal-und-evidence');
    const duedateInput = document.getElementById('modal-und-duedate');
    const ownerSelect = document.getElementById('modal-und-owner');
    const btn = document.getElementById('btn-create-undertaking');

    if (!instSelect || !instSelect.value || !conditionInput.value.trim() || !evidenceInput.value.trim() || !duedateInput.value) {
      Components.showToast('Please fill out all required fields.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Creating...`;
    }

    try {
      await Store.createUndertaking({
        institutionId: instSelect.value,
        condition: conditionInput.value.trim(),
        requiredEvidence: evidenceInput.value.trim(),
        dueDate: duedateInput.value,
        verificationOwner: ownerSelect.value
      });

      Components.closeModal();
      Components.showToast('Undertaking requirement recorded successfully!', 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to create undertaking', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons-round">check</span> Create Condition`;
      }
    }
  },

  showSubmitEvidenceModal(undertakingId) {
    const und = Store.getById('undertakings', undertakingId);
    if (!und) return;

    const bodyHtml = `
      <form id="submit-evidence-form" onsubmit="event.preventDefault(); UndertakingsPage.handleSubmitEvidenceSubmit('${undertakingId}');">
        <div class="form-group">
          <label class="form-label">Condition</label>
          <div style="font-weight: var(--font-weight-medium); padding: var(--space-2) 0;">${Utils.escapeHtml(und.condition)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Required Document/Evidence</label>
          <div style="font-size: var(--font-size-xs); color: var(--text-secondary);">${Utils.escapeHtml(und.requiredEvidence)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Upload Evidence File (.pdf, .png, .jpg, .docx)</label>
          <input type="file" id="modal-ev-file" class="form-input" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.doc,.docx">
        </div>
        <div class="form-group">
          <label class="form-label">Evidence Document Label / Title *</label>
          <input type="text" id="modal-ev-filename" class="form-input" required placeholder="e.g. fire_safety_noc_signed_2026.pdf" value="compliance_proof_${Date.now().toString(36)}.pdf">
        </div>
        <div class="form-group">
          <label class="form-label">Institutional Declaration / Submission Notes</label>
          <textarea id="modal-ev-notes" class="form-input" rows="3" placeholder="Describe the uploaded evidence, validity details, or official letter reference..."></textarea>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-submit-ev" onclick="UndertakingsPage.handleSubmitEvidenceSubmit('${undertakingId}')">
        <span class="material-icons-round">cloud_upload</span> Upload & Submit
      </button>
    `;

    Components.showModal('Submit Compliance Evidence', bodyHtml, footerHtml);
  },

  async handleSubmitEvidenceSubmit(undertakingId) {
    const fileInput = document.getElementById('modal-ev-file');
    const filenameInput = document.getElementById('modal-ev-filename');
    const notesInput = document.getElementById('modal-ev-notes');
    const btn = document.getElementById('btn-submit-ev');

    const file = fileInput?.files?.[0];
    const fileLabel = filenameInput ? filenameInput.value.trim() : '';

    if (!file && !fileLabel) {
      Components.showToast('Please provide a file or document title.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Uploading...`;
    }

    try {
      await Store.submitEvidence(undertakingId, file || fileLabel, notesInput ? notesInput.value.trim() : '');
      Components.closeModal();
      Components.showToast('Evidence submitted successfully for verification!', 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to submit evidence', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons-round">cloud_upload</span> Upload & Submit`;
      }
    }
  },

  showReviewModal(undertakingId) {
    const und = Store.getById('undertakings', undertakingId);
    if (!und) return;

    const submissions = und.submissions || [];
    const latestSub = submissions.length > 0 ? submissions[submissions.length - 1] : null;

    const bodyHtml = `
      <div style="font-size: var(--font-size-sm); margin-bottom: var(--space-4);">
        <p><strong>Institution:</strong> ${Utils.escapeHtml(und.institutionName)}</p>
        <p><strong>Condition:</strong> ${Utils.escapeHtml(und.condition)}</p>
        <p><strong>Required:</strong> ${Utils.escapeHtml(und.requiredEvidence)}</p>
        ${latestSub ? `
          <div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--border-radius); margin-top: var(--space-2);">
            <strong>Submitted File:</strong> ${Utils.escapeHtml(latestSub.fileName || latestSub.file_name)}
            ${(latestSub.storedPath || latestSub.stored_path) ? `
              <a href="${API.getFileUrl(latestSub.storedPath || latestSub.stored_path)}" target="_blank" class="btn btn-ghost btn-xs" style="margin-left: 8px;">
                <span class="material-icons-round">download</span> Download
              </a>
            ` : ''}<br>
            <strong>Date:</strong> ${Utils.formatDateTime(latestSub.submittedAt || latestSub.submitted_at)} by ${Utils.escapeHtml(latestSub.submitterName || latestSub.submitter_name || 'Staff')}
          </div>
        ` : ''}
      </div>

      <form id="review-undertaking-form" onsubmit="event.preventDefault(); UndertakingsPage.handleReviewSubmit('${undertakingId}');">
        <div class="form-group">
          <label class="form-label">Review Decision *</label>
          <select id="modal-review-decision" class="form-input" required>
            <option value="verified">Accept & Verify (Condition Complied)</option>
            <option value="returned">Return for Clarification / Deficient Document</option>
            <option value="rejected">Reject Submission (Unsatisfactory)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Verification Remarks & Feedback *</label>
          <textarea id="modal-review-notes" class="form-input" rows="3" required placeholder="Enter remarks on validity, completeness, and official verification findings..."></textarea>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-review" onclick="UndertakingsPage.handleReviewSubmit('${undertakingId}')">
        <span class="material-icons-round">task_alt</span> Save Verification
      </button>
    `;

    Components.showModal('Review Compliance Undertaking', bodyHtml, footerHtml);
  },

  async handleReviewSubmit(undertakingId) {
    const decisionSelect = document.getElementById('modal-review-decision');
    const notesInput = document.getElementById('modal-review-notes');
    const btn = document.getElementById('btn-save-review');

    if (!notesInput || !notesInput.value.trim()) {
      Components.showToast('Please provide verification remarks.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Saving...`;
    }

    const decision = decisionSelect.value;

    try {
      await Store.reviewUndertaking(undertakingId, decision, notesInput.value.trim());
      Components.closeModal();
      Components.showToast(`Undertaking marked as ${decision}!`, 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to review undertaking', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons-round">task_alt</span> Save Verification`;
      }
    }
  }
};
