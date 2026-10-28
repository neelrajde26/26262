/* ============================================
   AICTE FlowGuard — Audit Trail Page
   ============================================ */

const AuditPage = {
  currentPage: 1,
  pageSize: 15,
  actionFilter: '',
  entityFilter: '',
  searchQuery: '',

  render() {
    const container = document.getElementById('page-container');
    const audits = Store.getAll('audit').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const totalAudits = audits.length;

    // Filter
    const filtered = audits.filter(item => {
      if (this.actionFilter && item.action !== this.actionFilter) return false;
      if (this.entityFilter && item.entityType !== this.entityFilter) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return (item.actorName && item.actorName.toLowerCase().includes(q)) ||
               (item.details && item.details.toLowerCase().includes(q)) ||
               (item.action && item.action.toLowerCase().includes(q)) ||
               (item.entityId && item.entityId.toLowerCase().includes(q));
      }
      return true;
    });

    const pagination = Utils.paginate(filtered, this.currentPage, this.pageSize);

    const actionOptions = [
      { id: '', label: 'All Actions' },
      { id: 'application_submitted', label: 'Application Submitted' },
      { id: 'application_assigned', label: 'Application Assigned' },
      { id: 'stage_advanced', label: 'Stage Advanced' },
      { id: 'application_returned', label: 'Application Returned' },
      { id: 'application_approved', label: 'Application Approved' },
      { id: 'application_rejected', label: 'Application Rejected' },
      { id: 'evc_scheduled', label: 'EVC Scheduled' },
      { id: 'evc_completed', label: 'EVC Completed' },
      { id: 'evidence_submitted', label: 'Evidence Submitted' },
      { id: 'undertaking_reviewed', label: 'Undertaking Reviewed' },
      { id: 'escalation_triggered', label: 'Escalation Triggered' },
      { id: 'user_login', label: 'User Login' }
    ];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-5); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">System Audit Trail & Provenance Log</h2>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            Tamper-evident, chronological log of all approval transactions, status transitions, review notes, and user actions.
          </p>
        </div>
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn btn-outline btn-sm" onclick="AuditPage.exportJSON()">
            <span class="material-icons-round">code</span> Export JSON Log
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="card" style="margin-bottom: var(--space-5);">
        <div class="card-body" style="padding: var(--space-4);">
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center;">
            <div class="search-box" style="max-width: 340px; flex: 1;">
              <span class="material-icons-round search-icon">search</span>
              <input type="search" id="audit-search" class="search-input" placeholder="Search actor, action, details, IDs..." value="${Utils.escapeHtml(this.searchQuery)}">
            </div>
            <select id="audit-action-filter" class="form-input" style="width: auto;">
              ${actionOptions.map(opt => `<option value="${opt.id}" ${this.actionFilter === opt.id ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </select>
            <select id="audit-entity-filter" class="form-input" style="width: auto;">
              <option value="">All Entities</option>
              <option value="application" ${this.entityFilter === 'application' ? 'selected' : ''}>Applications</option>
              <option value="undertaking" ${this.entityFilter === 'undertaking' ? 'selected' : ''}>Undertakings</option>
              <option value="document" ${this.entityFilter === 'document' ? 'selected' : ''}>Documents</option>
              <option value="evc" ${this.entityFilter === 'evc' ? 'selected' : ''}>EVC Visits</option>
              <option value="user" ${this.entityFilter === 'user' ? 'selected' : ''}>User Auth</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Audit Entries Card -->
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <h4>Immutable Audit Stream</h4>
          <span style="font-size: var(--font-size-xs); color: var(--text-tertiary);">${filtered.length} entries recorded</span>
        </div>
        <div class="card-body" style="padding: 0 var(--space-4);">
          ${filtered.length === 0 ? `
            <div class="empty-state">
              <span class="material-icons-round">history_toggle_off</span>
              <h3>No Audit Records Found</h3>
              <p>No audit stream records match your search or filter settings.</p>
            </div>
          ` : `
            <div>
              ${pagination.items.map(entry => {
                const actionLabels = {
                  application_submitted: { icon: 'send', color: 'var(--color-primary-600)', label: 'Application Submitted' },
                  application_assigned: { icon: 'assignment_ind', color: 'var(--color-info-600)', label: 'Assigned for Scrutiny' },
                  stage_advanced: { icon: 'arrow_forward', color: 'var(--color-primary-600)', label: 'Stage Advanced' },
                  application_returned: { icon: 'undo', color: 'var(--color-warning-700)', label: 'Application Returned' },
                  application_approved: { icon: 'verified', color: 'var(--color-success-600)', label: 'Application Approved' },
                  application_rejected: { icon: 'cancel', color: 'var(--color-danger-600)', label: 'Application Rejected' },
                  evc_scheduled: { icon: 'event', color: 'var(--color-info-600)', label: 'EVC Visit Scheduled' },
                  evc_completed: { icon: 'rate_review', color: 'var(--color-success-600)', label: 'EVC Report Filed' },
                  undertaking_created: { icon: 'add_task', color: 'var(--color-primary-600)', label: 'Undertaking Assigned' },
                  evidence_submitted: { icon: 'cloud_upload', color: 'var(--color-info-600)', label: 'Evidence Uploaded' },
                  undertaking_reviewed: { icon: 'fact_check', color: 'var(--color-success-600)', label: 'Compliance Reviewed' },
                  escalation_triggered: { icon: 'priority_high', color: 'var(--color-danger-600)', label: 'SLA Escalation Triggered' },
                  user_login: { icon: 'login', color: 'var(--text-secondary)', label: 'User Login' },
                  user_logout: { icon: 'logout', color: 'var(--text-secondary)', label: 'User Logout' },
                };

                const act = actionLabels[entry.action] || { icon: 'circle', color: 'var(--text-secondary)', label: entry.action };

                return `
                  <div class="audit-entry" style="cursor: pointer;" onclick="AuditPage.showEntryModal('${entry.id}')">
                    <div style="width: 32px; height: 32px; border-radius: var(--border-radius-full); background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${act.color};">
                      <span class="material-icons-round" style="font-size: 18px;">${act.icon}</span>
                    </div>
                    <div style="flex: 1;">
                      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); flex-wrap: wrap;">
                        <div>
                          <span class="audit-actor">${Utils.escapeHtml(entry.actorName)}</span>
                          <span class="badge badge-neutral" style="font-size: 10px; margin-left: var(--space-1);">${act.label}</span>
                          ${entry.entityType ? `<span class="badge badge-info" style="font-size: 10px;">${entry.entityType}</span>` : ''}
                        </div>
                        <span class="audit-time">${Utils.timeAgo(entry.timestamp)} • ${Utils.formatDateTime(entry.timestamp)}</span>
                      </div>
                      <div style="margin-top: 4px; color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.4;">
                        ${Utils.escapeHtml(entry.details)}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${Utils.paginationHtml(pagination, 'AuditPage.goToPage')}
          `}
        </div>
      </div>
    `;

    // Event listeners
    const searchEl = document.getElementById('audit-search');
    if (searchEl) {
      searchEl.addEventListener('input', Utils.debounce((e) => {
        this.searchQuery = e.target.value.trim();
        this.currentPage = 1;
        this.render();
      }, 300));
    }

    const actionFilter = document.getElementById('audit-action-filter');
    if (actionFilter) {
      actionFilter.addEventListener('change', (e) => {
        this.actionFilter = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    const entityFilter = document.getElementById('audit-entity-filter');
    if (entityFilter) {
      entityFilter.addEventListener('change', (e) => {
        this.entityFilter = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }
  },

  goToPage(page) {
    this.currentPage = page;
    this.render();
  },

  showEntryModal(id) {
    const entry = Store.getById('audit', id);
    if (!entry) return;

    const bodyHtml = `
      <div style="font-size: var(--font-size-sm);">
        <div class="detail-grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div>
            <span class="detail-label">Audit ID</span>
            <span class="detail-value" style="font-family: var(--font-mono);">${entry.id}</span>
          </div>
          <div>
            <span class="detail-label">Timestamp</span>
            <span class="detail-value">${Utils.formatDateTime(entry.timestamp)}</span>
          </div>
          <div>
            <span class="detail-label">Actor</span>
            <span class="detail-value">${Utils.escapeHtml(entry.actorName)} (${entry.actor})</span>
          </div>
          <div>
            <span class="detail-label">Action</span>
            <span class="detail-value"><span class="badge badge-primary">${entry.action}</span></span>
          </div>
          <div>
            <span class="detail-label">Entity Type</span>
            <span class="detail-value">${entry.entityType || '—'}</span>
          </div>
          <div>
            <span class="detail-label">Entity ID</span>
            <span class="detail-value" style="font-family: var(--font-mono);">${entry.entityId || '—'}</span>
          </div>
        </div>

        <div>
          <span class="detail-label">Action Details & Remarks</span>
          <div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--border-radius); margin-top: 4px; line-height: 1.5;">
            ${Utils.escapeHtml(entry.details)}
          </div>
        </div>
      </div>
    `;

    const footerHtml = `<button class="btn btn-primary" onclick="Components.closeModal()">Close</button>`;
    Components.showModal('Audit Transaction Record', bodyHtml, footerHtml);
  },

  exportJSON() {
    const audits = Store.getAll('audit');
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(audits, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', jsonStr);
    link.setAttribute('download', `aicte_flowguard_audit_${Utils.today()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Components.showToast('Audit Log successfully exported as JSON!', 'success');
  }
};
