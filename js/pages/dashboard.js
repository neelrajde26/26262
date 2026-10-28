/* ============================================
   AICTE FlowGuard — Dashboard Page
   ============================================ */

const DashboardPage = {
  async render() {
    const session = Auth.getSession();
    const container = document.getElementById('page-container');

    container.innerHTML = Components.renderLoadingState('Loading dashboard intelligence...');

    try {
      await Store.loadAll();
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }

    const apps = Auth.filterByScope(Store.getAll('applications'), 'application');
    const undertakings = Auth.filterByScope(Store.getAll('undertakings'), 'undertaking');
    const documents = Auth.filterByScope(Store.getAll('documents'), 'document');
    const evcEvents = Auth.filterByScope(Store.getAll('evcEvents'), 'evc');

    // Compute stats
    const totalApps = apps.length;
    const activeApps = apps.filter(a => !['approved', 'rejected', 'cancelled'].includes(a.status)).length;
    const overdueApps = apps.filter(a => a.currentStageDueDate && Utils.daysUntil(a.currentStageDueDate) < 0 && !['approved', 'rejected', 'cancelled'].includes(a.status)).length;
    const approvedApps = apps.filter(a => a.status === 'approved').length;

    const pendingUndertakings = undertakings.filter(u => ['pending', 'overdue'].includes(u.status)).length;
    const overdueUndertakings = undertakings.filter(u => u.status === 'overdue' || (u.status === 'pending' && u.dueDate && Utils.daysUntil(u.dueDate) < 0)).length;

    const expiringDocs = documents.filter(d => d.status === 'expiring-soon').length;
    const expiredDocs = documents.filter(d => d.status === 'expired').length;

    const pendingEvc = evcEvents.filter(e => e.status === 'pending-schedule').length;

    // Stage distribution
    const stageCounts = {};
    apps.forEach(a => {
      const label = a.currentStage || 'unknown';
      stageCounts[label] = (stageCounts[label] || 0) + 1;
    });
    const stageData = Object.entries(stageCounts).map(([label, value]) => ({ label: label.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value }));

    // Region distribution
    const regionNames = {};
    Store.getAll('regions').forEach(r => { regionNames[r.id] = r.code; });
    const regionCounts = {};
    apps.forEach(a => {
      const name = regionNames[a.region] || a.region;
      regionCounts[name] = (regionCounts[name] || 0) + 1;
    });
    const regionData = Object.entries(regionCounts).map(([label, value]) => ({ label, value }));

    // Recent activity
    const recentAudits = Store.getAll('audit')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8);

    // Overdue/approaching items
    const urgentApps = apps.filter(a => {
      if (['approved', 'rejected', 'cancelled'].includes(a.status)) return false;
      if (!a.currentStageDueDate) return false;
      return Utils.daysUntil(a.currentStageDueDate) <= 5;
    }).sort((a, b) => new Date(a.currentStageDueDate) - new Date(b.currentStageDueDate));

    container.innerHTML = `
      <div class="dashboard-page">
        <p style="color: var(--text-tertiary); margin-bottom: var(--space-4); font-size: var(--font-size-sm);">
          Welcome back, <strong>${Utils.escapeHtml(session.fullName)}</strong>. Here's your overview.
        </p>

        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card stat-card--primary card-hover" onclick="Router.navigate('applications')">
            <div class="stat-icon"><span class="material-icons-round">description</span></div>
            <div class="stat-info">
              <div class="stat-value">${activeApps}</div>
              <div class="stat-label">Active Applications</div>
              <div class="stat-trend">${totalApps} total</div>
            </div>
          </div>

          <div class="stat-card stat-card--danger card-hover" onclick="Router.navigate('applications')">
            <div class="stat-icon"><span class="material-icons-round">alarm</span></div>
            <div class="stat-info">
              <div class="stat-value">${overdueApps}</div>
              <div class="stat-label">Overdue Applications</div>
              <div class="stat-trend" style="color: ${overdueApps > 0 ? 'var(--color-danger-500)' : 'var(--color-success-500)'}">
                ${overdueApps > 0 ? '⚠ Needs attention' : '✓ On track'}
              </div>
            </div>
          </div>

          <div class="stat-card stat-card--warning card-hover" onclick="Router.navigate('undertakings')">
            <div class="stat-icon"><span class="material-icons-round">fact_check</span></div>
            <div class="stat-info">
              <div class="stat-value">${pendingUndertakings}</div>
              <div class="stat-label">Pending Undertakings</div>
              <div class="stat-trend" style="color: ${overdueUndertakings > 0 ? 'var(--color-danger-500)' : 'var(--text-tertiary)'}">
                ${overdueUndertakings > 0 ? `${overdueUndertakings} overdue` : 'None overdue'}
              </div>
            </div>
          </div>

          <div class="stat-card stat-card--info card-hover" onclick="Router.navigate('evc')">
            <div class="stat-icon"><span class="material-icons-round">groups</span></div>
            <div class="stat-info">
              <div class="stat-value">${pendingEvc}</div>
              <div class="stat-label">EVC Pending</div>
              <div class="stat-trend">${evcEvents.length} total events</div>
            </div>
          </div>

          <div class="stat-card stat-card--accent card-hover" onclick="Router.navigate('documents')">
            <div class="stat-icon"><span class="material-icons-round">folder_open</span></div>
            <div class="stat-info">
              <div class="stat-value">${expiringDocs + expiredDocs}</div>
              <div class="stat-label">Documents Attention</div>
              <div class="stat-trend">${expiredDocs} expired, ${expiringDocs} expiring</div>
            </div>
          </div>

          <div class="stat-card stat-card--success card-hover" onclick="Router.navigate('applications')">
            <div class="stat-icon"><span class="material-icons-round">verified</span></div>
            <div class="stat-info">
              <div class="stat-value">${approvedApps}</div>
              <div class="stat-label">Approved</div>
              <div class="stat-trend">Applications approved</div>
            </div>
          </div>
        </div>

        <!-- Main Dashboard Grid -->
        <div class="dashboard-grid">
          <!-- Left: Charts and Urgent -->
          <div>
            <!-- Urgent Applications -->
            <div class="card" style="margin-bottom: var(--space-5)">
              <div class="card-header">
                <h4><span class="material-icons-round" style="color: var(--color-danger-500); vertical-align: middle; margin-right: 4px;">warning</span> Approaching / Overdue Deadlines</h4>
                <span class="badge badge-danger">${urgentApps.length}</span>
              </div>
              <div class="card-body" style="padding: 0;">
                ${urgentApps.length === 0 ?
                  '<div class="empty-state" style="padding: var(--space-6)"><span class="material-icons-round" style="font-size: 40px;">check_circle</span><h3 style="font-size: var(--font-size-base)">All on track</h3><p>No approaching or overdue deadlines.</p></div>' :
                  `<div class="data-table-container"><table class="data-table">
                    <thead><tr>
                      <th>Application</th>
                      <th>Stage</th>
                      <th>Due Date</th>
                      <th>Status</th>
                    </tr></thead>
                    <tbody>
                      ${urgentApps.slice(0, 5).map(a => {
                        const days = Utils.daysUntil(a.currentStageDueDate);
                        const isOverdue = days < 0;
                        return `<tr class="clickable" onclick="Router.navigate('application-detail', {id:'${a.id}'})">
                          <td>
                            <div class="app-id-cell">${Utils.escapeHtml(a.applicationNumber)}</div>
                            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${Utils.escapeHtml(Utils.truncate(a.institutionName, 30))}</div>
                          </td>
                          <td>${Utils.statusBadge(a.currentStage)}</td>
                          <td>${Utils.formatDate(a.currentStageDueDate)}</td>
                          <td class="${isOverdue ? 'overdue' : 'approaching'}">
                            ${isOverdue ? `${Math.abs(days)} days overdue` : `${days} days left`}
                          </td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table></div>`
                }
              </div>
            </div>

            <!-- Stage Distribution Chart -->
            <div class="card">
              <div class="card-header"><h4>Applications by Stage</h4></div>
              <div class="card-body">
                ${stageData.length > 0 ? Components.barChart(stageData) : '<p class="empty-state"><span class="material-icons-round">bar_chart</span><h3>No data</h3></p>'}
              </div>
            </div>
          </div>

          <!-- Right: Donut + Activity -->
          <div>
            <!-- Distribution Donut -->
            <div class="card" style="margin-bottom: var(--space-5)">
              <div class="card-header"><h4>Status Overview</h4></div>
              <div class="card-body" style="text-align: center;">
                ${Components.donutChart(stageData, totalApps, 'Total')}
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="card">
              <div class="card-header">
                <h4>Recent Activity</h4>
                ${Auth.canAccessNav('audit') ? '<button class="btn btn-ghost btn-sm" onclick="Router.navigate(\'audit\')">View All</button>' : ''}
              </div>
              <div class="card-body" style="padding: 0;">
                ${recentAudits.length === 0 ?
                  '<div class="empty-state" style="padding: var(--space-6)"><span class="material-icons-round" style="font-size: 40px;">history</span><h3 style="font-size: var(--font-size-base)">No activity</h3></div>' :
                  recentAudits.map(a => `
                    <div class="list-item">
                      <div class="list-item-icon" style="background: var(--color-primary-50); color: var(--color-primary-700);">
                        <span class="material-icons-round" style="font-size: 18px;">${this.getAuditIcon(a.action)}</span>
                      </div>
                      <div class="list-item-content">
                        <div class="list-item-title">${Utils.escapeHtml(a.actorName)}</div>
                        <div class="list-item-desc">${Utils.escapeHtml(Utils.truncate(a.details, 60))}</div>
                      </div>
                      <span style="font-size: var(--font-size-xs); color: var(--text-tertiary); white-space: nowrap;">${Utils.timeAgo(a.timestamp)}</span>
                    </div>
                  `).join('')
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Row: Region + Document Status -->
        <div class="dashboard-grid-full">
          <div class="card">
            <div class="card-header"><h4>Applications by Region</h4></div>
            <div class="card-body">
              ${regionData.length > 0 ? Components.barChart(regionData) : '<p style="color:var(--text-tertiary)">No regional data</p>'}
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h4>Document Status</h4></div>
            <div class="card-body" style="text-align:center;">
              ${Components.donutChart(
                [
                  { label: 'Valid', value: documents.filter(d => d.status === 'valid').length },
                  { label: 'Expiring Soon', value: expiringDocs },
                  { label: 'Expired', value: expiredDocs },
                ],
                documents.length,
                'Documents'
              )}
            </div>
          </div>
        </div>

        <p style="margin-top: var(--space-6); font-size: var(--font-size-xs); color: var(--text-tertiary); text-align: center;">
          ⚠ Demo configuration — all timelines, data, and rules are fictional demonstration values, not official AICTE policy.
        </p>
      </div>
    `;
  },

  getAuditIcon(action) {
    const map = {
      'application_submitted': 'send',
      'application_assigned': 'assignment_ind',
      'application_returned': 'undo',
      'application_approved': 'verified',
      'application_rejected': 'cancel',
      'stage_advanced': 'arrow_forward',
      'evc_scheduled': 'event',
      'evc_completed': 'check_circle',
      'evidence_submitted': 'cloud_upload',
      'escalation_triggered': 'priority_high',
      'user_login': 'login',
      'user_logout': 'logout',
    };
    return map[action] || 'edit';
  }
};
