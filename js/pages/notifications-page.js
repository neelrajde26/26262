/* ============================================
   AICTE FlowGuard — Notifications Page View
   ============================================ */

const NotificationsPageView = {
  currentFilter: 'all',

  render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();

    const notifs = Store.getNotificationsForUser(session.userId, session.role, session.region, session.institutionId);

    const total = notifs.length;
    const unread = notifs.filter(n => !n.read).length;
    const escalations = notifs.filter(n => n.type === 'escalation').length;
    const overdue = notifs.filter(n => n.type === 'overdue').length;

    let filtered = notifs;
    if (this.currentFilter === 'unread') {
      filtered = notifs.filter(n => !n.read);
    } else if (this.currentFilter === 'escalation') {
      filtered = notifs.filter(n => n.type === 'escalation');
    } else if (this.currentFilter === 'deadlines') {
      filtered = notifs.filter(n => ['deadline_approaching', 'overdue'].includes(n.type));
    }

    const iconMap = {
      deadline_approaching: { icon: 'schedule', color: 'var(--color-warning-700)', bg: 'var(--color-warning-50)' },
      overdue: { icon: 'alarm', color: 'var(--color-danger-700)', bg: 'var(--color-danger-50)' },
      escalation: { icon: 'priority_high', color: 'var(--color-danger-700)', bg: 'var(--color-danger-50)' },
      document_expiring: { icon: 'event_busy', color: 'var(--color-warning-700)', bg: 'var(--color-warning-50)' },
      document_expired: { icon: 'error', color: 'var(--color-danger-700)', bg: 'var(--color-danger-50)' },
      evc_scheduled: { icon: 'event_available', color: 'var(--color-info-700)', bg: 'var(--color-info-50)' },
      submission_received: { icon: 'cloud_upload', color: 'var(--color-success-700)', bg: 'var(--color-success-50)' },
      returned: { icon: 'undo', color: 'var(--color-warning-700)', bg: 'var(--color-warning-50)' },
      approved: { icon: 'check_circle', color: 'var(--color-success-700)', bg: 'var(--color-success-50)' },
    };

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-5); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">Notifications & Alert Center</h2>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            Real-time deadline warnings, escalation triggers, and institutional compliance alerts.
          </p>
        </div>
        <div style="display: flex; gap: var(--space-2);">
          ${unread > 0 ? `
            <button class="btn btn-outline btn-sm" onclick="NotificationsPageView.markAllRead()">
              <span class="material-icons-round">mark_email_read</span> Mark All Read
            </button>
          ` : ''}
          <button class="btn btn-primary btn-sm" onclick="NotificationsPageView.simulateEscalation()">
            <span class="material-icons-round">notification_add</span> Trigger Test Escalation
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-primary-50); color: var(--color-primary-600);">
            <span class="material-icons-round">notifications</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Alerts</span>
            <span class="stat-value">${total}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-info-50); color: var(--color-info-700);">
            <span class="material-icons-round">markunread</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Unread Alerts</span>
            <span class="stat-value" style="color: var(--color-primary-600);">${unread}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-danger-50); color: var(--color-danger-700);">
            <span class="material-icons-round">priority_high</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Active Escalations</span>
            <span class="stat-value" style="color: var(--color-danger-500);">${escalations}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-warning-50); color: var(--color-warning-700);">
            <span class="material-icons-round">alarm</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Overdue Alerts</span>
            <span class="stat-value">${overdue}</span>
          </div>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="card" style="margin-bottom: var(--space-5);">
        <div class="tabs" style="border-bottom: none; padding: var(--space-2) var(--space-4);">
          <button class="tab-btn ${this.currentFilter === 'all' ? 'active' : ''}" onclick="NotificationsPageView.setFilter('all')">
            All Alerts (${total})
          </button>
          <button class="tab-btn ${this.currentFilter === 'unread' ? 'active' : ''}" onclick="NotificationsPageView.setFilter('unread')">
            Unread (${unread})
          </button>
          <button class="tab-btn ${this.currentFilter === 'escalation' ? 'active' : ''}" onclick="NotificationsPageView.setFilter('escalation')">
            Escalations (${escalations})
          </button>
          <button class="tab-btn ${this.currentFilter === 'deadlines' ? 'active' : ''}" onclick="NotificationsPageView.setFilter('deadlines')">
            Deadlines (${overdue})
          </button>
        </div>
      </div>

      <!-- Notifications List -->
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <span class="material-icons-round">notifications_none</span>
          <h3>No Notifications</h3>
          <p>You have no notifications matching this category.</p>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          ${filtered.map(n => {
            const cfg = iconMap[n.type] || { icon: 'info', color: 'var(--color-primary-600)', bg: 'var(--color-primary-50)' };
            const isEscalation = n.type === 'escalation';

            return `
              <div class="card notif-card ${n.read ? '' : 'unread-card'}" style="padding: var(--space-4); border-left: 4px solid ${isEscalation ? 'var(--color-danger-500)' : (n.read ? 'var(--border-color)' : 'var(--color-primary-500)')};">
                <div style="display: flex; gap: var(--space-4); align-items: flex-start;">
                  <div style="width: 44px; height: 44px; border-radius: var(--border-radius-full); background: ${cfg.bg}; color: ${cfg.color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <span class="material-icons-round">${cfg.icon}</span>
                  </div>
                  <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-1); flex-wrap: wrap; gap: var(--space-2);">
                      <div style="display: flex; align-items: center; gap: var(--space-2);">
                        <h4 style="font-size: var(--font-size-base); font-weight: ${n.read ? 'var(--font-weight-medium)' : 'var(--font-weight-bold)'};">
                          ${Utils.escapeHtml(n.title)}
                        </h4>
                        ${!n.read ? `<span class="badge badge-primary" style="font-size: 10px; padding: 1px 6px;">NEW</span>` : ''}
                        ${n.escalationLevel ? `<span class="badge badge-danger">Level ${n.escalationLevel} Escalation</span>` : ''}
                      </div>
                      <span style="font-size: var(--font-size-xs); color: var(--text-tertiary);">${Utils.timeAgo(n.createdAt)} • ${Utils.formatDateTime(n.createdAt)}</span>
                    </div>
                    <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-3); line-height: 1.5;">
                      ${Utils.escapeHtml(n.message)}
                    </p>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div>
                        ${n.entityId ? `
                          <button class="btn btn-outline btn-sm" onclick="NotificationsPageView.goToEntity('${n.id}', '${n.entityType}', '${n.entityId}')">
                            <span class="material-icons-round">open_in_new</span> View Related ${n.entityType}
                          </button>
                        ` : ''}
                      </div>
                      ${!n.read ? `
                        <button class="btn btn-ghost btn-sm" onclick="NotificationsPageView.markRead('${n.id}')">
                          <span class="material-icons-round">done</span> Mark as Read
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;
  },

  setFilter(filter) {
    this.currentFilter = filter;
    this.render();
  },

  markRead(id) {
    Store.markNotificationRead(id);
    Components.updateNotificationBadge();
    this.render();
  },

  markAllRead() {
    const session = Auth.getSession();
    const notifs = Store.getNotificationsForUser(session.userId, session.role, session.region, session.institutionId);
    notifs.forEach(n => Store.markNotificationRead(n.id));
    Components.updateNotificationBadge();
    Components.showToast('All notifications marked as read', 'success');
    this.render();
  },

  goToEntity(notifId, entityType, entityId) {
    Store.markNotificationRead(notifId);
    Components.updateNotificationBadge();
    switch (entityType) {
      case 'application':
        Router.navigate('application-detail', { id: entityId });
        break;
      case 'undertaking':
        Router.navigate('undertakings');
        break;
      case 'document':
        Router.navigate('documents');
        break;
      case 'evc':
        Router.navigate('evc');
        break;
      default:
        this.render();
    }
  },

  simulateEscalation() {
    const session = Auth.getSession();
    const newNotif = {
      type: 'escalation',
      title: 'CRITICAL ESCALATION: Compliance SLA Breached',
      message: `System rule trigger: Multiple statutory deadlines exceeded. Escalated to ${session.fullName} (${Auth.ROLES[session.role]?.label || session.role}) for immediate intervention.`,
      recipientId: session.userId,
      recipientRole: session.role,
      recipientRegion: session.region,
      entityType: 'application',
      entityId: 'app-007',
      escalationLevel: 2,
    };

    Store.addNotification(newNotif);
    Store.addAudit({
      actor: 'system',
      actorName: 'Escalation Engine',
      action: 'escalation_triggered',
      entityType: 'application',
      entityId: 'app-007',
      details: 'Automatic SLA escalation level 2 triggered for overdue scrutiny'
    });

    Components.updateNotificationBadge();
    Components.showToast('Simulated escalation notification generated!', 'error', 'Escalation Alert');
    this.render();
  }
};
