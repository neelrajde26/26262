/* ============================================
   AICTE FlowGuard — Main Application Bootstrapper
   ============================================ */

const App = {
  init() {
    // 1. Initialize Seed Data if first run
    SeedData.seed();

    // 2. Initialize Theme
    this.initTheme();

    // 3. Setup Global UI Event Listeners
    this.setupEventListeners();

    // 4. Check Auth & Load Page
    if (Auth.isLoggedIn()) {
      this.showApp();
      Router.navigate('dashboard');
    } else {
      this.showLogin();
    }
  },

  initTheme() {
    const savedTheme = localStorage.getItem('flowguard_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  },

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('flowguard_theme', nextTheme);
    this.updateThemeIcon(nextTheme);
  },

  updateThemeIcon(theme) {
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      const icon = themeBtn.querySelector('.material-icons-round');
      if (icon) {
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
      }
    }
  },

  setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorDiv = document.getElementById('login-error');

        const result = Auth.login(usernameInput.value.trim(), passwordInput.value);
        if (result.success) {
          errorDiv.textContent = '';
          this.showApp();
          Router.navigate('dashboard');
          Components.showToast(`Welcome back, ${result.session.fullName}!`, 'success', 'Signed In');
        } else {
          errorDiv.textContent = result.error;
        }
      });
    }

    // Toggle demo accounts list
    const demoToggle = document.getElementById('show-demo-accounts');
    const demoList = document.getElementById('demo-accounts-list');
    if (demoToggle && demoList) {
      demoToggle.addEventListener('click', () => {
        demoList.hidden = !demoList.hidden;
        demoList.style.display = demoList.hidden ? 'none' : 'block';
      });
    }

    // Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.logout();
      });
    }

    // Theme toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // Notification panel toggle
    const notifBtn = document.getElementById('btn-notifications');
    const notifPanel = document.getElementById('notification-panel');
    const closeNotifBtn = document.getElementById('close-notifications');

    if (notifBtn && notifPanel) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = notifPanel.hidden || notifPanel.style.display === 'none';
        notifPanel.hidden = !willShow;
        notifPanel.style.display = willShow ? 'flex' : 'none';
        if (willShow) {
          Components.renderNotificationPanel();
        }
      });
    }

    if (closeNotifBtn && notifPanel) {
      closeNotifBtn.addEventListener('click', () => {
        notifPanel.hidden = true;
        notifPanel.style.display = 'none';
      });
    }

    // Close notifications when clicking outside
    document.addEventListener('click', (e) => {
      if (notifPanel && (!notifPanel.hidden && notifPanel.style.display !== 'none') && !notifPanel.contains(e.target) && !notifBtn?.contains(e.target)) {
        notifPanel.hidden = true;
        notifPanel.style.display = 'none';
      }
    });

    // Sidebar toggle (desktop collapse & mobile open)
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    if (mobileMenuToggle && sidebar) {
      mobileMenuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }

    // Modal close
    const modalClose = document.getElementById('modal-close');
    const modalOverlay = document.getElementById('modal-overlay');

    if (modalClose) {
      modalClose.addEventListener('click', () => {
        Components.closeModal();
      });
    }

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          Components.closeModal();
        }
      });
    }

    // Global Search
    const globalSearch = document.getElementById('global-search');
    if (globalSearch) {
      globalSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = globalSearch.value.trim().toLowerCase();
          if (!query) return;

          // Search in applications
          const apps = Auth.filterByScope(Store.getAll('applications'), 'application');
          const matched = apps.find(a => 
            a.applicationNumber.toLowerCase().includes(query) ||
            a.institutionName.toLowerCase().includes(query)
          );

          if (matched) {
            Router.navigate('application-detail', { id: matched.id });
            globalSearch.value = '';
          } else {
            // Navigate to applications page with filter
            ApplicationsPage.filters.search = query;
            Router.navigate('applications');
          }
        }
      });
    }
  },

  populateDemoAccounts() {
    const grid = document.getElementById('demo-account-grid');
    if (!grid) return;

    const accounts = Auth.getDemoAccounts();
    grid.innerHTML = accounts.map(acc => `
      <div class="demo-account-item" onclick="App.quickLogin('${acc.username}', '${acc.password}')" role="button" tabindex="0">
        <div class="demo-account-info">
          <span class="demo-account-name">${Utils.escapeHtml(acc.name)}</span>
          <span class="demo-account-role">${Utils.escapeHtml(acc.role)} • ${Utils.escapeHtml(acc.desc)}</span>
        </div>
        <div class="demo-account-fill">
          Sign In <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">arrow_forward</span>
        </div>
      </div>
    `).join('');
  },

  quickLogin(username, password) {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    if (usernameInput && passwordInput) {
      usernameInput.value = username;
      passwordInput.value = password;
      const result = Auth.login(username, password);
      if (result.success) {
        document.getElementById('login-error').textContent = '';
        this.showApp();
        Router.navigate('dashboard');
        Components.showToast(`Logged in as ${result.session.fullName} (${Auth.ROLES[result.session.role]?.label || result.session.role})`, 'success');
      }
    }
  },

  showLogin() {
    const login = document.getElementById('login-screen');
    const shell = document.getElementById('app-shell');
    if (login) {
      login.hidden = false;
      login.style.display = 'flex';
    }
    if (shell) {
      shell.hidden = true;
      shell.style.display = 'none';
    }
    const modal = document.getElementById('modal-overlay');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
    const notif = document.getElementById('notification-panel');
    if (notif) {
      notif.hidden = true;
      notif.style.display = 'none';
    }
    this.populateDemoAccounts();
  },

  showApp() {
    const login = document.getElementById('login-screen');
    const shell = document.getElementById('app-shell');
    if (login) {
      login.hidden = true;
      login.style.display = 'none';
    }
    if (shell) {
      shell.hidden = false;
      shell.style.display = 'flex';
    }

    const modal = document.getElementById('modal-overlay');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
    const notif = document.getElementById('notification-panel');
    if (notif) {
      notif.hidden = true;
      notif.style.display = 'none';
    }

    Components.buildNavMenu();
    Components.updateUserDisplay();
    Components.updateNotificationBadge();
  },

  logout() {
    Auth.logout();
    Components.showToast('You have been signed out successfully.', 'info');
    this.showLogin();
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
