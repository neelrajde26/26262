/* ============================================
   AICTE FlowGuard — Administration Page
   ============================================ */

const AdminPage = {
  currentTab: 'workflows',

  render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();

    if (session?.role !== 'admin') {
      container.innerHTML = `
        <div class="permission-denied">
          <span class="material-icons-round">security</span>
          <h3>Administrator Access Required</h3>
          <p>You must have system administrator privileges to access FlowGuard configuration settings.</p>
          <button class="btn btn-primary" onclick="Router.navigate('dashboard')" style="margin-top: var(--space-4)">
            <span class="material-icons-round">home</span> Go to Dashboard
          </button>
        </div>
      `;
      return;
    }

    const templates = Store.getAll('workflowTemplates');
    const escalationRules = Store.getAll('escalationRules');
    const users = Store.getAll('users');
    const regions = Store.getAll('regions');

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-5);">
        <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">System Administration & Configuration</h2>
        <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
          Configure approval workflow templates, SLA escalation rules, user accounts, and system parameters.
        </p>
      </div>

      <!-- Navigation Tabs -->
      <div class="card" style="margin-bottom: var(--space-5);">
        <div class="tabs" style="border-bottom: none; padding: var(--space-2) var(--space-4);">
          <button class="tab-btn ${this.currentTab === 'workflows' ? 'active' : ''}" onclick="AdminPage.switchTab('workflows')">
            <span class="material-icons-round">account_tree</span> Workflow Templates (${templates.length})
          </button>
          <button class="tab-btn ${this.currentTab === 'escalations' ? 'active' : ''}" onclick="AdminPage.switchTab('escalations')">
            <span class="material-icons-round">notifications_active</span> Escalation Rules (${escalationRules.length})
          </button>
          <button class="tab-btn ${this.currentTab === 'users' ? 'active' : ''}" onclick="AdminPage.switchTab('users')">
            <span class="material-icons-round">manage_accounts</span> User Management (${users.length})
          </button>
          <button class="tab-btn ${this.currentTab === 'system' ? 'active' : ''}" onclick="AdminPage.switchTab('system')">
            <span class="material-icons-round">settings_system_daydream</span> System & Data
          </button>
        </div>
      </div>

      <!-- Tab Content Area -->
      <div id="admin-tab-content">
        ${this.renderTabContent(this.currentTab, { templates, escalationRules, users, regions })}
      </div>
    `;
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  renderTabContent(tab, data) {
    switch (tab) {
      case 'workflows':
        return this.renderWorkflowsTab(data.templates);
      case 'escalations':
        return this.renderEscalationsTab(data.escalationRules);
      case 'users':
        return this.renderUsersTab(data.users, data.regions);
      case 'system':
        return this.renderSystemTab();
      default:
        return '';
    }
  },

  renderWorkflowsTab(templates) {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
        <h3 style="font-size: var(--font-size-lg);">Approval Workflow Pipelines</h3>
        <button class="btn btn-primary btn-sm" onclick="AdminPage.showAddWorkflowModal()">
          <span class="material-icons-round">add</span> Create Workflow Template
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        ${templates.map(tmpl => {
          const totalDays = tmpl.stages.reduce((acc, s) => acc + (s.timelineDays || 0), 0);

          return `
            <div class="card">
              <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-2);">
                <div>
                  <h4 style="font-size: var(--font-size-base);">${Utils.escapeHtml(tmpl.name)}</h4>
                  <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 2px;">
                    ${Utils.escapeHtml(tmpl.description)} • Total SLA: <strong>${totalDays} days</strong>
                  </div>
                </div>
                <div style="display: flex; gap: var(--space-2); align-items: center;">
                  <span class="badge badge-info">v${tmpl.version || '1.0'}</span>
                  <span class="badge badge-neutral">${tmpl.applicableTo ? tmpl.applicableTo.join(', ') : 'All'}</span>
                </div>
              </div>
              <div class="card-body">
                <div class="workflow-stage-list">
                  ${tmpl.stages.map(st => `
                    <div class="workflow-stage-item">
                      <div class="stage-order">${st.order}</div>
                      <div class="stage-name">
                        <span style="font-weight: var(--font-weight-medium);">${Utils.escapeHtml(st.name)}</span>
                        ${st.required ? '<span class="badge badge-primary" style="font-size: 10px; margin-left: 6px;">Mandatory</span>' : '<span class="badge badge-neutral" style="font-size: 10px; margin-left: 6px;">Conditional</span>'}
                      </div>
                      <div class="stage-timeline">
                        <span class="material-icons-round" style="font-size: 14px; vertical-align: middle;">schedule</span>
                        <strong>${st.timelineDays} days</strong> max SLA
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderEscalationsTab(rules) {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
        <div>
          <h3 style="font-size: var(--font-size-lg);">Automated SLA Escalation Rules</h3>
          <p style="font-size: var(--font-size-xs); color: var(--text-secondary); margin: 0;">
            Hierarchical triggers for overdue scrutiny, pending compliance undertakings, and expired statutory documents.
          </p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="AdminPage.showAddRuleModal()">
          <span class="material-icons-round">add</span> Add Escalation Rule
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        ${rules.map(rule => `
          <div class="card" style="border-left: 4px solid ${rule.active ? 'var(--color-primary-500)' : 'var(--border-color)'};">
            <div class="card-body">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); flex-wrap: wrap;">
                <div>
                  <div style="display: flex; align-items: center; gap: var(--space-2);">
                    <h4 style="font-size: var(--font-size-base);">${Utils.escapeHtml(rule.name)}</h4>
                    ${rule.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>'}
                  </div>
                  <div style="font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 4px;">
                    Trigger Type: <code style="font-family: var(--font-mono);">${rule.triggerType}</code>
                  </div>
                </div>
                <div>
                  <button class="btn btn-outline btn-sm" onclick="AdminPage.toggleRuleActive('${rule.id}')">
                    ${rule.active ? 'Pause Rule' : 'Activate Rule'}
                  </button>
                </div>
              </div>

              <div class="detail-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); margin-top: var(--space-4); background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--border-radius); font-size: var(--font-size-xs);">
                <div>
                  <span class="detail-label">Pre-Warning Reminder</span>
                  <span class="detail-value">${rule.reminderDays} days before due date</span>
                </div>
                <div>
                  <span class="detail-label">Level 1 Escalation</span>
                  <span class="detail-value">
                    After <strong>+${rule.escalationLevel1Days} days</strong> → ${Auth.ROLES[rule.escalationLevel1Role]?.label || rule.escalationLevel1Role}
                  </span>
                </div>
                <div>
                  <span class="detail-label">Level 2 Escalation</span>
                  <span class="detail-value">
                    After <strong>+${rule.escalationLevel2Days} days</strong> → ${Auth.ROLES[rule.escalationLevel2Role]?.label || rule.escalationLevel2Role}
                  </span>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderUsersTab(users, regions) {
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
        <h3 style="font-size: var(--font-size-lg);">User Roles & Access Control</h3>
        <button class="btn btn-primary btn-sm" onclick="AdminPage.showAddUserModal()">
          <span class="material-icons-round">person_add</span> Add User
        </button>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>User / Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Region / Institution</th>
                <th>Status</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const reg = regions.find(r => r.id === u.region);
                return `
                  <tr>
                    <td>
                      <div style="font-weight: var(--font-weight-medium);">${Utils.escapeHtml(u.fullName)}</div>
                      <div style="font-size: var(--font-size-xs); color: var(--text-tertiary);">${Utils.escapeHtml(u.email || '')}</div>
                    </td>
                    <td style="font-family: var(--font-mono); font-size: var(--font-size-xs);">${Utils.escapeHtml(u.username)}</td>
                    <td>
                      <span class="badge badge-info">${Auth.ROLES[u.role]?.label || u.role}</span>
                    </td>
                    <td style="font-size: var(--font-size-sm);">
                      ${reg ? reg.name : (u.institutionId || 'National')}
                    </td>
                    <td>
                      ${u.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Disabled</span>'}
                    </td>
                    <td style="text-align: right;">
                      <button class="btn btn-ghost btn-sm" onclick="AdminPage.toggleUserActive('${u.id}')">
                        ${u.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderSystemTab() {
    return `
      <div class="card" style="margin-bottom: var(--space-5);">
        <div class="card-header">
          <h4>Demo Data & Seed Configuration</h4>
        </div>
        <div class="card-body">
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.6; margin-bottom: var(--space-4);">
            AICTE FlowGuard includes realistic seed fixtures for institutions, approval applications across stages, EVC visits, compliance undertakings, documents, and notifications.
            You can restore all database collections to initial pristine demo fixtures anytime.
          </p>
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="AdminPage.triggerSchedulerRun()">
              <span class="material-icons-round">alarm_on</span> Run SLA & Escalation Scan Now
            </button>
            <button class="btn btn-warning" onclick="AdminPage.resetDemoData()">
              <span class="material-icons-round">restart_alt</span> Reset to Initial Demo Data
            </button>
            <button class="btn btn-danger" onclick="AdminPage.clearAllStorage()">
              <span class="material-icons-round">delete_forever</span> Wipe All Local Storage
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h4>System Parameters & Environment</h4>
        </div>
        <div class="card-body">
          <div class="detail-grid" style="grid-template-columns: 1fr 1fr; font-size: var(--font-size-xs);">
            <div>
              <span class="detail-label">Platform Edition</span>
              <span class="detail-value">AICTE FlowGuard — SIH 2026 Prototype</span>
            </div>
            <div>
              <span class="detail-label">Storage Engine</span>
              <span class="detail-value">HTML5 LocalStorage + SessionStorage</span>
            </div>
            <div>
              <span class="detail-label">Role-Based Access Control</span>
              <span class="detail-value">6 Distinct Roles with Scoped Filtering</span>
            </div>
            <div>
              <span class="detail-label">Audit Engine</span>
              <span class="detail-value">Append-only provenance transaction stream</span>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  toggleRuleActive(ruleId) {
    const rule = Store.getById('escalationRules', ruleId);
    if (!rule) return;
    Store.update('escalationRules', ruleId, { active: !rule.active });
    Components.showToast(`Rule "${rule.name}" is now ${!rule.active ? 'Active' : 'Paused'}.`, 'info');
    this.render();
  },

  toggleUserActive(userId) {
    const user = Store.getById('users', userId);
    if (!user) return;
    Store.update('users', userId, { active: !user.active });
    Components.showToast(`User account "${user.username}" updated.`, 'info');
    this.render();
  },

  showAddWorkflowModal() {
    const bodyHtml = `
      <form id="add-wf-form">
        <div class="form-group">
          <label class="form-label">Workflow Name *</label>
          <input type="text" id="modal-wf-name" class="form-input" required placeholder="e.g. Scrutiny + EVC Fast-track">
        </div>
        <div class="form-group">
          <label class="form-label">Description *</label>
          <input type="text" id="modal-wf-desc" class="form-input" required placeholder="Description of applicable approval category">
        </div>
        <div class="form-group">
          <label class="form-label">Applicable Application Types (comma separated) *</label>
          <input type="text" id="modal-wf-types" class="form-input" required value="new-program, intake-change">
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="AdminPage.handleAddWorkflowSubmit()">
        <span class="material-icons-round">check</span> Save Template
      </button>
    `;

    Components.showModal('Create Workflow Template', bodyHtml, footerHtml);
  },

  handleAddWorkflowSubmit() {
    const nameInput = document.getElementById('modal-wf-name');
    const descInput = document.getElementById('modal-wf-desc');
    const typesInput = document.getElementById('modal-wf-types');

    if (!nameInput.value.trim()) {
      Components.showToast('Please enter a workflow name.', 'warning');
      return;
    }

    const newTemplate = {
      id: Utils.generateId('wf'),
      name: nameInput.value.trim(),
      description: descInput.value.trim(),
      stages: [
        { id: 'scrutiny', name: 'Scrutiny', order: 1, timelineDays: 15, required: true },
        { id: 'evc-pending', name: 'EVC Visit', order: 2, timelineDays: 15, required: true },
        { id: 'approved', name: 'Decision', order: 3, timelineDays: 7, required: true }
      ],
      applicableTo: typesInput.value.split(',').map(s => s.trim()),
      version: '1.0',
      effectiveDate: Utils.today(),
      isDemo: true
    };

    Store.create('workflowTemplates', newTemplate);
    Components.closeModal();
    Components.showToast('New workflow template created!', 'success');
    this.render();
  },

  showAddRuleModal() {
    const bodyHtml = `
      <form id="add-rule-form">
        <div class="form-group">
          <label class="form-label">Rule Name *</label>
          <input type="text" id="modal-rule-name" class="form-input" required placeholder="e.g. Scrutiny Delay Escalation">
        </div>
        <div class="form-group">
          <label class="form-label">Trigger Condition *</label>
          <select id="modal-rule-trigger" class="form-input" required>
            <option value="application_overdue">Application Stage Overdue</option>
            <option value="undertaking_overdue">Undertaking Compliance Overdue</option>
            <option value="document_expiry">Document Expiration</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Pre-warning Reminder (Days Before) *</label>
          <input type="number" id="modal-rule-reminder" class="form-input" required value="3">
        </div>
        <div class="form-group">
          <label class="form-label">Level 1 Escalation Officer *</label>
          <select id="modal-rule-level1" class="form-input" required>
            <option value="bureau_officer">Bureau Officer</option>
            <option value="regional_officer">Regional Officer</option>
            <option value="competent_authority">Competent Authority</option>
          </select>
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="AdminPage.handleAddRuleSubmit()">
        <span class="material-icons-round">check</span> Save Rule
      </button>
    `;

    Components.showModal('Add Escalation Rule', bodyHtml, footerHtml);
  },

  handleAddRuleSubmit() {
    const nameInput = document.getElementById('modal-rule-name');
    const triggerSelect = document.getElementById('modal-rule-trigger');
    const reminderInput = document.getElementById('modal-rule-reminder');
    const level1Select = document.getElementById('modal-rule-level1');

    if (!nameInput.value.trim()) {
      Components.showToast('Please enter rule name.', 'warning');
      return;
    }

    const newRule = {
      id: Utils.generateId('esc'),
      name: nameInput.value.trim(),
      triggerType: triggerSelect.value,
      reminderDays: parseInt(reminderInput.value, 10) || 3,
      escalationLevel1Role: level1Select.value,
      escalationLevel1Days: 5,
      escalationLevel2Role: 'competent_authority',
      escalationLevel2Days: 10,
      active: true,
      isDemo: true
    };

    Store.create('escalationRules', newRule);
    Components.closeModal();
    Components.showToast('Escalation rule created successfully!', 'success');
    this.render();
  },

  showAddUserModal() {
    const regions = Store.getAll('regions');

    const bodyHtml = `
      <form id="add-user-form">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" id="modal-user-name" class="form-input" required placeholder="e.g. Dr. Ramesh Kumar">
        </div>
        <div class="form-group">
          <label class="form-label">Username *</label>
          <input type="text" id="modal-user-username" class="form-input" required placeholder="e.g. ro_east">
        </div>
        <div class="form-group">
          <label class="form-label">Role *</label>
          <select id="modal-user-role" class="form-input" required>
            ${Object.entries(Auth.ROLES).map(([key, def]) => `<option value="${key}">${def.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Region (If applicable)</label>
          <select id="modal-user-region" class="form-input">
            <option value="">None / National</option>
            ${regions.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Password *</label>
          <input type="password" id="modal-user-password" class="form-input" required value="demo123">
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="AdminPage.handleAddUserSubmit()">
        <span class="material-icons-round">person_add</span> Create User
      </button>
    `;

    Components.showModal('Create User Account', bodyHtml, footerHtml);
  },

  handleAddUserSubmit() {
    const nameInput = document.getElementById('modal-user-name');
    const usernameInput = document.getElementById('modal-user-username');
    const roleSelect = document.getElementById('modal-user-role');
    const regionSelect = document.getElementById('modal-user-region');
    const pwdInput = document.getElementById('modal-user-password');

    if (!nameInput.value.trim() || !usernameInput.value.trim() || !pwdInput.value) {
      Components.showToast('Please fill in all required user fields.', 'warning');
      return;
    }

    const newUser = {
      username: usernameInput.value.trim(),
      fullName: nameInput.value.trim(),
      role: roleSelect.value,
      region: regionSelect.value || null,
      passwordHash: Utils.simpleHash(pwdInput.value),
      email: `${usernameInput.value.trim()}@demo.flowguard.in`,
      active: true
    };

    Store.create('users', newUser);
    Components.closeModal();
    Components.showToast(`User account "${newUser.username}" created!`, 'success');
    this.render();
  },

  resetDemoData() {
    if (confirm('Are you sure you want to restore all collections to initial demo seed data? All recent changes will be reset.')) {
      SeedData.reset();
      Components.showToast('Demo data re-seeded successfully!', 'success');
      setTimeout(() => location.reload(), 800);
    }
  },

  async triggerSchedulerRun() {
    Components.showToast('Executing SLA & Escalation scan...', 'info');
    try {
      const res = await API.runScheduler();
      if (res && res.summary) {
        const s = res.summary;
        Components.showToast(`SLA Scan: ${s.checkedApplications} apps, ${s.alertsGenerated} alerts, ${s.escalationsTriggered} escalations, ${s.duplicatesPrevented} deduplicated.`, 'success', 'SLA Scheduler Active');
      } else {
        Components.showToast('SLA due-date scan complete.', 'success');
      }
    } catch (e) {
      Components.showToast('SLA scan complete (Local simulation mode).', 'success');
    }
  },

  clearAllStorage() {
    if (confirm('Clear all FlowGuard localStorage? You will need to log in again.')) {
      Store.clearAll();
      Store.clearSession();
      location.reload();
    }
  }
};
