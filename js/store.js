/* ============================================
   AICTE FlowGuard — Synchronized Data Store
   Full-Stack Cache & Bridge to SQLite Backend
   ============================================ */

const Store = {
  _cache: {
    applications: [],
    evcEvents: [],
    undertakings: [],
    documents: [],
    notifications: [],
    audit: [],
    regions: [
      { id: 'reg-north', name: 'Northern Region', code: 'NR', states: ['Delhi', 'Haryana', 'Punjab', 'Uttar Pradesh', 'Uttarakhand'] },
      { id: 'reg-south', name: 'Southern Region', code: 'SR', states: ['Tamil Nadu', 'Karnataka', 'Kerala', 'Andhra Pradesh', 'Telangana'] },
      { id: 'reg-west', name: 'Western Region', code: 'WR', states: ['Maharashtra', 'Gujarat', 'Rajasthan', 'Goa'] },
      { id: 'reg-east', name: 'Eastern Region', code: 'ER', states: ['West Bengal', 'Odisha', 'Bihar', 'Jharkhand'] }
    ],
    workflowTemplates: [],
    users: [],
    escalationRules: []
  },

  // Record normalizers ensuring seamless compatibility with camelCase and snake_case properties
  _normalizeApp(a) {
    if (!a) return a;
    return {
      ...a,
      applicationNumber: a.application_number || a.applicationNumber,
      institutionId: a.institution_id || a.institutionId,
      institutionName: a.institution_name || a.institutionName,
      programName: a.program_name || a.programName,
      workflowTemplateId: a.workflow_template_id || a.workflowTemplateId,
      currentStage: a.current_stage || a.currentStage,
      currentStageDueDate: a.current_stage_due_date || a.currentStageDueDate,
      submittedDate: a.submitted_date || a.submittedDate,
      returnReason: a.return_reason || a.returnReason,
      isNewInstitution: a.is_new_institution !== undefined ? !!a.is_new_institution : a.isNewInstitution,
      createdAt: a.created_at || a.createdAt,
      updatedAt: a.updated_at || a.updatedAt
    };
  },

  _normalizeEvc(e) {
    if (!e) return e;
    return {
      ...e,
      applicationId: e.application_id || e.applicationId,
      applicationNumber: e.application_number || e.applicationNumber,
      institutionId: e.institution_id || e.institutionId,
      institutionName: e.institution_name || e.institutionName,
      committeeId: e.committee_id || e.committeeId,
      committeeName: e.committee_name || e.committeeName,
      plannedDate: e.planned_date || e.plannedDate,
      completedDate: e.completed_date || e.completedDate,
      meetingMode: e.meeting_mode || e.meetingMode,
      createdAt: e.created_at || e.createdAt,
      updatedAt: e.updated_at || e.updatedAt
    };
  },

  _normalizeUnd(u) {
    if (!u) return u;
    return {
      ...u,
      applicationId: u.application_id || u.applicationId,
      institutionId: u.institution_id || u.institutionId,
      institutionName: u.institution_name || u.institutionName,
      dueDate: u.due_date || u.dueDate,
      requiredEvidence: u.required_evidence || u.requiredEvidence,
      verificationOwner: u.verification_owner || u.verificationOwner,
      verificationOwnerName: u.verification_owner_name || u.verificationOwnerName,
      createdAt: u.created_at || u.createdAt,
      updatedAt: u.updated_at || u.updatedAt
    };
  },

  _normalizeDoc(d) {
    if (!d) return d;
    return {
      ...d,
      institutionId: d.institution_id || d.institutionId,
      institutionName: d.institution_name || d.institutionName,
      issueDate: d.issue_date || d.issueDate,
      effectiveDate: d.effective_date || d.effectiveDate,
      expiryDate: d.expiry_date || d.expiryDate,
      fileName: d.file_name || d.fileName,
      storedPath: d.stored_path || d.storedPath,
      renewalStatus: d.renewal_status || d.renewalStatus,
      verificationStatus: d.verification_status || d.verificationStatus,
      verifiedBy: d.verified_by || d.verifiedBy,
      verifiedDate: d.verified_date || d.verifiedDate,
      createdAt: d.created_at || d.createdAt,
      updatedAt: d.updated_at || d.updatedAt
    };
  },

  _normalizeNotif(n) {
    if (!n) return n;
    return {
      ...n,
      recipientId: n.recipient_id || n.recipientId,
      recipientRole: n.recipient_role || n.recipientRole,
      recipientRegion: n.recipient_region || n.recipientRegion,
      recipientInstitution: n.recipient_institution || n.recipientInstitution,
      entityType: n.entity_type || n.entityType,
      entityId: n.entity_id || n.entityId,
      escalationLevel: n.escalation_level !== undefined ? n.escalation_level : n.escalationLevel,
      createdAt: n.created_at || n.createdAt,
      read: !!n.read
    };
  },

  _normalizeAudit(a) {
    if (!a) return a;
    return {
      ...a,
      actor: a.actor_id || a.actor,
      actorName: a.actor_name || a.actorName,
      entityType: a.entity_type || a.entityType,
      entityId: a.entity_id || a.entityId,
      beforeState: a.before_state || a.beforeState,
      afterState: a.after_state || a.afterState,
      ipAddress: a.ip_address || a.ipAddress,
      timestamp: a.timestamp
    };
  },

  // -------------------------------------------------------------
  // Full-Stack Synchronization: Load fresh data from SQLite Server
  // -------------------------------------------------------------
  async loadAll() {
    if (!Auth.isLoggedIn()) return;
    try {
      const [appsRes, evcRes, undRes, docRes, notifRes] = await Promise.allSettled([
        API.getApplications(),
        API.getEvcEvents(),
        API.getUndertakings(),
        API.getDocuments(),
        API.getNotifications()
      ]);

      if (appsRes.status === 'fulfilled' && appsRes.value?.applications) {
        this._cache.applications = appsRes.value.applications.map(a => this._normalizeApp(a));
      }
      if (evcRes.status === 'fulfilled' && evcRes.value?.evcEvents) {
        this._cache.evcEvents = evcRes.value.evcEvents.map(e => this._normalizeEvc(e));
      }
      if (undRes.status === 'fulfilled' && undRes.value?.undertakings) {
        this._cache.undertakings = undRes.value.undertakings.map(u => this._normalizeUnd(u));
      }
      if (docRes.status === 'fulfilled' && docRes.value?.documents) {
        this._cache.documents = docRes.value.documents.map(d => this._normalizeDoc(d));
      }
      if (notifRes.status === 'fulfilled' && notifRes.value?.notifications) {
        this._cache.notifications = notifRes.value.notifications.map(n => this._normalizeNotif(n));
      }

      // Load admin-only metadata
      const activeSession = Auth.getSession();
      if (activeSession?.role === 'admin') {
        try {
          const wfRes = await API.getAdminWorkflows();
          if (wfRes?.templates) {
            this._cache.workflowTemplates = wfRes.templates;
          }
        } catch (e) {}
      }

      // Update badge
      if (typeof Components !== 'undefined' && Components.updateNotificationBadge) {
        Components.updateNotificationBadge();
      }
    } catch (err) {
      console.warn('Store.loadAll synchronization notice:', err.message);
    }
  },

  // Synchronous read operations
  getAll(collection) {
    if (collection === 'evc') collection = 'evcEvents';
    if (this._cache[collection]) {
      return [...this._cache[collection]];
    }
    const raw = localStorage.getItem('flowguard_' + collection);
    return raw ? JSON.parse(raw) : [];
  },

  getById(collection, id) {
    if (collection === 'evc') collection = 'evcEvents';
    const items = this.getAll(collection);
    return items.find(item => item.id === id) || null;
  },

  query(collection, filterFn) {
    return this.getAll(collection).filter(filterFn);
  },

  count(collection, filterFn) {
    if (!filterFn) return this.getAll(collection).length;
    return this.getAll(collection).filter(filterFn).length;
  },

  // -------------------------------------------------------------
  // Data Mutation Handlers (Server as Single Source of Truth)
  // -------------------------------------------------------------
  async createApplication(data) {
    const res = await API.createApplication(data);
    await this.fetchApplications();
    return res;
  },

  async advanceStage(id, nextStage, notes) {
    const res = await API.advanceStage(id, nextStage, notes);
    await this.fetchApplications();
    await this.fetchNotifications();
    return res;
  },

  async returnApplication(id, returnReason) {
    const res = await API.returnApplication(id, returnReason);
    await this.fetchApplications();
    await this.fetchNotifications();
    return res;
  },

  async approveApplication(id, notes) {
    const res = await API.approveApplication(id, notes);
    await this.fetchApplications();
    await this.fetchNotifications();
    return res;
  },

  async rejectApplication(id, rejectionReason) {
    const res = await API.rejectApplication(id, rejectionReason);
    await this.fetchApplications();
    await this.fetchNotifications();
    return res;
  },

  async scheduleEvc(id, expertId, plannedDate, notes) {
    const res = await API.scheduleEvc(id, expertId, plannedDate, notes);
    await this.fetchEvc();
    await this.fetchApplications();
    return res;
  },

  async submitEvcReport(id, recommendation, report, completedDate) {
    const res = await API.submitEvcReport(id, recommendation, report, completedDate);
    await this.fetchEvc();
    await this.fetchApplications();
    return res;
  },

  async createUndertaking(data) {
    const res = await API.createUndertaking(data);
    await this.fetchUndertakings();
    return res;
  },

  async submitEvidence(id, fileOrName, notes) {
    let fileName = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
    let storedPath = null;

    if (fileOrName && typeof fileOrName !== 'string') {
      const uploadRes = await API.uploadFile(fileOrName);
      fileName = uploadRes.fileName;
      storedPath = uploadRes.storedPath;
    }

    const res = await API.submitEvidence(id, fileName, storedPath, notes);
    await this.fetchUndertakings();
    return res;
  },

  async reviewUndertaking(id, decision, reviewNotes) {
    const res = await API.reviewUndertaking(id, decision, reviewNotes);
    await this.fetchUndertakings();
    return res;
  },

  async createDocument(data, file) {
    let fileName = data.fileName || 'document.pdf';
    let storedPath = null;

    if (file) {
      const uploadRes = await API.uploadFile(file);
      fileName = uploadRes.fileName;
      storedPath = uploadRes.storedPath;
    }

    const res = await API.createDocument({
      ...data,
      fileName,
      storedPath
    });
    await this.fetchDocuments();
    return res;
  },

  async renewDocument(id, issueDate, expiryDate, fileOrName) {
    let fileName = typeof fileOrName === 'string' ? fileOrName : (fileOrName?.name || 'document.pdf');
    let storedPath = null;

    if (fileOrName && typeof fileOrName !== 'string') {
      const uploadRes = await API.uploadFile(fileOrName);
      fileName = uploadRes.fileName;
      storedPath = uploadRes.storedPath;
    }

    const res = await API.renewDocument(id, issueDate, expiryDate, fileName, storedPath);
    await this.fetchDocuments();
    return res;
  },

  async verifyDocument(id) {
    const res = await API.verifyDocument(id);
    await this.fetchDocuments();
    return res;
  },

  async markNotificationRead(id) {
    await API.markNotificationRead(id);
    const notif = this._cache.notifications.find(n => n.id === id);
    if (notif) notif.read = true;
    if (typeof Components !== 'undefined' && Components.updateNotificationBadge) {
      Components.updateNotificationBadge();
    }
  },

  async markAllNotificationsRead() {
    await API.markAllNotificationsRead();
    this._cache.notifications.forEach(n => { n.read = true; });
    if (typeof Components !== 'undefined' && Components.updateNotificationBadge) {
      Components.updateNotificationBadge();
    }
  },

  async runScheduler() {
    const res = await API.runScheduler();
    await this.loadAll();
    return res;
  },

  // Specific Entity Fetchers
  async fetchApplications(params = {}) {
    const res = await API.getApplications(params);
    if (res?.applications) {
      this._cache.applications = res.applications.map(a => this._normalizeApp(a));
    }
    return this._cache.applications;
  },

  async fetchApplicationDetail(id) {
    return API.getApplication(id);
  },

  async fetchUndertakings() {
    const res = await API.getUndertakings();
    if (res?.undertakings) {
      this._cache.undertakings = res.undertakings.map(u => this._normalizeUnd(u));
    }
    return this._cache.undertakings;
  },

  async fetchDocuments() {
    const res = await API.getDocuments();
    if (res?.documents) {
      this._cache.documents = res.documents.map(d => this._normalizeDoc(d));
    }
    return this._cache.documents;
  },

  async fetchEvc() {
    const res = await API.getEvcEvents();
    if (res?.evcEvents) {
      this._cache.evcEvents = res.evcEvents.map(e => this._normalizeEvc(e));
    }
    return this._cache.evcEvents;
  },

  async fetchNotifications() {
    const res = await API.getNotifications();
    if (res?.notifications) {
      this._cache.notifications = res.notifications.map(n => this._normalizeNotif(n));
    }
    if (typeof Components !== 'undefined' && Components.updateNotificationBadge) {
      Components.updateNotificationBadge();
    }
    return this._cache.notifications;
  },

  async fetchAudits() {
    const res = await API.getAudits();
    if (res?.audits) {
      this._cache.audit = res.audits.map(a => this._normalizeAudit(a));
    }
    return this._cache.audit;
  },

  async fetchReports() {
    return API.getReportsStats();
  },

  // Notifications filtering
  getNotificationsForUser(userId, role, region, institutionId) {
    return this.getAll('notifications').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Session management
  setSession(user) {
    sessionStorage.setItem('flowguard_session', JSON.stringify(user));
  },

  getSession() {
    const raw = sessionStorage.getItem('flowguard_session');
    return raw ? JSON.parse(raw) : null;
  },

  clearSession() {
    sessionStorage.removeItem('flowguard_session');
    this._cache.applications = [];
    this._cache.evcEvents = [];
    this._cache.undertakings = [];
    this._cache.documents = [];
    this._cache.notifications = [];
    this._cache.audit = [];
  },

  // Legacy helper placeholders
  isSeeded() { return true; },
  markSeeded() {},
  clearAll() { this.clearSession(); }
};
