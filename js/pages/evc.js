/* ============================================
   AICTE FlowGuard — EVC Management Page
   ============================================ */

const EVCPage = {
  currentFilter: 'all',
  currentRegion: '',
  searchQuery: '',

  async render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();
    const canManage = Auth.hasPermission('manage_evc');

    container.innerHTML = Components.renderLoadingState('Loading EVC inspection visits...');

    try {
      await Store.fetchEvc();
    } catch (err) {
      console.error('Failed to load EVC visits:', err);
    }

    let events = Store.getAll('evcEvents');
    events = Auth.filterByScope(events, 'evc');

    // Calculate metrics
    const totalEvents = events.length;
    const pendingSchedule = events.filter(e => e.status === 'pending-schedule').length;
    const scheduled = events.filter(e => e.status === 'scheduled').length;
    const completed = events.filter(e => e.status === 'completed').length;
    const newInstCount = events.filter(e => e.isNewInstitution).length;

    // Apply filters
    let filtered = events.filter(e => {
      if (this.currentFilter !== 'all' && e.status !== this.currentFilter) return false;
      if (this.currentRegion && e.region !== this.currentRegion) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return (e.applicationNumber && e.applicationNumber.toLowerCase().includes(q)) ||
               (e.institutionName && e.institutionName.toLowerCase().includes(q)) ||
               (e.committeeName && e.committeeName.toLowerCase().includes(q));
      }
      return true;
    });

    const regions = Store.getAll('regions');

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-5);">
        <div>
          <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">Expert Visit Committee (EVC) Management</h2>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            Schedule inspection visits, assign committee experts, and record inspection reports.
          </p>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-primary-50); color: var(--color-primary-600);">
            <span class="material-icons-round">groups</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Visits</span>
            <span class="stat-value">${totalEvents}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-warning-50); color: var(--color-warning-700);">
            <span class="material-icons-round">schedule</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Pending Scheduling</span>
            <span class="stat-value">${pendingSchedule}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-info-50); color: var(--color-info-700);">
            <span class="material-icons-round">event_available</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Scheduled Visits</span>
            <span class="stat-value">${scheduled}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-success-50); color: var(--color-success-700);">
            <span class="material-icons-round">task_alt</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Reports Completed</span>
            <span class="stat-value">${completed}</span>
          </div>
        </div>
      </div>

      <!-- Filter Controls -->
      <div class="card" style="margin-bottom: var(--space-5);">
        <div class="card-body" style="padding: var(--space-4);">
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center; flex: 1;">
              <div class="search-box" style="max-width: 320px; width: 100%;">
                <span class="material-icons-round search-icon">search</span>
                <input type="search" id="evc-search-input" class="search-input" placeholder="Search visits, committee..." value="${Utils.escapeHtml(this.searchQuery)}">
              </div>
              <select id="evc-status-filter" class="form-input" style="width: auto;">
                <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="pending-schedule" ${this.currentFilter === 'pending-schedule' ? 'selected' : ''}>Pending Schedule</option>
                <option value="scheduled" ${this.currentFilter === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                <option value="completed" ${this.currentFilter === 'completed' ? 'selected' : ''}>Completed</option>
              </select>
              <select id="evc-region-filter" class="form-input" style="width: auto;">
                <option value="">All Regions</option>
                ${regions.map(r => `<option value="${r.id}" ${this.currentRegion === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
              </select>
            </div>
            ${newInstCount > 0 ? `
              <div class="badge badge-info" style="align-self: center;">
                <span class="material-icons-round">star</span> ${newInstCount} New Institution Visits
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- EVC Cards Grid -->
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <span class="material-icons-round">event_busy</span>
          <h3>No EVC Visits Found</h3>
          <p>There are no Expert Visit Committee events matching the selected filters.</p>
        </div>
      ` : `
        <div class="evc-grid">
          ${filtered.map(evt => {
            const isCompleted = evt.status === 'completed';
            const isScheduled = evt.status === 'scheduled';
            const cardClass = isCompleted ? 'completed-card' : (isScheduled ? 'scheduled-card' : '');

            return `
              <div class="card evc-card ${cardClass}" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div class="card-body">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">
                    <div>
                      <span class="app-id-cell" style="cursor: pointer;" onclick="Router.navigate('application-detail', { id: '${evt.applicationId}' })">${Utils.escapeHtml(evt.applicationNumber)}</span>
                      <h4 style="margin: var(--space-1) 0; font-size: var(--font-size-base);">${Utils.escapeHtml(evt.institutionName)}</h4>
                    </div>
                    <div>
                      ${Utils.statusBadge(evt.status)}
                    </div>
                  </div>

                  <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3);">
                    ${evt.isNewInstitution ? `<span class="badge badge-info"><span class="material-icons-round">star</span> New Inst</span>` : ''}
                    <span class="badge badge-neutral"><span class="material-icons-round">location_on</span> ${regions.find(r => r.id === evt.region)?.name || evt.region}</span>
                  </div>

                  <div class="detail-grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-3); font-size: var(--font-size-xs);">
                    <div>
                      <span style="color: var(--text-tertiary); display: block;">Committee Lead</span>
                      <span style="font-weight: var(--font-weight-medium);">${Utils.escapeHtml(evt.committeeName || 'Unassigned')}</span>
                    </div>
                    <div>
                      <span style="color: var(--text-tertiary); display: block;">Planned Date</span>
                      <span style="font-weight: var(--font-weight-medium);">${evt.plannedDate ? Utils.formatDate(evt.plannedDate) : 'Not scheduled'}</span>
                    </div>
                    ${evt.completedDate ? `
                      <div>
                        <span style="color: var(--text-tertiary); display: block;">Completed Date</span>
                        <span style="font-weight: var(--font-weight-medium);">${Utils.formatDate(evt.completedDate)}</span>
                      </div>
                    ` : ''}
                  </div>

                  ${evt.notes ? `
                    <div style="background: var(--bg-tertiary); padding: var(--space-2) var(--space-3); border-radius: var(--border-radius-sm); font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: var(--space-3);">
                      <strong>Notes:</strong> ${Utils.escapeHtml(evt.notes)}
                    </div>
                  ` : ''}

                  ${evt.report ? `
                    <div style="background: var(--color-success-50); border: 1px solid var(--color-success-200); padding: var(--space-2) var(--space-3); border-radius: var(--border-radius-sm); font-size: var(--font-size-xs); color: var(--color-success-800); margin-bottom: var(--space-3);">
                      <strong>Report Excerpt:</strong> ${Utils.escapeHtml(evt.report)}
                    </div>
                  ` : ''}
                </div>

                <div class="card-footer" style="display: flex; justify-content: flex-end; gap: var(--space-2); background: transparent; border-top: 1px solid var(--border-color); padding: var(--space-3);">
                  <button class="btn btn-ghost btn-sm" onclick="Router.navigate('application-detail', { id: '${evt.applicationId}' })">
                    <span class="material-icons-round">visibility</span> View App
                  </button>
                  ${(canManage || session?.role === 'committee') && evt.status === 'pending-schedule' ? `
                    <button class="btn btn-primary btn-sm" onclick="EVCPage.showScheduleModal('${evt.id}')">
                      <span class="material-icons-round">event</span> Schedule Visit
                    </button>
                  ` : ''}
                  ${(canManage || session?.role === 'committee') && evt.status === 'scheduled' ? `
                    <button class="btn btn-success btn-sm" onclick="EVCPage.showReportModal('${evt.id}')">
                      <span class="material-icons-round">rate_review</span> Submit Report
                    </button>
                  ` : ''}
                  ${evt.status === 'completed' && evt.report ? `
                    <button class="btn btn-ghost btn-sm" onclick="EVCPage.viewFullReport('${evt.id}')">
                      <span class="material-icons-round">article</span> Full Report
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    // Bind event listeners
    const searchInput = document.getElementById('evc-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        this.searchQuery = e.target.value.trim();
        this.render();
      }, 300));
    }

    const statusFilter = document.getElementById('evc-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.currentFilter = e.target.value;
        this.render();
      });
    }

    const regionFilter = document.getElementById('evc-region-filter');
    if (regionFilter) {
      regionFilter.addEventListener('change', (e) => {
        this.currentRegion = e.target.value;
        this.render();
      });
    }
  },

  showScheduleModal(eventId) {
    const event = Store.getById('evcEvents', eventId);
    if (!event) return;

    const committeeUsers = Store.getAll('users').filter(u => u.role === 'committee' || u.role === 'regional_officer');

    const bodyHtml = `
      <form id="schedule-evc-form" onsubmit="event.preventDefault(); EVCPage.handleScheduleSubmit('${eventId}');">
        <div class="form-group">
          <label class="form-label">Application</label>
          <input type="text" class="form-input" value="${Utils.escapeHtml(event.applicationNumber)} — ${Utils.escapeHtml(event.institutionName)}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Assigned Committee Lead / Expert *</label>
          <select id="modal-evc-expert" class="form-input" required>
            <option value="">Select Expert</option>
            ${committeeUsers.map(u => `
              <option value="${u.id}" ${event.committeeId === u.id ? 'selected' : ''}>
                ${Utils.escapeHtml(u.fullName)} (${u.role === 'committee' ? 'EVC Expert' : 'Regional Officer'})
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Planned Visit Date *</label>
          <input type="date" id="modal-evc-date" class="form-input" value="${Utils.dateOffset(7)}" required min="${Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Visit Instructions & Notes</label>
          <textarea id="modal-evc-notes" class="form-input" rows="3" placeholder="Enter visit scope, key verification points, lab inspection requirements...">${Utils.escapeHtml(event.notes || '')}</textarea>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-confirm-schedule" onclick="EVCPage.handleScheduleSubmit('${eventId}')">
        <span class="material-icons-round">event_available</span> Confirm Schedule
      </button>
    `;

    Components.showModal('Schedule EVC Visit', bodyHtml, footerHtml);
  },

  async handleScheduleSubmit(eventId) {
    const expertSelect = document.getElementById('modal-evc-expert');
    const dateInput = document.getElementById('modal-evc-date');
    const notesInput = document.getElementById('modal-evc-notes');
    const btn = document.getElementById('btn-confirm-schedule');

    if (!expertSelect || !expertSelect.value || !dateInput || !dateInput.value) {
      Components.showToast('Please select an expert and a visit date.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Scheduling...`;
    }

    try {
      await Store.scheduleEvc(eventId, expertSelect.value, dateInput.value, notesInput ? notesInput.value.trim() : '');
      Components.closeModal();
      Components.showToast('EVC Visit successfully scheduled!', 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to schedule EVC visit', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons-round">event_available</span> Confirm Schedule`;
      }
    }
  },

  showReportModal(eventId) {
    const event = Store.getById('evcEvents', eventId);
    if (!event) return;

    const bodyHtml = `
      <form id="report-evc-form" onsubmit="event.preventDefault(); EVCPage.handleReportSubmit('${eventId}');">
        <div class="form-group">
          <label class="form-label">Application</label>
          <input type="text" class="form-input" value="${Utils.escapeHtml(event.applicationNumber)} — ${Utils.escapeHtml(event.institutionName)}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Completed Visit Date *</label>
          <input type="date" id="modal-evc-completed-date" class="form-input" value="${Utils.today()}" required max="${Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Recommendation *</label>
          <select id="modal-evc-recommendation" class="form-input" required>
            <option value="favorable">Favorable — All infrastructure & faculty criteria satisfied</option>
            <option value="deficiencies">Deficiencies Noted — Subject to compliance undertakings</option>
            <option value="unfavorable">Unfavorable — Critical deficiencies found</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">EVC Inspection Report & Observations *</label>
          <textarea id="modal-evc-report" class="form-input" rows="5" required placeholder="Detail the physical verification of campus land, instructional area, laboratories, equipment, faculty presence, and library resources..."></textarea>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-success" id="btn-submit-report" onclick="EVCPage.handleReportSubmit('${eventId}')">
        <span class="material-icons-round">task_alt</span> Submit Inspection Report
      </button>
    `;

    Components.showModal('Submit EVC Inspection Report', bodyHtml, footerHtml);
  },

  async handleReportSubmit(eventId) {
    const completedDate = document.getElementById('modal-evc-completed-date');
    const recSelect = document.getElementById('modal-evc-recommendation');
    const reportText = document.getElementById('modal-evc-report');
    const btn = document.getElementById('btn-submit-report');

    if (!reportText || !reportText.value.trim() || !completedDate || !completedDate.value) {
      Components.showToast('Please fill in the completed date and inspection report.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Submitting...`;
    }

    try {
      await Store.submitEvcReport(eventId, recSelect.value, reportText.value.trim(), completedDate.value);
      Components.closeModal();
      Components.showToast('EVC Inspection Report submitted successfully!', 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to submit inspection report', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons-round">task_alt</span> Submit Inspection Report`;
      }
    }
  },

  viewFullReport(eventId) {
    const event = Store.getById('evcEvents', eventId);
    if (!event) return;

    const bodyHtml = `
      <div style="font-size: var(--font-size-sm); line-height: 1.6;">
        <div class="detail-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: var(--space-4);">
          <div>
            <span class="detail-label">Institution</span>
            <span class="detail-value">${Utils.escapeHtml(event.institutionName)}</span>
          </div>
          <div>
            <span class="detail-label">Application Number</span>
            <span class="detail-value">${Utils.escapeHtml(event.applicationNumber)}</span>
          </div>
          <div>
            <span class="detail-label">Committee Lead</span>
            <span class="detail-value">${Utils.escapeHtml(event.committeeName || '—')}</span>
          </div>
          <div>
            <span class="detail-label">Completion Date</span>
            <span class="detail-value">${Utils.formatDate(event.completedDate)}</span>
          </div>
        </div>

        <h4 style="margin-bottom: var(--space-2); color: var(--text-primary);">Inspection Findings & Report:</h4>
        <div style="background: var(--bg-tertiary); padding: var(--space-4); border-radius: var(--border-radius); border-left: 4px solid var(--color-success-500); white-space: pre-wrap;">${Utils.escapeHtml(event.report)}</div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-primary" onclick="Components.closeModal()">Close</button>
    `;

    Components.showModal('EVC Inspection Report', bodyHtml, footerHtml);
  }
};
