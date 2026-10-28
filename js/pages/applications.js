/* ============================================
   AICTE FlowGuard — Applications List Page
   Synchronized directly with SQLite Backend
   ============================================ */

const ApplicationsPage = {
  currentPage: 1,
  filters: { status: '', region: '', type: '', search: '' },

  async render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();

    // Render loading feedback
    container.innerHTML = Components.renderLoadingState('Fetching live applications from AICTE FlowGuard database...');

    try {
      await Store.fetchApplications();
    } catch (err) {
      container.innerHTML = Components.renderErrorState(
        'Failed to Load Applications',
        err.message || 'Error communicating with backend server',
        'ApplicationsPage.render()'
      );
      return;
    }

    // Get scoped applications from Store
    let apps = Auth.filterByScope(Store.getAll('applications'), 'application');
    apps = this.applyFilters(apps);

    // Sort by submission date, newest first
    apps.sort((a, b) => new Date(b.submittedDate || b.submitted_date) - new Date(a.submittedDate || a.submitted_date));

    const pagination = Utils.paginate(apps, this.currentPage, 10);
    const regions = Store.getAll('regions');

    container.innerHTML = `
      <div class="app-list-header">
        <div>
          <h3 style="font-size: var(--font-size-lg); margin-bottom: var(--space-1); font-weight: 600;">Applications</h3>
          <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">${apps.length} application${apps.length !== 1 ? 's' : ''} in your active jurisdiction</p>
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
        <input type="search" class="form-input" placeholder="Search by ID, program, institution..."
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
                <th>Assigned Officer</th>
                <th>SLA Due Date</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              ${pagination.items.length === 0 ?
                `<tr><td colspan="7"><div class="empty-state" style="padding: var(--space-6);"><span class="material-icons-round">search_off</span><h3>No applications found</h3><p>No applications match the selected filter criteria.</p></div></td></tr>` :
                pagination.items.map(a => this.renderRow(a)).join('')
              }
            </tbody>
          </table>
        </div>
        ${Utils.paginationHtml(pagination, 'ApplicationsPage.goToPage')}
      </div>
    `;
  },

  renderRow(app) {
    const appNum = app.applicationNumber || app.application_number;
    const instName = app.institutionName || app.institution_name;
    const progName = app.programName || app.program_name || '';
    const subDate = app.submittedDate || app.submitted_date;
    const days = subDate ? Utils.daysAgo(subDate) : 0;
    const dueDate = app.currentStageDueDate || app.current_stage_due_date;
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
          <div class="app-id-cell">${Utils.escapeHtml(appNum)}</div>
          ${app.isNewInstitution || app.is_new_institution ? '<span class="badge badge-info" style="margin-top:2px"><span class="material-icons-round">star</span> New</span>' : ''}
        </td>
        <td class="institution-cell">
          <div class="institution-name">${Utils.escapeHtml(instName)}</div>
          <div class="institution-location">${Utils.escapeHtml(progName)}</div>
        </td>
        <td><span class="badge badge-neutral">${Utils.escapeHtml(typeLabels[app.type] || app.type)}</span></td>
        <td>${Utils.statusBadge(app.currentStage || app.current_stage)}</td>
        <td style="font-size: var(--font-size-sm)">${Utils.escapeHtml(app.assignedOfficerName || app.assigned_officer_name || '—')}</td>
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
      const status = a.status;
      const region = a.region;
      const type = a.type;
      const appNum = (a.applicationNumber || a.application_number || '').toLowerCase();
      const instName = (a.institutionName || a.institution_name || '').toLowerCase();
      const progName = (a.programName || a.program_name || '').toLowerCase();

      if (this.filters.status && status !== this.filters.status) return false;
      if (this.filters.region && region !== this.filters.region) return false;
      if (this.filters.type && type !== this.filters.type) return false;
      if (this.filters.search) {
        const q = this.filters.search.toLowerCase();
        if (!appNum.includes(q) && !instName.includes(q) && !progName.includes(q)) return false;
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

    let templates = Store.getAll('workflowTemplates');
    if (!templates.length) {
      templates = [
        { id: 'wf-scrutiny-evc-sac', name: 'Scrutiny + EVC + SAC' },
        { id: 'wf-scrutiny-only', name: 'Scrutiny Only' }
      ];
    }

    Components.showModal('File New AICTE Application', `
      <div class="form-group">
        <label class="form-label">Application Type *</label>
        <select class="form-select" id="new-app-type">
          <option value="new-program">New Program Introduction</option>
          <option value="intake-change">Variation in Intake / Division Addition</option>
          <option value="new-institution">Establishment of New Technical Institution</option>
          <option value="show-cause">Compliance / Show Cause Verification</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Program / Specialization *</label>
        <input type="text" class="form-input" id="new-app-program" placeholder="e.g. B.Tech Computer Science & Artificial Intelligence" required>
      </div>
      <div class="form-group">
        <label class="form-label">Approval Workflow Pipeline *</label>
        <select class="form-select" id="new-app-workflow">
          ${templates.map(t => `<option value="${t.id}">${Utils.escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Institutional Remarks / Brief</label>
        <textarea class="form-textarea" id="new-app-notes" rows="3" placeholder="Provide background justification, proposed student intake, or land area details..."></textarea>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-submit-app" onclick="ApplicationsPage.submitNewApplication()">
        <span class="material-icons-round">send</span> Submit Application to AICTE
      </button>
    `);
  },

  async submitNewApplication() {
    const type = document.getElementById('new-app-type').value;
    const program = document.getElementById('new-app-program').value.trim();
    const workflowId = document.getElementById('new-app-workflow').value;
    const notes = document.getElementById('new-app-notes').value.trim();

    if (!program) {
      Components.showToast('Please enter the program or specialization name', 'error');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-app');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;"></span> Submitting...';
    }

    try {
      const res = await Store.createApplication({
        type,
        programName: program,
        workflowTemplateId: workflowId,
        notes
      });

      Components.closeModal();
      Components.showToast(`Application ${res.applicationNumber} filed successfully on SQLite backend!`, 'success', 'Application Submitted');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Submission failed', 'error', 'Error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-icons-round">send</span> Submit Application';
      }
    }
  }
};
