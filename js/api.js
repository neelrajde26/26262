/* ============================================
   AICTE FlowGuard — REST API Client & Bridge
   Connects UI directly to SQLite Backend API
   ============================================ */

const API = {
  baseUrl: window.location.origin.includes('http') ? window.location.origin : 'http://localhost:5500',

  getToken() {
    return localStorage.getItem('flowguard_jwt') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('flowguard_jwt', token);
    } else {
      localStorage.removeItem('flowguard_jwt');
    }
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      return data;
    } catch (err) {
      console.warn(`[API] Fallback for ${endpoint}:`, err.message);
      throw err;
    }
  },

  // Auth
  async login(username, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (data.token) this.setToken(data.token);
    return data;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  },

  async getMe() {
    return this.request('/api/auth/me');
  },

  // Applications
  async getApplications(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/applications${qs ? '?' + qs : ''}`);
  },

  async getApplication(id) {
    return this.request(`/api/applications/${id}`);
  },

  async createApplication(data) {
    return this.request('/api/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async advanceStage(id, nextStage, notes) {
    return this.request(`/api/applications/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify({ nextStage, notes })
    });
  },

  async returnApplication(id, returnReason) {
    return this.request(`/api/applications/${id}/return`, {
      method: 'POST',
      body: JSON.stringify({ returnReason })
    });
  },

  async approveApplication(id, notes) {
    return this.request(`/api/applications/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  },

  async rejectApplication(id, rejectionReason) {
    return this.request(`/api/applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason })
    });
  },

  // EVC
  async getEvcEvents() {
    return this.request('/api/evc');
  },

  async scheduleEvc(id, expertId, plannedDate, notes) {
    return this.request(`/api/evc/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ expertId, plannedDate, notes })
    });
  },

  async submitEvcReport(id, recommendation, report, completedDate) {
    return this.request(`/api/evc/${id}/report`, {
      method: 'POST',
      body: JSON.stringify({ recommendation, report, completedDate })
    });
  },

  // Undertakings
  async getUndertakings() {
    return this.request('/api/undertakings');
  },

  async createUndertaking(data) {
    return this.request('/api/undertakings', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async submitEvidence(id, fileName, notes) {
    return this.request(`/api/undertakings/${id}/submit-evidence`, {
      method: 'POST',
      body: JSON.stringify({ fileName, notes })
    });
  },

  async reviewUndertaking(id, decision, reviewNotes) {
    return this.request(`/api/undertakings/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reviewNotes })
    });
  },

  // Documents
  async getDocuments() {
    return this.request('/api/documents');
  },

  async createDocument(data) {
    return this.request('/api/documents', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async renewDocument(id, issueDate, expiryDate, fileName) {
    return this.request(`/api/documents/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify({ issueDate, expiryDate, fileName })
    });
  },

  async verifyDocument(id) {
    return this.request(`/api/documents/${id}/verify`, {
      method: 'POST'
    });
  },

  // Notifications
  async getNotifications() {
    return this.request('/api/notifications');
  },

  async markNotificationRead(id) {
    return this.request(`/api/notifications/${id}/read`, { method: 'POST' });
  },

  async markAllNotificationsRead() {
    return this.request('/api/notifications/read-all', { method: 'POST' });
  },

  async simulateEscalation() {
    return this.request('/api/notifications/simulate-escalation', { method: 'POST' });
  },

  // Reports
  async getReportsStats() {
    return this.request('/api/reports/stats');
  },

  // Audit
  async getAudits() {
    return this.request('/api/audit');
  },

  // Scheduler
  async runScheduler() {
    return this.request('/api/scheduler/run', { method: 'POST' });
  },

  // AI Assistant Services
  async getAISummary(applicationId) {
    return this.request('/api/ai/summarize-application', {
      method: 'POST',
      body: JSON.stringify({ applicationId })
    });
  },

  async getAIChecklist(applicationType) {
    return this.request('/api/ai/document-checklist', {
      method: 'POST',
      body: JSON.stringify({ applicationType })
    });
  },

  async searchRegulatoryAI(query) {
    return this.request('/api/ai/search-assistant', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  }
};
