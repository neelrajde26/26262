/* ============================================
   AICTE FlowGuard — Applications List Page
   ============================================ */

const ApplicationsPage = {
  currentPage: 1,
  filters: { status: '', region: '', type: '', search: '' },

  render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();

    // Get filtered & scoped data
    let apps = Auth.filterByScope(Store.getAll('applications'), 'application');
    apps = this.applyFilters(apps);

    // Sort by submission date, newest first
    apps.sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));

    const pagination = Utils.paginate(apps, this.currentPage, 10);
    const regions = Store.getAll('regions');

    container.innerHTML = `
      <div class="app-list-header">
        <div>
          <h3 style="font-size: var(--font-size-lg); margin-bottom: var(--space-1);">Applications</h3>
          <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">${apps.length} application${apps.length !== 1 ? 's' : ''} found</p>
        </div>
        ${session.role === 'institution' ?
          `<button class="btn btn-primary" onclick="ApplicationsPage.showNewApplicationModal()">
            <span class="material-icons-round">add</span> New Application
          </button>` : ''
        }
      </div>

      <!-- Filters -->
      <div class="filters-bar" style="margin-bottom: var(--space-4);">
        <span class="material-icons-round" style="color: var(--text-tertiary);">filter_list</span>
        <input type="search" class="form-input" placeholder="Search by ID or institution..."
          value="${Utils.escapeHtml(this.filters.search)}"
          oninput="ApplicationsPage.onFilterChange('search', this.value)"
          id="app-filter-search">
        <select class="form-select" onchange="ApplicationsPage.onFilterChange('status', this.value)" id="app-filter-status">
          <option value="">All Statuses</option>
          <option value="scrutiny" ${this.filters.status === 'scrutiny' ? 'selected' : ''}>Scrutiny</option>
          <option value="returned" ${this.filters.status === 'returned' ? 'selected' : ''}>Returned</option>
          <option value="evc-pending" ${this.filters.status === 'evc-pending' ? 'selected' : ''}>EVC Pending</option>
          <option value="evc-scheduled" ${this.filters.status === 'evc-scheduled' ? 'selected' : ''}>EVC Scheduled</option>
          <option value="evc-completed" ${this.filters.status === 'evc-completed' ? 'selected' : ''}>EVC Completed</option>
          <option value="sac-review" ${this.filters.status === 'sac-review' ? 'selected' : ''}>SAC Review</option>
          <option value="shc-review" ${this.filters.status === 'shc-review' ? 'selected' : ''}>SHC Review</option>
          <option value="approved" ${this.filters.status === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="rejected" ${this.filters.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
        ${session.role !== 'institution' ? `
        <select class="form-select" onchange="ApplicationsPage.onFilterChange('region', this.value)" id="app-filter-region">
          <option value="">All Regions</option>
          ${regions.map(r => `<option value="${r.id}" ${this.filters.region === r.id ? 'selected' : ''}>${Utils.escapeHtml(r.name)}</option>`).join('')}
        </select>` : ''}
        <select class="form-select" onchange="ApplicationsPage.onFilterChange('type', this.value)" id="app-filter-type">
          <option value="">All Types</option>
          <option value="new-institution" ${this.filters.type === 'new-institution' ? 'selected' : ''}>New Institution</option>
          <option value="new-program" ${this.filters.type === 'new-program' ? 'selected' : ''}>New Program</option>
          <option value="intake-change" ${this.filters.type === 'intake-change' ? 'selected' : ''}>Intake Change</option>
          <option value="show-cause" ${this.filters.type === 'show-cause' ? 'selected' : ''}>Show Cause</option>
        </select>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Application ID</th>
                <th>Institution</th>
                <th>Type</th>
                <th>Stage</th>
                <th>Assigned To</th>
                <th>Due Date</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              ${pagination.items.length === 0 ?
                `<tr><td colspan="7"><div class="empty-state" style="padding: var(--space-6);"><span class="material-icons-round">search_off</span><h3>No applications found</h3><p>Try adjusting your filters.</p></div></td></tr>` :
                pagination.items.map(a => this.renderRow(a)).join('')
              }
            </tbody>
          </table>
        </div>
        ${Utils.paginationHtml(pagination, 'ApplicationsPage.goToPage')}
      </div>

      <p style="margin-top: var(--space-4); font-size: var(--font-size-xs); color: var(--text-tertiary);">
        ⚠ Demo data — all institutions, IDs, and dates are fictional.
      </p>
    `;
  },

  renderRow(app) {
    const days = app.submittedDate ? Utils.daysAgo(app.submittedDate) : 0;
    const dueDate = app.currentStageDueDate;
    const dueDays = dueDate ? Utils.daysUntil(dueDate) : null;
    const isOverdue = dueDays !== null && dueDays < 0 && !['approved', 'rejected', 'cancelled'].includes(app.status);
    const isApproaching = dueDays !== null && dueDays >= 0 && dueDays <= 5 && !['approved', 'rejected', 'cancelled'].includes(app.status);

    const typeLabels = {
      'new-institution': 'New Institution',
      'new-program': 'New Program',
      'intake-change': 'Intake Change',
      'show-cause': 'Show Cause',
      'closure': 'Closure',
      'minor-modification': 'Minor Modification',
      'verification-visit': 'Verification Visit',
    };

    return `
      <tr class="clickable" onclick="Router.navigate('application-detail', {id:'${app.id}'})">
        <td>
          <div class="app-id-cell">${Utils.escapeHtml(app.applicationNumber)}</div>
          ${app.isNewInstitution ? '<span class="badge badge-info" style="margin-top:2px"><span class="material-icons-round">star</span> New</span>' : ''}
        </td>
        <td class="institution-cell">
          <div class="institution-name">${Utils.escapeHtml(app.institutionName)}</div>
          <div class="institution-location">${Utils.escapeHtml(app.programName || '')}</div>
        </td>
        <td><span class="badge badge-neutral">${Utils.escapeHtml(typeLabels[app.type] || app.type)}</span></td>
        <td>${Utils.statusBadge(app.currentStage)}</td>
        <td style="font-size: var(--font-size-sm)">${Utils.escapeHtml(app.assignedOfficerName || '—')}</td>
        <td>
          ${dueDate && !['approved', 'rejected', 'cancelled'].includes(app.status) ?
            `<span class="${isOverdue ? 'overdue' : (isApproaching ? 'approaching' : '')}">${Utils.formatDate(dueDate)}</span>` :
            '—'
          }
        </td>
        <td class="age-cell ${isOverdue ? 'overdue' : ''}">
          ${days}d
          ${isOverdue ? '<span class="material-icons-round" style="font-size:14px;vertical-align:middle;color:var(--color-danger-500)">warning</span>' : ''}
        </td>
      </tr>
    `;
  },

  applyFilters(apps) {
    return apps.filter(a => {
      if (this.filters.status && a.status !== this.filters.status) return false;
      if (this.filters.region && a.region !== this.filters.region) return false;
      if (this.filters.type && a.type !== this.filters.type) return false;
      if (this.filters.search) {
        const q = this.filters.search.toLowerCase();
        if (!a.applicationNumber.toLowerCase().includes(q) &&
            !a.institutionName.toLowerCase().includes(q) &&
            !(a.programName || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  },

  onFilterChange(key, value) {
    this.filters[key] = value;
    this.currentPage = 1;
    this.render();
  },

  goToPage(page) {
    ApplicationsPage.currentPage = page;
    ApplicationsPage.render();
  },

  showNewApplicationModal() {
    const session = Auth.getSession();
    if (session.role !== 'institution') return;

    const templates = Store.getAll('workflowTemplates');
    Components.showModal('New Application', `
      <p style="font-size: var(--font-size-sm); color: var(--text-tertiary); margin-bottom: var(--space-4);">
        ⚠ Demo form — not a real application submission.
      </p>
      <div class="form-group">
        <label class="form-label">Application Type</label>
        <select class="form-select" id="new-app-type">
          <option value="new-program">New Program</option>
          <option value="intake-change">Intake Change</option>
          <option value="new-institution">New Institution</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Program / Subject</label>
        <input type="text" class="form-input" id="new-app-program" placeholder="e.g., B.Tech Electrical Engineering">
      </div>
      <div class="form-group">
        <label class="form-label">Workflow Template</label>
        <select class="form-select" id="new-app-workflow">
          ${templates.map(t => `<option value="${t.id}">${Utils.escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="new-app-notes" placeholder="Additional notes..."></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ApplicationsPage.submitNewApplication()">
        <span class="material-icons-round">send</span> Submit Application
      </button>
    `);
  },

  submitNewApplication() {
    const session = Auth.getSession();
    const type = document.getElementById('new-app-type').value;
    const program = document.getElementById('new-app-program').value.trim();
    const workflowId = document.getElementById('new-app-workflow').value;
    const notes = document.getElementById('new-app-notes').value.trim();

    if (!program) {
      Components.showToast('Please enter a program name', 'error');
      return;
    }

    const institution = Store.getById('institutions', session.institutionId);
    const region = institution?.region || session.region;
    const regionCode = Store.getById('regions', region)?.code || 'XX';
    const year = new Date().getFullYear();
    const seq = String(Store.count('applications') + 1).padStart(4, '0');

    const template = Store.getById('workflowTemplates', workflowId);
    const firstStage = template?.stages?.[0]?.id || 'scrutiny';

    const app = Store.create('applications', {
      applicationNumber: `FG/${regionCode}/${year}/${seq}`,
      institutionId: session.institutionId,
      institutionName: institution?.name || 'Unknown',
      type,
      programName: program,
      workflowTemplateId: workflowId,
      currentStage: firstStage,
      status: firstStage,
      region,
      assignedOfficer: null,
      assignedOfficerName: null,
      submittedDate: Utils.today(),
      currentStageDueDate: Utils.dateOffset(template?.stages?.[0]?.timelineDays || 15),
      stageHistory: [
        { stage: 'submitted', date: Utils.now(), actor: session.userId, actorName: session.fullName, action: 'Application submitted', notes: notes || '' },
      ],
      observations: notes,
      attachments: ['application_form.pdf'],
      priority: type === 'new-institution' ? 'high' : 'normal',
      isNewInstitution: type === 'new-institution',
    });

    Store.addAudit({
      actor: session.userId,
      actorName: session.fullName,
      action: 'application_submitted',
      entityType: 'application',
      entityId: app.id,
      details: `New ${type} application submitted: ${program}`,
    });

    Components.closeModal();
    Components.showToast('Application submitted successfully', 'success', 'Application Created');
    this.render();
  }
};
