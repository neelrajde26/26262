/* ============================================
   AICTE FlowGuard — Data Store (localStorage)
   ============================================ */

const Store = {
  _prefix: 'flowguard_',

  // Core CRUD operations
  _getAll(collection) {
    const raw = localStorage.getItem(this._prefix + collection);
    return raw ? JSON.parse(raw) : [];
  },

  _setAll(collection, data) {
    localStorage.setItem(this._prefix + collection, JSON.stringify(data));
  },

  getAll(collection) {
    return this._getAll(collection);
  },

  getById(collection, id) {
    return this._getAll(collection).find(item => item.id === id) || null;
  },

  create(collection, item) {
    const items = this._getAll(collection);
    if (!item.id) item.id = Utils.generateId(collection.substring(0, 3));
    item.createdAt = item.createdAt || Utils.now();
    item.updatedAt = Utils.now();
    items.push(item);
    this._setAll(collection, items);
    return item;
  },

  update(collection, id, updates) {
    const items = this._getAll(collection);
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...updates, updatedAt: Utils.now() };
    this._setAll(collection, items);
    return items[idx];
  },

  delete(collection, id) {
    const items = this._getAll(collection).filter(item => item.id !== id);
    this._setAll(collection, items);
  },

  // Query with filters
  query(collection, filterFn) {
    return this._getAll(collection).filter(filterFn);
  },

  // Count
  count(collection, filterFn) {
    if (!filterFn) return this._getAll(collection).length;
    return this._getAll(collection).filter(filterFn).length;
  },

  // Clear all data
  clearAll() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this._prefix));
    keys.forEach(k => localStorage.removeItem(k));
  },

  // Check if seeded
  isSeeded() {
    return localStorage.getItem(this._prefix + 'seeded') === 'true';
  },

  markSeeded() {
    localStorage.setItem(this._prefix + 'seeded', 'true');
  },

  // Session management
  setSession(user) {
    sessionStorage.setItem(this._prefix + 'session', JSON.stringify(user));
  },

  getSession() {
    const raw = sessionStorage.getItem(this._prefix + 'session');
    return raw ? JSON.parse(raw) : null;
  },

  clearSession() {
    sessionStorage.removeItem(this._prefix + 'session');
  },

  // Audit trail — append-only, stored separately
  addAudit(entry) {
    const audits = this._getAll('audit');
    entry.id = Utils.generateId('aud');
    entry.timestamp = Utils.now();
    audits.push(entry);
    this._setAll('audit', audits);
    return entry;
  },

  getAudits(entityId) {
    if (!entityId) return this._getAll('audit');
    return this._getAll('audit').filter(a => a.entityId === entityId);
  },

  // Add notification
  addNotification(notif) {
    const notifs = this._getAll('notifications');
    notif.id = Utils.generateId('ntf');
    notif.createdAt = Utils.now();
    notif.read = false;
    notif.status = notif.status || 'delivered';
    notifs.push(notif);
    this._setAll('notifications', notifs);
    return notif;
  },

  getNotificationsForUser(userId, role, region, institutionId) {
    return this._getAll('notifications').filter(n => {
      if (n.recipientId === userId) return true;
      if (n.recipientRole === role) return true;
      if (n.recipientRegion === region && ['regional_officer', 'bureau_officer'].includes(role)) return true;
      if (n.recipientInstitution === institutionId && role === 'institution') return true;
      return false;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  markNotificationRead(id) {
    this.update('notifications', id, { read: true });
  }
};
