/* ============================================
   AICTE FlowGuard — Authentication & Authorization
   Connected directly to Backend JWT & REST API
   ============================================ */

const Auth = {
  // Role definitions with fine-grained permissions and navigation rules
  ROLES: {
    institution: {
      label: 'Institution User',
      permissions: ['view_own_applications', 'submit_application', 'view_own_undertakings', 'submit_evidence', 'view_own_documents', 'upload_document', 'renew_document', 'view_own_notifications'],
      navItems: ['dashboard', 'applications', 'undertakings', 'documents', 'notifications'],
      dataScope: 'institution',
    },
    regional_officer: {
      label: 'Regional Officer',
      permissions: ['view_region_applications', 'review_application', 'advance_stage', 'return_application', 'review_undertaking', 'assign_undertaking', 'review_document', 'verify_document', 'view_region_notifications', 'view_region_reports', 'view_evc', 'manage_evc', 'view_audit'],
      navItems: ['dashboard', 'applications', 'evc', 'undertakings', 'documents', 'notifications', 'reports', 'audit'],
      dataScope: 'region',
    },
    bureau_officer: {
      label: 'Bureau Officer',
      permissions: ['view_region_applications', 'view_all_applications', 'review_application', 'advance_stage', 'return_application', 'review_undertaking', 'assign_undertaking', 'review_document', 'verify_document', 'view_all_notifications', 'view_all_reports', 'view_evc', 'manage_evc', 'view_audit'],
      navItems: ['dashboard', 'applications', 'evc', 'undertakings', 'documents', 'notifications', 'reports', 'audit'],
      dataScope: 'bureau',
    },
    committee: {
      label: 'Committee / EVC Expert',
      permissions: ['view_assigned_applications', 'view_evc', 'manage_evc', 'submit_evc_report', 'view_assigned_notifications'],
      navItems: ['dashboard', 'applications', 'evc', 'notifications'],
      dataScope: 'assigned',
    },
    competent_authority: {
      label: 'Competent Authority',
      permissions: ['view_all_applications', 'approve_application', 'reject_application', 'view_all_reports', 'view_all_notifications', 'view_evc', 'view_audit', 'view_escalations'],
      navItems: ['dashboard', 'applications', 'evc', 'undertakings', 'documents', 'notifications', 'reports', 'audit'],
      dataScope: 'all',
    },
    admin: {
      label: 'System Administrator',
      permissions: ['manage_users', 'manage_workflows', 'manage_regions', 'manage_escalation_rules', 'manage_system', 'view_all_applications', 'view_all_reports', 'view_audit', 'view_all_notifications', 'reset_data'],
      navItems: ['dashboard', 'applications', 'evc', 'undertakings', 'documents', 'notifications', 'reports', 'audit', 'admin'],
      dataScope: 'all',
    },
  },

  // Authenticate user via Backend REST API
  async login(username, password) {
    try {
      const data = await API.login(username, password);
      if (data && data.success && data.user) {
        Store.setSession(data.user);
        return { success: true, session: data.user, token: data.token };
      }
      return { success: false, error: data.error || 'Authentication failed' };
    } catch (err) {
      return { success: false, error: err.message || 'Login failed. Please check your credentials.' };
    }
  },

  // Terminate session
  async logout() {
    try {
      await API.logout();
    } catch (err) {
      console.warn('Logout network notice:', err.message);
    } finally {
      Store.clearSession();
      API.setToken(null);
    }
  },

  // Check and sync session with backend
  async checkSession() {
    const token = API.getToken();
    if (!token) {
      Store.clearSession();
      return null;
    }
    try {
      const data = await API.getMe();
      if (data && data.user) {
        Store.setSession(data.user);
        return data.user;
      }
      Store.clearSession();
      return null;
    } catch (err) {
      Store.clearSession();
      API.setToken(null);
      return null;
    }
  },

  // Get current active session
  getSession() {
    return Store.getSession();
  },

  isLoggedIn() {
    return !!this.getSession() && !!API.getToken();
  },

  // Check permission
  hasPermission(permission) {
    const session = this.getSession();
    if (!session) return false;
    const roleDef = this.ROLES[session.role];
    if (!roleDef) return false;
    return roleDef.permissions.includes(permission);
  },

  // Check if user can access a navigation item
  canAccessNav(navId) {
    const session = this.getSession();
    if (!session) return false;
    const roleDef = this.ROLES[session.role];
    if (!roleDef) return false;
    return roleDef.navItems.includes(navId);
  },

  // Defense-in-depth client-side scope filter
  filterByScope(items, entityType) {
    if (!Array.isArray(items)) return [];
    const session = this.getSession();
    if (!session) return [];
    const roleDef = this.ROLES[session.role];
    if (!roleDef) return [];

    switch (roleDef.dataScope) {
      case 'all':
        return items;
      case 'institution':
        return items.filter(item => (item.institutionId || item.institution_id) === session.institutionId);
      case 'region':
        return items.filter(item => item.region === session.region);
      case 'bureau':
        return items.filter(item => item.region === session.region || (item.assignedOfficer || item.assigned_officer) === session.userId);
      case 'assigned':
        return items.filter(item => (item.assignedOfficer || item.assigned_officer) === session.userId || (item.committeeId || item.committee_id) === session.userId);
      default:
        return [];
    }
  },

  // Check if user can perform a workflow action
  canPerformAction(action, application) {
    const session = this.getSession();
    if (!session) return false;

    switch (action) {
      case 'advance':
        if (session.role === 'regional_officer') {
          return this.hasPermission('advance_stage') && application?.region === session.region;
        }
        return this.hasPermission('advance_stage') || this.hasPermission('approve_application');
      case 'return':
        if (session.role === 'regional_officer') {
          return this.hasPermission('return_application') && application?.region === session.region;
        }
        return this.hasPermission('return_application');
      case 'approve':
        return this.hasPermission('approve_application');
      case 'reject':
        return this.hasPermission('reject_application');
      case 'submit_evidence':
        return this.hasPermission('submit_evidence') && (application?.institutionId || application?.institution_id) === session.institutionId;
      case 'review_undertaking':
        return this.hasPermission('review_undertaking');
      case 'review_document':
        return this.hasPermission('review_document');
      case 'manage_evc':
        return this.hasPermission('manage_evc');
      default:
        return false;
    }
  },

  // Verified seeded demo accounts
  getDemoAccounts() {
    return [
      { username: 'ro_north', password: 'demo123', name: 'Dr. Priya Mehta', role: 'Regional Officer (North)', desc: 'Northern Region approval oversight' },
      { username: 'ro_south', password: 'demo123', name: 'Dr. Suresh Kumar', role: 'Regional Officer (South)', desc: 'Southern Region approval oversight' },
      { username: 'inst_demotech', password: 'demo123', name: 'Rajesh Sharma', role: 'Institution User', desc: 'Demo Institute of Technology (NR)' },
      { username: 'inst_southeng', password: 'demo123', name: 'K. Balasubramanian', role: 'Institution User', desc: 'Southern Engineering College (SR)' },
      { username: 'bo_bureau1', password: 'demo123', name: 'Ananya Gupta', role: 'Bureau Officer', desc: 'Engineering & Technology Bureau' },
      { username: 'evc_expert1', password: 'demo123', name: 'Prof. K. Ramachandran', role: 'Committee / EVC Expert', desc: 'Expert Visit Committee Inspections' },
      { username: 'ca_authority', password: 'demo123', name: 'Dr. Meera Joshi', role: 'Competent Authority', desc: 'AICTE Member Secretary Approval Orders' },
      { username: 'admin', password: 'demo123', name: 'System Administrator', role: 'System Admin', desc: 'Platform Configuration & Schedulers' }
    ];
  }
};
