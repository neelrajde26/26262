/* ============================================
   AICTE FlowGuard — Reports & Analytics Page
   ============================================ */

const ReportsPage = {
  selectedRegion: 'all',

  async render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();

    container.innerHTML = Components.renderLoadingState('Compiling compliance analytics and metrics...');

    try {
      await Store.loadAll();
    } catch (err) {
      console.error('Failed to load reports data:', err);
    }

    let apps = Store.getAll('applications');
    apps = Auth.filterByScope(apps, 'application');

    let undertakings = Store.getAll('undertakings');
    undertakings = Auth.filterByScope(undertakings, 'undertaking');

    let evcEvents = Store.getAll('evcEvents');
    evcEvents = Auth.filterByScope(evcEvents, 'evc');

    let docs = Store.getAll('documents');
    docs = Auth.filterByScope(docs, 'document');

    const regions = Store.getAll('regions');

    // Filter by selected region
    if (this.selectedRegion !== 'all') {
      apps = apps.filter(a => a.region === this.selectedRegion);
      undertakings = undertakings.filter(u => u.region === this.selectedRegion);
      evcEvents = evcEvents.filter(e => e.region === this.selectedRegion);
      docs = docs.filter(d => d.region === this.selectedRegion);
    }

    // Calculations
    const totalApps = apps.length;
    const approvedApps = apps.filter(a => a.status === 'approved').length;
    const rejectedApps = apps.filter(a => a.status === 'rejected').length;
    const inProgressApps = apps.filter(a => !['approved', 'rejected', 'cancelled'].includes(a.status)).length;

    // Overdue count
    const overdueApps = apps.filter(a => {
      if (!a.currentStageDueDate || ['approved', 'rejected', 'cancelled'].includes(a.status)) return false;
      return Utils.daysUntil(a.currentStageDueDate) < 0;
    }).length;

    const approvalRate = totalApps > 0 ? Math.round((approvedApps / totalApps) * 100) : 0;
    const onTimeRate = totalApps > 0 ? Math.round(((totalApps - overdueApps) / totalApps) * 100) : 100;

    // Undertaking compliance
    const totalUnd = undertakings.length;
    const verifiedUnd = undertakings.filter(u => u.status === 'verified').length;
    const undRate = totalUnd > 0 ? Math.round((verifiedUnd / totalUnd) * 100) : 0;

    // Stage Distribution Data
    const stageCounts = {
      'submitted': apps.filter(a => a.status === 'submitted').length,
      'scrutiny': apps.filter(a => a.status === 'scrutiny').length,
      'returned': apps.filter(a => a.status === 'returned').length,
      'evc-scheduled': apps.filter(a => ['evc-pending', 'evc-scheduled', 'evc-completed'].includes(a.status)).length,
      'sac-shc': apps.filter(a => ['sac-review', 'shc-review'].includes(a.status)).length,
      'approved': approvedApps,
      'rejected': rejectedApps,
    };

    const maxStage = Math.max(...Object.values(stageCounts), 1);

    // Region performance breakdown
    const regionStats = regions.map(reg => {
      const regApps = Store.getAll('applications').filter(a => a.region === reg.id);
      const regApproved = regApps.filter(a => a.status === 'approved').length;
      const regOverdue = regApps.filter(a => a.currentStageDueDate && Utils.daysUntil(a.currentStageDueDate) < 0 && !['approved', 'rejected'].includes(a.status)).length;
      const regTotal = regApps.length;
      const regSla = regTotal > 0 ? Math.round(((regTotal - regOverdue) / regTotal) * 100) : 100;

      return {
        ...reg,
        total: regTotal,
        approved: regApproved,
        overdue: regOverdue,
        sla: regSla
      };
    });

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-5); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">Approval Workflow & Compliance Analytics</h2>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            Cross-regional SLA metrics, throughput speeds, and institutional compliance audits.
          </p>
        </div>
        <div style="display: flex; gap: var(--space-2); align-items: center;">
          <select id="report-region-select" class="form-input" style="width: auto;">
            <option value="all" ${this.selectedRegion === 'all' ? 'selected' : ''}>All Regions</option>
            ${regions.map(r => `<option value="${r.id}" ${this.selectedRegion === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="ReportsPage.exportCSV()">
            <span class="material-icons-round">file_download</span> Export CSV
          </button>
        </div>
      </div>

      <!-- KPI Stat Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-primary-50); color: var(--color-primary-600);">
            <span class="material-icons-round">assessment</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Submissions</span>
            <span class="stat-value">${totalApps}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-success-50); color: var(--color-success-700);">
            <span class="material-icons-round">verified</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Approval Rate</span>
            <span class="stat-value" style="color: var(--color-success-600);">${approvalRate}%</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-info-50); color: var(--color-info-700);">
            <span class="material-icons-round">speed</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">SLA Compliance Rate</span>
            <span class="stat-value" style="color: ${onTimeRate >= 80 ? 'var(--color-success-600)' : 'var(--color-warning-700)'};">${onTimeRate}%</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-danger-50); color: var(--color-danger-700);">
            <span class="material-icons-round">alarm</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Overdue Applications</span>
            <span class="stat-value" style="color: var(--color-danger-500);">${overdueApps}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-accent-50); color: var(--color-accent-600);">
            <span class="material-icons-round">fact_check</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Undertaking Verified</span>
            <span class="stat-value">${undRate}%</span>
          </div>
        </div>
      </div>

      <!-- Main Analytics Grid -->
      <div class="dashboard-grid" style="margin-bottom: var(--space-5);">
        <!-- Stage Distribution -->
        <div class="card">
          <div class="card-header">
            <h4>Workflow Pipeline Distribution</h4>
            <span style="font-size: var(--font-size-xs); color: var(--text-tertiary);">${totalApps} active records</span>
          </div>
          <div class="card-body">
            <div style="display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-2);">
              ${Object.entries({
                'Submitted': stageCounts.submitted,
                'Under Scrutiny': stageCounts.scrutiny,
                'Returned / Clarification': stageCounts.returned,
                'EVC Stage': stageCounts['evc-scheduled'],
                'SAC / SHC Review': stageCounts['sac-shc'],
                'Approved': stageCounts.approved,
                'Rejected': stageCounts.rejected
              }).map(([label, count]) => {
                const pct = Math.round((count / maxStage) * 100);
                return `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: var(--font-size-xs); margin-bottom: 4px;">
                      <span style="font-weight: var(--font-weight-medium);">${label}</span>
                      <span style="color: var(--text-tertiary);">${count} applications</span>
                    </div>
                    <div style="height: 10px; background: var(--bg-tertiary); border-radius: var(--border-radius-full); overflow: hidden;">
                      <div style="width: ${pct}%; height: 100%; background: var(--color-primary-500); border-radius: var(--border-radius-full); transition: width 0.4s ease;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Compliance & Validity Breakdown -->
        <div class="card">
          <div class="card-header">
            <h4>Compliance & Inspections Health</h4>
          </div>
          <div class="card-body" style="display: flex; flex-direction: column; gap: var(--space-4);">
            <div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--border-radius);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-1);">
                <span style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);">Institutional Undertakings</span>
                <span class="badge badge-success">${verifiedUnd} / ${totalUnd} Complied</span>
              </div>
              <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0;">
                Conditions verified vs pending evidence verification.
              </p>
            </div>

            <div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--border-radius);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-1);">
                <span style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);">Statutory Documents</span>
                <span class="badge ${docs.filter(d => d.status === 'expired').length > 0 ? 'badge-danger' : 'badge-success'}">
                  ${docs.filter(d => d.status === 'valid').length} Valid / ${docs.filter(d => d.status === 'expired').length} Expired
                </span>
              </div>
              <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0;">
                Campus land deeds, structural stability, and fire safety NOCs.
              </p>
            </div>

            <div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--border-radius);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-1);">
                <span style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);">EVC Committee Inspections</span>
                <span class="badge badge-info">${evcEvents.filter(e => e.status === 'completed').length} / ${evcEvents.length} Reports</span>
              </div>
              <p style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0;">
                Physical inspections completed and evaluated by committee.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Regional Performance Benchmark Table -->
      <div class="card">
        <div class="card-header">
          <h4>Regional Office SLA & Performance Benchmark</h4>
          <span style="font-size: var(--font-size-xs); color: var(--text-tertiary);">AICTE Regional Offices Comparison</span>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Region</th>
                <th>Jurisdiction States</th>
                <th>Applications Handled</th>
                <th>Approved</th>
                <th>Overdue Stages</th>
                <th>SLA Compliance</th>
              </tr>
            </thead>
            <tbody>
              ${regionStats.map(r => `
                <tr>
                  <td><strong>${Utils.escapeHtml(r.name)}</strong> (${r.code})</td>
                  <td style="font-size: var(--font-size-xs); color: var(--text-tertiary);">${Utils.escapeHtml(r.states.join(', '))}</td>
                  <td style="font-weight: var(--font-weight-semibold);">${r.total}</td>
                  <td><span class="badge badge-success">${r.approved}</span></td>
                  <td>
                    ${r.overdue > 0 ? `<span class="badge badge-danger">${r.overdue} overdue</span>` : `<span class="badge badge-neutral">0</span>`}
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                      <div style="flex: 1; height: 6px; background: var(--bg-tertiary); border-radius: var(--border-radius-full); width: 100px;">
                        <div style="width: ${r.sla}%; height: 100%; background: ${r.sla >= 80 ? 'var(--color-success-500)' : 'var(--color-warning-500)'}; border-radius: var(--border-radius-full);"></div>
                      </div>
                      <span style="font-size: var(--font-size-xs); font-weight: var(--font-weight-medium);">${r.sla}%</span>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Event listener
    const regionSelect = document.getElementById('report-region-select');
    if (regionSelect) {
      regionSelect.addEventListener('change', (e) => {
        this.selectedRegion = e.target.value;
        this.render();
      });
    }
  },

  exportCSV() {
    const apps = Store.getAll('applications');
    if (apps.length === 0) {
      Components.showToast('No applications to export.', 'warning');
      return;
    }

    const headers = ['Application Number', 'Institution', 'Type', 'Program', 'Stage', 'Status', 'Region', 'Submission Date', 'Due Date'];
    const rows = apps.map(a => [
      `"${a.applicationNumber}"`,
      `"${a.institutionName}"`,
      `"${a.type}"`,
      `"${a.programName || ''}"`,
      `"${a.currentStage}"`,
      `"${a.status}"`,
      `"${a.region}"`,
      `"${a.submittedDate}"`,
      `"${a.currentStageDueDate || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `aicte_flowguard_report_${Utils.today()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Components.showToast('CSV Report successfully generated and downloaded!', 'success');
  }
};
