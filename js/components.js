/* ============================================
   AICTE FlowGuard — Shared Components
   ============================================ */

const Components = {
  // Build navigation menu based on role
  buildNavMenu() {
    const session = Auth.getSession();
    if (!session) return;

    const navItems = [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { section: 'WORKFLOW' },
      { id: 'applications', icon: 'description', label: 'Applications' },
      { id: 'evc', icon: 'groups', label: 'EVC Management' },
      { section: 'COMPLIANCE' },
      { id: 'undertakings', icon: 'fact_check', label: 'Undertakings' },
      { id: 'documents', icon: 'folder_open', label: 'Documents' },
      { section: 'MONITORING' },
      { id: 'notifications', icon: 'notifications', label: 'Notifications' },
      { id: 'reports', icon: 'assessment', label: 'Reports' },
      { id: 'audit', icon: 'history', label: 'Audit Trail' },
      { section: 'SYSTEM' },
      { id: 'admin', icon: 'settings', label: 'Administration' },
    ];

    const menu = document.getElementById('nav-menu');
    menu.innerHTML = '';

    let hasItemsInSection = false;
    let pendingSection = null;

    navItems.forEach(item => {
      if (item.section) {
        pendingSection = item.section;
        hasItemsInSection = false;
        return;
      }

      if (!Auth.canAccessNav(item.id)) return;

      // Add section label if pending
      if (pendingSection && !hasItemsInSection) {
        const sectionEl = document.createElement('li');
        sectionEl.className = 'nav-section-label';
        sectionEl.textContent = pendingSection;
        menu.appendChild(sectionEl);
        hasItemsInSection = true;
        pendingSection = null;
      }

      const li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = `
        <button class="nav-link" data-page="${item.id}" role="menuitem" aria-label="${item.label}">
          <span class="material-icons-round">${item.icon}</span>
          <span class="nav-text">${item.label}</span>
        </button>
      `;
      li.querySelector('.nav-link').addEventListener('click', () => {
        Router.navigate(item.id);
      });
      menu.appendChild(li);
    });
  },

  // Update user display in sidebar
  updateUserDisplay() {
    const session = Auth.getSession();
    if (!session) return;

    document.getElementById('user-display-name').textContent = session.fullName;
    document.getElementById('user-display-role').textContent = Auth.ROLES[session.role]?.label || session.role;
    document.getElementById('user-avatar').textContent = session.fullName.split(' ').map(n => n[0]).join('').substring(0, 2);
  },

  // Update notification badge
  updateNotificationBadge() {
    const session = Auth.getSession();
    if (!session) return;
    const notifs = Store.getNotificationsForUser(session.userId, session.role, session.region, session.institutionId);
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('notification-badge');
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  },

  // Render notification panel
  renderNotificationPanel() {
    const session = Auth.getSession();
    if (!session) return;
    const notifs = Store.getNotificationsForUser(session.userId, session.role, session.region, session.institutionId).slice(0, 20);
    const list = document.getElementById('notification-list');

    if (notifs.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="material-icons-round">notifications_none</span><h3>No notifications</h3><p>You're all caught up!</p></div>`;
      return;
    }

    const iconMap = {
      deadline_approaching: { icon: 'schedule', bg: 'var(--color-warning-50)', color: 'var(--color-warning-700)' },
      overdue: { icon: 'alarm', bg: 'var(--color-danger-50)', color: 'var(--color-danger-700)' },
      escalation: { icon: 'priority_high', bg: 'var(--color-danger-50)', color: 'var(--color-danger-700)' },
      document_expiring: { icon: 'event_busy', bg: 'var(--color-warning-50)', color: 'var(--color-warning-700)' },
      document_expired: { icon: 'error', bg: 'var(--color-danger-50)', color: 'var(--color-danger-700)' },
      evc_scheduled: { icon: 'event_available', bg: 'var(--color-info-50)', color: 'var(--color-info-700)' },
      submission_received: { icon: 'cloud_upload', bg: 'var(--color-success-50)', color: 'var(--color-success-700)' },
      returned: { icon: 'undo', bg: 'var(--color-warning-50)', color: 'var(--color-warning-700)' },
      approved: { icon: 'check_circle', bg: 'var(--color-success-50)', color: 'var(--color-success-700)' },
    };

    list.innerHTML = notifs.map(n => {
      const cfg = iconMap[n.type] || { icon: 'info', bg: 'var(--color-gray-100)', color: 'var(--color-gray-700)' };
      return `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="Components.handleNotifClick('${n.id}', '${n.entityType}', '${n.entityId}')">
          <div class="notif-icon" style="background: ${cfg.bg}; color: ${cfg.color}">
            <span class="material-icons-round">${cfg.icon}</span>
          </div>
          <div class="notif-content">
            <div class="notif-title">${Utils.escapeHtml(n.title)}</div>
            <div class="notif-desc">${Utils.escapeHtml(n.message)}</div>
            <div class="notif-time">${Utils.timeAgo(n.createdAt)}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  handleNotifClick(notifId, entityType, entityId) {
    Store.markNotificationRead(notifId);
    this.updateNotificationBadge();
    const notifPanel = document.getElementById('notification-panel');
    if (notifPanel) {
      notifPanel.hidden = true;
      notifPanel.style.display = 'none';
    }

    // Navigate to relevant page
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
        Router.navigate('notifications');
    }
  },

  // Toast notification
  showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toast-container');
    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <div class="toast-icon"><span class="material-icons-round">${icons[type] || 'info'}</span></div>
      <div class="toast-body">
        ${title ? `<div class="toast-title">${Utils.escapeHtml(title)}</div>` : ''}
        <div class="toast-message">${Utils.escapeHtml(message)}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <span class="material-icons-round" style="font-size:16px">close</span>
      </button>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  },

  // Modal
  showModal(title, bodyHtml, footerHtml = '') {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    overlay.hidden = false;
    overlay.style.display = 'flex';
    // Focus trap
    const firstInput = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea, #modal-body button');
    if (firstInput) firstInput.focus();
  },

  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.hidden = true;
    overlay.style.display = 'none';
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-footer').innerHTML = '';
  },

  // Donut chart SVG
  donutChart(data, total, label) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const colors = ['#3f51b5', '#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#009688', '#ff5722'];

    const arcs = data.map((item, i) => {
      const pct = total > 0 ? item.value / total : 0;
      const dash = pct * circumference;
      const arc = `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="12" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" stroke-linecap="round"/>`;
      offset += dash;
      return arc;
    });

    const legend = data.map((item, i) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${colors[i % colors.length]}"></span>
        ${Utils.escapeHtml(item.label)}: ${item.value}
      </div>
    `).join('');

    return `
      <div class="donut-chart">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${radius}" fill="none" stroke="var(--border-color)" stroke-width="12"/>
          ${arcs.join('')}
        </svg>
        <div class="donut-center">
          <div class="donut-value">${total}</div>
          <div class="donut-label">${Utils.escapeHtml(label)}</div>
        </div>
      </div>
      <div class="chart-legend">${legend}</div>
    `;
  },

  // Bar chart
  barChart(data, maxValue) {
    const max = maxValue || Math.max(...data.map(d => d.value), 1);
    const colors = ['#3f51b5', '#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#009688', '#ff5722'];

    return `
      <div class="chart-bar-group">
        ${data.map((item, i) => {
          const height = (item.value / max) * 100;
          return `
            <div class="chart-bar-wrapper">
              <div class="chart-bar-value">${item.value}</div>
              <div class="chart-bar" style="height:${Math.max(height, 2)}%;background:${colors[i % colors.length]}" title="${Utils.escapeHtml(item.label)}: ${item.value}"></div>
              <div class="chart-bar-label">${Utils.escapeHtml(item.label)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // Workflow stage progress indicator
  stageProgress(application) {
    const template = Store.getById('workflowTemplates', application.workflowTemplateId);
    if (!template) return '<p class="text-muted">Workflow template not found</p>';

    const stages = template.stages;
    const currentIdx = stages.findIndex(s => s.id === application.currentStage);

    return `
      <div class="stage-progress">
        ${stages.map((stage, idx) => {
          let stateClass = '';
          let icon = 'radio_button_unchecked';

          if (application.status === 'approved' || application.status === 'rejected') {
            if (idx <= stages.length - 1) {
              stateClass = application.status === 'approved' ? 'completed' : (idx === stages.length - 1 ? 'returned' : 'completed');
              icon = application.status === 'approved' ? 'check_circle' : (idx === stages.length - 1 ? 'cancel' : 'check_circle');
            }
          } else if (application.status === 'returned' && idx === currentIdx) {
            stateClass = 'returned';
            icon = 'undo';
          } else if (idx < currentIdx || (currentIdx === -1 && application.status === 'approved')) {
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
  }
};
