/* ============================================
   AICTE FlowGuard — Client-Side Router
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

  navigate(page, params = {}) {
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
    document.getElementById('page-title').textContent = route.title;

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === basePage);
    });

    // Render the page
    route.render(params);

    // Close mobile sidebar if open
    document.getElementById('sidebar')?.classList.remove('mobile-open');
  },

  renderPermissionDenied() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="permission-denied">
        <span class="material-icons-round">lock</span>
        <h3>Access Denied</h3>
        <p>You do not have permission to access this section. Please contact your system administrator if you believe this is an error.</p>
        <button class="btn btn-primary" onclick="Router.navigate('dashboard')" style="margin-top: var(--space-4)">
          <span class="material-icons-round">home</span> Go to Dashboard
        </button>
      </div>
    `;
  },

  renderNotFound() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons-round">search_off</span>
        <h3>Page Not Found</h3>
        <p>The page you're looking for doesn't exist.</p>
        <button class="btn btn-primary" onclick="Router.navigate('dashboard')" style="margin-top: var(--space-4)">
          <span class="material-icons-round">home</span> Go to Dashboard
        </button>
      </div>
    `;
  }
};


