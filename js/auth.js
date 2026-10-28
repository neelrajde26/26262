/* ============================================
   AICTE FlowGuard — Authentication & Authorization
   ============================================ */

const Auth = {
  // Role definitions with permissions
  ROLES: {
    institution: {
      label: 'Institution User',
      permissions: ['view_own_applications', 'submit_application', 'view_own_undertakings', 'submit_evidence', 'view_own_documents', 'view_own_notifications'],
      navItems: ['dashboard', 'applications', 'undertakings', 'documents', 'notifications'],
      dataScope: 'institution', // Can only see own institution data
    },
    regional_officer: {
      label: 'Regional Officer',
      permissions: ['view_region_applications', 'review_application', 'advance_stage', 'return_application', 'review_undertaking', 'review_document', 'view_region_notifications', 'view_region_reports', 'view_evc'],
      navItems: ['dashboard', 'applications', 'evc', 'undertakings', 'documents', 'notifications', 'reports', 'audit'],
      dataScope: 'region',
    },
    bureau_officer: {
      label: 'Bureau Officer',
      permissions: ['view_region_applications', 'view_all_applications', 'review_application', 'advance_stage', 'return_application', 'review_undertaking', 'review_document', 'view_all_notifications', 'view_all_reports', 'view_evc', 'manage_evc'],
      navItems: ['dashboard', 'applications', 'evc', 'undertakings', 'documents', 'notifications', 'reports', 'audit'],
      dataScope: 'bureau',
    },
    committee: {
      label: 'Committee / EVC Member',
      permissions: ['view_assigned_applications', 'view_evc', 'manage_evc', 'submit_evc_report', 'view_assigned_notifications'],
      navItems: ['dashboard', 'applications', 'evc', 'notifications'],
      dataScope: 'assigned',
    },
    competent_authority: {
      label: 'Competent Authority',
      permissions: ['view_all_applications', 'approve_application', 'reject_application', 'view_all_reports', 'view_all_notifications', 'view_evc', 'view_escalations'],
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

  // Authenticate user
  login(username, password) {
    const users = Store.getAll('users');
    const user = users.find(u => u.username === username && u.active);
    if (!user) return { success: false, error: 'Invalid username or account inactive.' };

    const hash = Utils.simpleHash(password);
    if (user.passwordHash !== hash) return { success: false, error: 'Invalid password.' };

    const session = {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      region: user.region,
      institutionId: user.institutionId,
      bureau: user.bureau,
      committeeType: user.committeeType,
      loginAt: Utils.now(),
    };

    Store.setSession(session);

    // Audit login
    Store.addAudit({
      actor: user.id,
      actorName: user.fullName,
      action: 'user_login',
      entityType: 'user',
      entityId: user.id,
      details: `${user.fullName} logged in as ${this.ROLES[user.role]?.label || user.role}`,
    });

    return { success: true, session };
  },

  logout() {
    const session = Store.getSession();
    if (session) {
      Store.addAudit({
        actor: session.userId,
        actorName: session.fullName,
        action: 'user_logout',
        entityType: 'user',
        entityId: session.userId,
        details: `${session.fullName} logged out`,
      });
    }
    Store.clearSession();
  },

  // Get current session
  getSession() {
    return Store.getSession();
  },

  isLoggedIn() {
    return !!Store.getSession();
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

  // Filter data by user's scope
  filterByScope(items, entityType) {
    const session = this.getSession();
    if (!session) return [];
    const roleDef = this.ROLES[session.role];
    if (!roleDef) return [];

    switch (roleDef.dataScope) {
      case 'all':
        return items;
      case 'institution':
        return items.filter(item => item.institutionId === session.institutionId);
      case 'region':
        return items.filter(item => item.region === session.region);
      case 'bureau':
        // Bureau officers can see their region plus cross-region cases assigned to them
        return items.filter(item => item.region === session.region || item.assignedOfficer === session.userId);
      case 'assigned':
        // Committee members see only assigned cases
        return items.filter(item => item.assignedOfficer === session.userId || item.committeeId === session.userId);
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
        return this.hasPermission('advance_stage') || this.hasPermission('approve_application');
      case 'return':
        return this.hasPermission('return_application');
      case 'approve':
        return this.hasPermission('approve_application');
      case 'reject':
        return this.hasPermission('reject_application');
      case 'submit_evidence':
        return this.hasPermission('submit_evidence') && application?.institutionId === session.institutionId;
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

  // Get demo accounts for display
  getDemoAccounts() {
    return [
      { username: 'inst_demotech', password: 'demo123', name: 'Rajesh Sharma', role: 'Institution User', desc: 'Demo Technical Institute' },
      { username: 'ro_north', password: 'demo123', name: 'Dr. Priya Mehta', role: 'Regional Officer (North)', desc: 'Northern Region oversight' },
      { username: 'ro_south', password: 'demo123', name: 'Dr. Suresh Kumar', role: 'Regional Officer (South)', desc: 'Southern Region oversight' },
      { username: 'bo_bureau1', password: 'demo123', name: 'Ananya Gupta', role: 'Bureau Officer', desc: 'Engineering bureau' },
      { username: 'evc_expert1', password: 'demo123', name: 'Prof. K. Ramachandran', role: 'Committee / EVC', desc: 'Expert Visit Committee' },
      { username: 'ca_authority', password: 'demo123', name: 'Dr. Meera Joshi', role: 'Competent Authority', desc: 'Approval decisions' },
      { username: 'admin', password: 'demo123', name: 'System Administrator', role: 'Admin', desc: 'System management' },
    ];
  }
};
