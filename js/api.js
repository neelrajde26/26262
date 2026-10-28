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

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = { error: `Server returned invalid JSON response (status ${res.status})` };
      }

      if (!res.ok) {
        const errorMsg = data.detail || data.error || data.title || `HTTP error ${res.status}`;
        const err = new Error(errorMsg);
        err.status = res.status;
        err.problem = data;
        throw err;
      }
      return data;
    } catch (err) {
      console.warn(`[API] Error on ${endpoint}:`, err.message);
      throw err;
    }
  },

  // Secure File Upload Helper
  async uploadFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file selected'));
      if (file.size > 10 * 1024 * 1024) {
        return reject(new Error('File exceeds maximum allowed size of 10MB'));
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await this.request('/api/upload', {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              fileData: reader.result,
              mimeType: file.type || 'application/octet-stream'
            })
          });
          resolve(res);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed reading file from local storage'));
      reader.readAsDataURL(file);
    });
  },

  // Generate verified download link
  getFileUrl(storedPath) {
    if (!storedPath) return '#';
    return `${this.baseUrl}/api/files/${encodeURIComponent(storedPath)}`;
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

  async submitEvidence(id, fileName, storedPath, notes) {
    return this.request(`/api/undertakings/${id}/submit-evidence`, {
      method: 'POST',
      body: JSON.stringify({ fileName, storedPath, notes })
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

  async renewDocument(id, issueDate, expiryDate, fileName, storedPath) {
    return this.request(`/api/documents/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify({ issueDate, expiryDate, fileName, storedPath })
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

  // Admin
  async getAdminWorkflows() {
    return this.request('/api/admin/workflows');
  },

  async getAdminUsers() {
    return this.request('/api/admin/users');
  },

  async getAdminEscalationRules() {
    return this.request('/api/admin/escalation-rules');
  },

  async resetSeedData() {
    return this.request('/api/admin/reset-seed', { method: 'POST' });
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
