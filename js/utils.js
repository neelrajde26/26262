/* ============================================
   AICTE FlowGuard — Utility Functions
   ============================================ */

const Utils = {
  // Generate a unique ID
  generateId(prefix = '') {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return prefix ? `${prefix}-${ts}-${rand}` : `${ts}-${rand}`;
  },

  // Format date to readable string
  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  // Calculate days between two dates
  daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = d2 - d1;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  },

  // Days since a date
  daysAgo(dateStr) {
    return this.daysBetween(dateStr, new Date());
  },

  // Days until a date
  daysUntil(dateStr) {
    return this.daysBetween(new Date(), dateStr);
  },

  // Get age display text
  getAgeDisplay(days) {
    if (days < 0) return `${Math.abs(days)} days from now`;
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  },

  // Time ago display
  timeAgo(dateStr) {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return Utils.formatDate(dateStr);
  },

  // Escape HTML to prevent XSS
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Truncate text
  truncate(str, maxLen = 50) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
  },

  // Status badge HTML
  statusBadge(status, statusMap = null) {
    const map = statusMap || {
      'draft': { class: 'badge-neutral', icon: 'edit', label: 'Draft' },
      'submitted': { class: 'badge-primary', icon: 'send', label: 'Submitted' },
      'scrutiny': { class: 'badge-info', icon: 'search', label: 'Under Scrutiny' },
      're-scrutiny': { class: 'badge-warning', icon: 'replay', label: 'Re-Scrutiny' },
      'returned': { class: 'badge-warning', icon: 'undo', label: 'Returned' },
      'evc-pending': { class: 'badge-info', icon: 'schedule', label: 'EVC Pending' },
      'evc-scheduled': { class: 'badge-primary', icon: 'event', label: 'EVC Scheduled' },
      'evc-completed': { class: 'badge-success', icon: 'check_circle', label: 'EVC Completed' },
      'sac-review': { class: 'badge-info', icon: 'groups', label: 'SAC Review' },
      'shc-review': { class: 'badge-info', icon: 'groups', label: 'SHC Review' },
      'approved': { class: 'badge-success', icon: 'verified', label: 'Approved' },
      'rejected': { class: 'badge-danger', icon: 'cancel', label: 'Rejected' },
      'cancelled': { class: 'badge-neutral', icon: 'block', label: 'Cancelled' },
      'completed': { class: 'badge-success', icon: 'done_all', label: 'Completed' },
      'pending': { class: 'badge-warning', icon: 'hourglass_empty', label: 'Pending' },
      'under-review': { class: 'badge-info', icon: 'visibility', label: 'Under Review' },
      'accepted': { class: 'badge-success', icon: 'check', label: 'Accepted' },
      'verified': { class: 'badge-success', icon: 'verified', label: 'Verified' },
      'valid': { class: 'badge-success', icon: 'check_circle', label: 'Valid' },
      'expiring-soon': { class: 'badge-warning', icon: 'warning', label: 'Expiring Soon' },
      'expired': { class: 'badge-danger', icon: 'error', label: 'Expired' },
      'renewal-pending': { class: 'badge-info', icon: 'autorenew', label: 'Renewal Pending' },
      'overdue': { class: 'badge-danger', icon: 'alarm', label: 'Overdue' },
      'escalated': { class: 'badge-danger', icon: 'priority_high', label: 'Escalated' },
      'delivered': { class: 'badge-success', icon: 'done', label: 'Delivered' },
      'failed': { class: 'badge-danger', icon: 'error_outline', label: 'Failed' },
      'active': { class: 'badge-success', icon: 'radio_button_checked', label: 'Active' },
      'inactive': { class: 'badge-neutral', icon: 'radio_button_unchecked', label: 'Inactive' },
      'paused': { class: 'badge-warning', icon: 'pause_circle', label: 'Paused' },
    };
    const info = map[status] || { class: 'badge-neutral', icon: 'help', label: status || 'Unknown' };
    return `<span class="badge ${info.class}"><span class="material-icons-round">${info.icon}</span> ${Utils.escapeHtml(info.label)}</span>`;
  },

  // Pagination helper
  paginate(array, page, pageSize = 10) {
    const totalItems = array.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const currentPage = Math.min(Math.max(1, page), totalPages || 1);
    const start = (currentPage - 1) * pageSize;
    const items = array.slice(start, start + pageSize);
    return { items, currentPage, totalPages, totalItems, start, pageSize };
  },

  // Build pagination HTML
  paginationHtml(pagination, onPageClick) {
    if (pagination.totalPages <= 1) return '';
    const { currentPage, totalPages, totalItems, start, pageSize } = pagination;
    const end = Math.min(start + pageSize, totalItems);
    let btns = '';
    btns += `<button class="page-btn" onclick="${onPageClick}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}><span class="material-icons-round" style="font-size:16px">chevron_left</span></button>`;
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
    for (let i = startPage; i <= endPage; i++) {
      btns += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageClick}(${i})">${i}</button>`;
    }
    btns += `<button class="page-btn" onclick="${onPageClick}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}><span class="material-icons-round" style="font-size:16px">chevron_right</span></button>`;
    return `<div class="pagination">
      <span class="pagination-info">Showing ${start + 1}–${end} of ${totalItems}</span>
      <div class="pagination-controls">${btns}</div>
    </div>`;
  },

  // Simple hash for demo password verification (NOT cryptographically secure — demo only)
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(36);
  },

  // Debounce
  debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // Deep clone
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Date offset (add days to current date)
  dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  },

  // ISO date string for today
  today() {
    return new Date().toISOString().split('T')[0];
  },

  // ISO datetime now
  now() {
    return new Date().toISOString();
  }
};
