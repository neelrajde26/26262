/* ============================================
   AICTE FlowGuard — Main Application Bootstrapper
   Synchronized directly with SQLite Backend
   ============================================ */

const App = {
  async init() {
    // 1. Initialize Theme
    this.initTheme();

    // 2. Setup Global UI Event Listeners
    this.setupEventListeners();

    // 3. Check Session with Server
    try {
      const user = await Auth.checkSession();
      if (user) {
        await Store.loadAll();
        this.showApp();
        Router.navigate('dashboard');
      } else {
        this.showLogin();
      }
    } catch (e) {
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
    // Login form submit handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('login-btn');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorDiv = document.getElementById('login-error');

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;display:inline-block;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:6px;"></span> Signing In...';
        }

        try {
          const result = await Auth.login(usernameInput.value.trim(), passwordInput.value);
          if (result.success) {
            if (errorDiv) errorDiv.textContent = '';
            await Store.loadAll();
            this.showApp();
            Router.navigate('dashboard');
            Components.showToast(`Welcome back, ${result.session.fullName}!`, 'success', 'Signed In');
          } else {
            if (errorDiv) errorDiv.textContent = result.error;
          }
        } catch (err) {
          if (errorDiv) errorDiv.textContent = err.message || 'Unable to connect to server';
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-icons-round">login</span> Sign In';
          }
        }
      });
    }

    // Toggle between login and registration forms
    const showRegisterBtn = document.getElementById('show-register-btn');
    const showLoginBtn = document.getElementById('show-login-btn');
    const loginFormEl = document.getElementById('login-form');
    const registerFormEl = document.getElementById('register-form');
    const regErrorDiv = document.getElementById('reg-error');
    const loginErrorDiv = document.getElementById('login-error');

    if (showRegisterBtn && registerFormEl && loginFormEl) {
      showRegisterBtn.addEventListener('click', () => {
        loginFormEl.hidden = true;
        loginFormEl.style.display = 'none';
        registerFormEl.hidden = false;
        registerFormEl.style.display = 'block';
        if (loginErrorDiv) loginErrorDiv.textContent = '';
        if (regErrorDiv) regErrorDiv.textContent = '';
      });
    }

    if (showLoginBtn && registerFormEl && loginFormEl) {
      showLoginBtn.addEventListener('click', () => {
        registerFormEl.hidden = true;
        registerFormEl.style.display = 'none';
        loginFormEl.hidden = false;
        loginFormEl.style.display = 'block';
        if (loginErrorDiv) loginErrorDiv.textContent = '';
        if (regErrorDiv) regErrorDiv.textContent = '';
      });
    }

    // Registration form submit handler
    if (registerFormEl) {
      registerFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const regSubmitBtn = document.getElementById('reg-btn');
        const instNameInput = document.getElementById('reg-inst-name');
        const regionSelect = document.getElementById('reg-region');
        const fullNameInput = document.getElementById('reg-fullname');
        const emailInput = document.getElementById('reg-email');
        const usernameInput = document.getElementById('reg-username');
        const passwordInput = document.getElementById('reg-password');

        if (regSubmitBtn) {
          regSubmitBtn.disabled = true;
          regSubmitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;display:inline-block;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:6px;"></span> Registering...';
        }

        try {
          const result = await Auth.register({
            institutionName: instNameInput.value.trim(),
            region: regionSelect.value,
            fullName: fullNameInput.value.trim(),
            email: emailInput.value.trim(),
            username: usernameInput.value.trim(),
            password: passwordInput.value
          });

          if (result.success) {
            if (regErrorDiv) regErrorDiv.textContent = '';
            await Store.loadAll();
            this.showApp();
            Router.navigate('dashboard');
            Components.showToast(`Registration complete! Welcome, ${result.session.fullName}!`, 'success', 'Account Registered');
          } else {
            if (regErrorDiv) regErrorDiv.textContent = result.error || 'Registration failed';
          }
        } catch (err) {
          if (regErrorDiv) regErrorDiv.textContent = err.message || 'Unable to complete registration';
        } finally {
          if (regSubmitBtn) {
            regSubmitBtn.disabled = false;
            regSubmitBtn.innerHTML = '<span class="material-icons-round">how_to_reg</span> Register Institutional Account';
          }
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

          const apps = Auth.filterByScope(Store.getAll('applications'), 'application');
          const matched = apps.find(a =>
            (a.applicationNumber || a.application_number || '').toLowerCase().includes(query) ||
            (a.institutionName || a.institution_name || '').toLowerCase().includes(query)
          );

          if (matched) {
            Router.navigate('application-detail', { id: matched.id });
            globalSearch.value = '';
          } else {
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

  async quickLogin(username, password) {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorDiv = document.getElementById('login-error');
    if (usernameInput && passwordInput) {
      usernameInput.value = username;
      passwordInput.value = password;
      if (errorDiv) errorDiv.textContent = '';

      const submitBtn = document.getElementById('login-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;display:inline-block;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:6px;"></span> Signing In...';
      }

      try {
        const result = await Auth.login(username, password);
        if (result.success) {
          await Store.loadAll();
          this.showApp();
          Router.navigate('dashboard');
          Components.showToast(`Logged in as ${result.session.fullName} (${Auth.ROLES[result.session.role]?.label || result.session.role})`, 'success');
        } else {
          if (errorDiv) errorDiv.textContent = result.error;
        }
      } catch (err) {
        if (errorDiv) errorDiv.textContent = err.message || 'Login failed';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="material-icons-round">login</span> Sign In';
        }
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

    const loginFormEl = document.getElementById('login-form');
    const registerFormEl = document.getElementById('register-form');
    if (loginFormEl) {
      loginFormEl.hidden = false;
      loginFormEl.style.display = 'block';
    }
    if (registerFormEl) {
      registerFormEl.hidden = true;
      registerFormEl.style.display = 'none';
    }

    const passwordInput = document.getElementById('login-password');
    if (passwordInput) passwordInput.value = '';
    const regPasswordInput = document.getElementById('reg-password');
    if (regPasswordInput) regPasswordInput.value = '';

    const errorDiv = document.getElementById('login-error');
    if (errorDiv) errorDiv.textContent = '';
    const regErrorDiv = document.getElementById('reg-error');
    if (regErrorDiv) regErrorDiv.textContent = '';

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

  async logout() {
    await Auth.logout();
    Components.showToast('You have been signed out successfully.', 'info');
    this.showLogin();
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
