/* ============================================
   AICTE FlowGuard — Document Validity Page
   ============================================ */

const DocumentsPage = {
  currentFilter: 'all',
  currentType: '',
  searchQuery: '',

  async render() {
    const container = document.getElementById('page-container');
    const session = Auth.getSession();
    const isInstitution = session?.role === 'institution';
    const canReview = Auth.hasPermission('review_document');

    container.innerHTML = Components.renderLoadingState('Loading statutory documents...');

    try {
      await Store.fetchDocuments();
    } catch (err) {
      console.error('Failed to load documents:', err);
    }

    let docs = Store.getAll('documents');
    docs = Auth.filterByScope(docs, 'document');

    const total = docs.length;
    const valid = docs.filter(d => d.status === 'valid').length;
    const expiringSoon = docs.filter(d => d.status === 'expiring-soon').length;
    const expired = docs.filter(d => d.status === 'expired').length;
    const renewalPending = docs.filter(d => d.status === 'renewal-pending').length;

    // Filter
    const filtered = docs.filter(d => {
      if (this.currentFilter !== 'all' && d.status !== this.currentFilter) return false;
      if (this.currentType && d.type !== this.currentType) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return (d.type && d.type.toLowerCase().includes(q)) ||
               (d.description && d.description.toLowerCase().includes(q)) ||
               (d.institutionName && d.institutionName.toLowerCase().includes(q)) ||
               (d.fileName && d.fileName.toLowerCase().includes(q));
      }
      return true;
    });

    const docTypes = [...new Set(docs.map(d => d.type))];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: var(--space-5); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h2 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">Institutional Statutory Document Validity</h2>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            Track lease agreements, land ownership titles, building completion certificates, and fire safety NOC lifecycles.
          </p>
        </div>
        <button class="btn btn-primary" onclick="DocumentsPage.showUploadModal()">
          <span class="material-icons-round">upload_file</span> Upload Document
        </button>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-primary-50); color: var(--color-primary-600);">
            <span class="material-icons-round">folder</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Documents</span>
            <span class="stat-value">${total}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-success-50); color: var(--color-success-700);">
            <span class="material-icons-round">verified</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Valid & Active</span>
            <span class="stat-value">${valid}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-warning-50); color: var(--color-warning-700);">
            <span class="material-icons-round">warning</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Expiring Soon (60d)</span>
            <span class="stat-value" style="color: var(--color-warning-700);">${expiringSoon}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-danger-50); color: var(--color-danger-700);">
            <span class="material-icons-round">error</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Expired</span>
            <span class="stat-value" style="color: var(--color-danger-500);">${expired}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--color-info-50); color: var(--color-info-700);">
            <span class="material-icons-round">autorenew</span>
          </div>
          <div class="stat-info">
            <span class="stat-label">Renewal Pending</span>
            <span class="stat-value">${renewalPending}</span>
          </div>
        </div>
      </div>

      <!-- Filter Controls -->
      <div class="card" style="margin-bottom: var(--space-5);">
        <div class="card-body" style="padding: var(--space-4);">
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center;">
            <div class="search-box" style="max-width: 340px; flex: 1;">
              <span class="material-icons-round search-icon">search</span>
              <input type="search" id="docs-search" class="search-input" placeholder="Search title, filename, institution..." value="${Utils.escapeHtml(this.searchQuery)}">
            </div>
            <select id="docs-status-filter" class="form-input" style="width: auto;">
              <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="valid" ${this.currentFilter === 'valid' ? 'selected' : ''}>Valid</option>
              <option value="expiring-soon" ${this.currentFilter === 'expiring-soon' ? 'selected' : ''}>Expiring Soon</option>
              <option value="expired" ${this.currentFilter === 'expired' ? 'selected' : ''}>Expired</option>
              <option value="renewal-pending" ${this.currentFilter === 'renewal-pending' ? 'selected' : ''}>Renewal Pending</option>
            </select>
            <select id="docs-type-filter" class="form-input" style="width: auto;">
              <option value="">All Document Types</option>
              ${docTypes.map(t => `<option value="${t}" ${this.currentType === t ? 'selected' : ''}>${Utils.escapeHtml(t)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Documents Table -->
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <span class="material-icons-round">folder_off</span>
          <h3>No Documents Found</h3>
          <p>No statutory documents match the specified filters.</p>
        </div>
      ` : `
        <div class="card">
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>Institution</th>
                  <th>File Name</th>
                  <th>Issue Date</th>
                  <th>Expiry Date</th>
                  <th>Validity Status</th>
                  <th>Verification</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(doc => {
                  const days = doc.expiryDate ? Utils.daysUntil(doc.expiryDate) : null;
                  let expiryBadge = '';
                  if (!doc.expiryDate) {
                    expiryBadge = `<span class="doc-expiry valid"><span class="material-icons-round" style="font-size:12px">all_inclusive</span> Permanent</span>`;
                  } else if (days < 0) {
                    expiryBadge = `<span class="doc-expiry expired"><span class="material-icons-round" style="font-size:12px">error</span> Expired ${Math.abs(days)}d ago</span>`;
                  } else if (days <= 60) {
                    expiryBadge = `<span class="doc-expiry expiring-soon"><span class="material-icons-round" style="font-size:12px">warning</span> Expires in ${days}d</span>`;
                  } else {
                    expiryBadge = `<span class="doc-expiry valid"><span class="material-icons-round" style="font-size:12px">check_circle</span> Valid (${days}d left)</span>`;
                  }

                  const filePath = doc.storedPath || doc.stored_path;

                  return `
                    <tr>
                      <td>
                        <div style="font-weight: var(--font-weight-medium);">${Utils.escapeHtml(doc.type)}</div>
                        <div style="font-size: var(--font-size-xs); color: var(--text-tertiary);">${Utils.escapeHtml(doc.description || '')}</div>
                      </td>
                      <td>
                        <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);">${Utils.escapeHtml(doc.institutionName)}</div>
                      </td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: var(--font-size-xs);">
                          <span class="material-icons-round" style="font-size: 16px; color: var(--color-primary-500);">picture_as_pdf</span>
                          <span>${Utils.escapeHtml(doc.fileName)}</span>
                          ${filePath ? `
                            <a href="${API.getFileUrl(filePath)}" target="_blank" class="btn btn-ghost btn-xs" title="Download Document File">
                              <span class="material-icons-round">download</span>
                            </a>
                          ` : ''}
                        </div>
                      </td>
                      <td style="font-size: var(--font-size-sm);">${Utils.formatDate(doc.issueDate)}</td>
                      <td style="font-size: var(--font-size-sm);">
                        <div>${doc.expiryDate ? Utils.formatDate(doc.expiryDate) : 'Perpetual / N/A'}</div>
                        <div style="margin-top: 2px;">${expiryBadge}</div>
                      </td>
                      <td>${Utils.statusBadge(doc.status)}</td>
                      <td>${Utils.statusBadge(doc.verificationStatus)}</td>
                      <td style="text-align: right;">
                        <div style="display: flex; gap: var(--space-1); justify-content: flex-end;">
                          ${(isInstitution || canReview) && (doc.status === 'expired' || doc.status === 'expiring-soon') ? `
                            <button class="btn btn-warning btn-sm" title="Upload Renewal" onclick="DocumentsPage.showRenewModal('${doc.id}')">
                              <span class="material-icons-round">autorenew</span> Renew
                            </button>
                          ` : ''}
                          ${canReview && doc.verificationStatus !== 'verified' ? `
                            <button class="btn btn-success btn-sm" title="Verify Document" onclick="DocumentsPage.verifyDocument('${doc.id}')">
                              <span class="material-icons-round">check_circle</span> Verify
                            </button>
                          ` : ''}
                          <button class="btn btn-ghost btn-sm" title="View Details" onclick="DocumentsPage.showDetailsModal('${doc.id}')">
                            <span class="material-icons-round">visibility</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    // Event listeners
    const searchEl = document.getElementById('docs-search');
    if (searchEl) {
      searchEl.addEventListener('input', Utils.debounce((e) => {
        this.searchQuery = e.target.value.trim();
        this.render();
      }, 300));
    }

    const statusFilter = document.getElementById('docs-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.currentFilter = e.target.value;
        this.render();
      });
    }

    const typeFilter = document.getElementById('docs-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        this.currentType = e.target.value;
        this.render();
      });
    }
  },

  showUploadModal() {
    const session = Auth.getSession();
    const institutions = Store.getAll('institutions');

    const bodyHtml = `
      <form id="upload-doc-form" onsubmit="event.preventDefault(); DocumentsPage.handleUploadSubmit();">
        ${session?.role !== 'institution' ? `
          <div class="form-group">
            <label class="form-label">Institution *</label>
            <select id="modal-doc-inst" class="form-input" required>
              ${institutions.map(inst => `<option value="${inst.id}">${Utils.escapeHtml(inst.name)}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label">Document Type *</label>
          <select id="modal-doc-type" class="form-input" required>
            <option value="Lease Agreement">Lease Agreement</option>
            <option value="Land Ownership Certificate">Land Ownership Certificate</option>
            <option value="Fire Safety Certificate">Fire Safety Certificate (NOC)</option>
            <option value="Building Completion Certificate">Building Completion Certificate</option>
            <option value="Structural Stability Certificate">Structural Stability Certificate</option>
            <option value="University Affiliation Order">University Affiliation Order</option>
            <option value="Occupancy Certificate">Occupancy Certificate</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Description / Authority Details *</label>
          <input type="text" id="modal-doc-desc" class="form-input" required placeholder="e.g. Registered lease deed with Municipal Corporation for 30 years">
        </div>
        <div class="form-group">
          <label class="form-label">Issue Date *</label>
          <input type="date" id="modal-doc-issue" class="form-input" required value="${Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Expiry Date (Leave blank if Perpetual)</label>
          <input type="date" id="modal-doc-expiry" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Upload File (.pdf, .png, .jpg, .docx)</label>
          <input type="file" id="modal-doc-file-input" class="form-input" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.doc,.docx">
        </div>
        <div class="form-group">
          <label class="form-label">Document Display Name / Title *</label>
          <input type="text" id="modal-doc-filename" class="form-input" required value="doc_${Date.now().toString(36)}.pdf">
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-upload-doc" onclick="DocumentsPage.handleUploadSubmit()">
        <span class="material-icons-round">cloud_upload</span> Upload Document
      </button>
    `;

    Components.showModal('Upload Statutory Document', bodyHtml, footerHtml);
  },

  async handleUploadSubmit() {
    const session = Auth.getSession();
    const typeSelect = document.getElementById('modal-doc-type');
    const descInput = document.getElementById('modal-doc-desc');
    const issueInput = document.getElementById('modal-doc-issue');
    const expiryInput = document.getElementById('modal-doc-expiry');
    const nameInput = document.getElementById('modal-doc-filename');
    const fileInput = document.getElementById('modal-doc-file-input');
    const btn = document.getElementById('btn-upload-doc');

    let instId = session.institutionId;
    if (session.role !== 'institution') {
      const instSelect = document.getElementById('modal-doc-inst');
      instId = instSelect ? instSelect.value : null;
    }

    if (!descInput || !descInput.value.trim() || !issueInput || !issueInput.value || !nameInput || !nameInput.value.trim()) {
      Components.showToast('Please fill out all required fields.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Uploading...`;
    }

    const file = fileInput?.files?.[0];

    try {
      await Store.createDocument({
        institutionId: instId,
        type: typeSelect.value,
        description: descInput.value.trim(),
        issueDate: issueInput.value,
        expiryDate: expiryInput.value || null,
        fileName: nameInput.value.trim()
      }, file);

      Components.closeModal();
      Components.showToast('Statutory document uploaded successfully!', 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to upload document', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons-round">cloud_upload</span> Upload Document`;
      }
    }
  },

  showRenewModal(docId) {
    const doc = Store.getById('documents', docId);
    if (!doc) return;

    const bodyHtml = `
      <form id="renew-doc-form" onsubmit="event.preventDefault(); DocumentsPage.handleRenewSubmit('${docId}');">
        <div class="form-group">
          <label class="form-label">Document</label>
          <div style="font-weight: var(--font-weight-medium);">${Utils.escapeHtml(doc.type)} — ${Utils.escapeHtml(doc.institutionName)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">New Issue Date *</label>
          <input type="date" id="modal-renew-issue" class="form-input" required value="${Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">New Expiry Date *</label>
          <input type="date" id="modal-renew-expiry" class="form-input" required value="${Utils.dateOffset(365)}" min="${Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Upload Renewed File (.pdf, .png, .jpg, .docx)</label>
          <input type="file" id="modal-renew-file-input" class="form-input" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.doc,.docx">
        </div>
        <div class="form-group">
          <label class="form-label">Renewed Document Label / Title *</label>
          <input type="text" id="modal-renew-file" class="form-input" required value="renewed_${doc.fileName}">
        </div>
      </form>
    `;

    const footerHtml = `
      <button class="btn btn-ghost" onclick="Components.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-submit-renewal" onclick="DocumentsPage.handleRenewSubmit('${docId}')">
        <span class="material-icons-round">autorenew</span> Submit Renewal
      </button>
    `;

    Components.showModal('Submit Document Renewal', bodyHtml, footerHtml);
  },

  async handleRenewSubmit(docId) {
    const issueInput = document.getElementById('modal-renew-issue');
    const expiryInput = document.getElementById('modal-renew-expiry');
    const fileLabelInput = document.getElementById('modal-renew-file');
    const fileInput = document.getElementById('modal-renew-file-input');
    const btn = document.getElementById('btn-submit-renewal');

    if (!issueInput || !issueInput.value || !expiryInput || !expiryInput.value || !fileLabelInput || !fileLabelInput.value.trim()) {
      Components.showToast('Please fill all renewal details.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Submitting...`;
    }

    const file = fileInput?.files?.[0];

    try {
      await Store.renewDocument(docId, issueInput.value, expiryInput.value, file || fileLabelInput.value.trim());
      Components.closeModal();
      Components.showToast('Document renewal submitted for verification!', 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to submit renewal', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons-round">autorenew</span> Submit Renewal`;
      }
    }
  },

  async verifyDocument(docId) {
    try {
      await Store.verifyDocument(docId);
      Components.showToast('Document verified and confirmed valid!', 'success');
      await this.render();
    } catch (err) {
      Components.showToast(err.message || 'Failed to verify document', 'error');
    }
  },

  showDetailsModal(docId) {
    const doc = Store.getById('documents', docId);
    if (!doc) return;

    const filePath = doc.storedPath || doc.stored_path;

    const bodyHtml = `
      <div class="detail-grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4);">
        <div>
          <span class="detail-label">Document Type</span>
          <span class="detail-value">${Utils.escapeHtml(doc.type)}</span>
        </div>
        <div>
          <span class="detail-label">Institution</span>
          <span class="detail-value">${Utils.escapeHtml(doc.institutionName)}</span>
        </div>
        <div>
          <span class="detail-label">Issue Date</span>
          <span class="detail-value">${Utils.formatDate(doc.issueDate)}</span>
        </div>
        <div>
          <span class="detail-label">Expiry Date</span>
          <span class="detail-value">${doc.expiryDate ? Utils.formatDate(doc.expiryDate) : 'Perpetual'}</span>
        </div>
        <div>
          <span class="detail-label">Status</span>
          <span class="detail-value">${Utils.statusBadge(doc.status)}</span>
        </div>
        <div>
          <span class="detail-label">Verification</span>
          <span class="detail-value">${Utils.statusBadge(doc.verificationStatus)}</span>
        </div>
        <div style="grid-column: 1 / -1;">
          <span class="detail-label">Description / Scope</span>
          <span class="detail-value">${Utils.escapeHtml(doc.description || '—')}</span>
        </div>
        <div style="grid-column: 1 / -1;">
          <span class="detail-label">File Attached</span>
          <span class="detail-value" style="font-family: var(--font-mono); display: flex; align-items: center; justify-content: space-between;">
            <span style="display: flex; align-items: center; gap: 6px;">
              <span class="material-icons-round">description</span> ${Utils.escapeHtml(doc.fileName)}
            </span>
            ${filePath ? `
              <a href="${API.getFileUrl(filePath)}" target="_blank" class="btn btn-ghost btn-xs">
                <span class="material-icons-round">download</span> Download File
              </a>
            ` : ''}
          </span>
        </div>
      </div>
    `;

    const footerHtml = `<button class="btn btn-primary" onclick="Components.closeModal()">Close</button>`;
    Components.showModal('Document Details', bodyHtml, footerHtml);
  }
};
