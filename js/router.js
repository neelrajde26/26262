/* ============================================
   AICTE FlowGuard — Client-Side Router
   Asynchronous view loading with error boundaries
   ============================================ */

const Router = {
  currentPage: null,
  currentParams: {},

  routes: {
    dashboard: { title: 'Dashboard', icon: 'dashboard', render: () => DashboardPage.render() },
    applications: { title: 'Applications', icon: 'description', render: () => ApplicationsPage.render() },
    'application-detail': { title: 'Application Detail', icon: 'description', render: (params) => ApplicationDetailPage.render(params) },
    evc: { title: 'EVC Management', icon: 'groups', render: () => EVCPage.render() },
    undertakings: { title: 'Undertakings & Compliance', icon: 'fact_check', render: () => UndertakingsPage.render() },
    documents: { title: 'Document Validity', icon: 'folder_open', render: () => DocumentsPage.render() },
    notifications: { title: 'Notifications', icon: 'notifications', render: () => NotificationsPageView.render() },
    reports: { title: 'Reports', icon: 'assessment', render: () => ReportsPage.render() },
    audit: { title: 'Audit Trail', icon: 'history', render: () => AuditPage.render() },
    admin: { title: 'Administration', icon: 'settings', render: () => AdminPage.render() },
  },

  async navigate(page, params = {}) {
    // Check auth
    if (!Auth.isLoggedIn()) {
      App.showLogin();
      return;
    }

    // Check access
    const basePage = page === 'application-detail' ? 'applications' : page;
    if (!Auth.canAccessNav(basePage)) {
      this.renderPermissionDenied();
      return;
    }

    const route = this.routes[page];
    if (!route) {
      this.renderNotFound();
      return;
    }

    this.currentPage = page;
    this.currentParams = params;

    // Update page title
    const pageTitleEl = document.getElementById('page-title');
    if (pageTitleEl) pageTitleEl.textContent = route.title;

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === basePage);
    });

    // Close mobile sidebar if open
    document.getElementById('sidebar')?.classList.remove('mobile-open');

    // Render the page with error boundary
    try {
      await route.render(params);
    } catch (err) {
      console.error(`Error rendering route '${page}':`, err);
      const container = document.getElementById('page-container');
      if (container && typeof Components !== 'undefined') {
        container.innerHTML = Components.renderErrorState(
          'Error Loading Page',
          err.message || 'Could not load the requested view from the server.',
          `Router.navigate('${page}', ${JSON.stringify(params)})`
        );
      }
    }
  },

  renderPermissionDenied() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="permission-denied" style="text-align:center; padding: 60px 24px;">
        <span class="material-icons-round" style="font-size: 54px; color: var(--color-danger); margin-bottom: 16px;">lock</span>
        <h3 style="font-size: var(--font-size-lg); font-weight: 600; margin-bottom: 8px;">Access Restricted</h3>
        <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto 20px;">You do not have administrative or regional permissions to access this section in your current session.</p>
        <button class="btn btn-primary" onclick="Router.navigate('dashboard')">
          <span class="material-icons-round">home</span> Go to Dashboard
        </button>
      </div>
    `;
  },

  renderNotFound() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding: 60px 24px;">
        <span class="material-icons-round" style="font-size: 54px; color: var(--text-tertiary); margin-bottom: 16px;">search_off</span>
        <h3 style="font-size: var(--font-size-lg); font-weight: 600; margin-bottom: 8px;">Page Not Found</h3>
        <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto 20px;">The requested navigation view does not exist in FlowGuard.</p>
        <button class="btn btn-primary" onclick="Router.navigate('dashboard')">
          <span class="material-icons-round">home</span> Go to Dashboard
        </button>
      </div>
    `;
  }
};
