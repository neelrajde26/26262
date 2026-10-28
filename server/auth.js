/* ============================================
   AICTE FlowGuard — Authentication & RBAC Engine
   ============================================ */

const crypto = require('node:crypto');
const { db, verifyPassword } = require('./db.js');

// Enforce strong secret in production; use dev-only fallback with warning in non-production
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable must be set in production mode!');
  } else {
    JWT_SECRET = 'flowguard-dev-only-hmac-secret-key-minimum-32-chars-long';
  }
}

// Role definitions with fine-grained permissions and organizational scopes
const ROLES = {
  institution: {
    label: 'Institution User',
    permissions: [
      'view_own_applications',
      'submit_application',
      'view_own_undertakings',
      'submit_evidence',
      'view_own_documents',
      'upload_document',
      'renew_document',
      'view_own_notifications'
    ],
    scope: 'institution'
  },
  regional_officer: {
    label: 'Regional Officer',
    permissions: [
      'view_region_applications',
      'review_application',
      'advance_stage',
      'return_application',
      'view_evc',
      'manage_evc',
      'review_undertaking',
      'assign_undertaking',
      'review_document',
      'verify_document',
      'view_region_notifications',
      'view_region_reports',
      'view_audit'
    ],
    scope: 'region'
  },
  bureau_officer: {
    label: 'Bureau Officer',
    permissions: [
      'view_region_applications',
      'view_all_applications',
      'review_application',
      'advance_stage',
      'return_application',
      'manage_evc',
      'view_evc',
      'review_undertaking',
      'assign_undertaking',
      'review_document',
      'verify_document',
      'view_all_notifications',
      'view_all_reports',
      'view_audit'
    ],
    scope: 'bureau'
  },
  committee: {
    label: 'Committee / EVC Expert',
    permissions: [
      'view_assigned_applications',
      'view_evc',
      'manage_evc',
      'submit_evc_report',
      'view_assigned_notifications'
    ],
    scope: 'assigned'
  },
  competent_authority: {
    label: 'Competent Authority',
    permissions: [
      'view_all_applications',
      'approve_application',
      'reject_application',
      'view_evc',
      'view_all_reports',
      'view_all_notifications',
      'view_audit',
      'view_escalations'
    ],
    scope: 'all'
  },
  admin: {
    label: 'System Administrator',
    permissions: [
      'manage_users',
      'manage_workflows',
      'manage_regions',
      'manage_escalation_rules',
      'manage_system',
      'view_all_applications',
      'view_all_reports',
      'view_audit',
      'view_all_notifications',
      'reset_data'
    ],
    scope: 'all'
  }
};

// Sign a session token
function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + (24 * 60 * 60) })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Verify a session token with timing-safe comparison
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  try {
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

// Authenticate user via username and password
function authenticateUser(username, password) {
  if (!username || !password) {
    return { success: false, error: 'Username and password are required' };
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user) return { success: false, error: 'Invalid credentials or account disabled' };

  const valid = verifyPassword(password, user.password_hash, user.salt);
  if (!valid) return { success: false, error: 'Invalid credentials' };

  const sessionUser = {
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    region: user.region,
    institutionId: user.institution_id,
    bureau: user.bureau,
    committeeType: user.committee_type,
    email: user.email
  };

  const token = createToken(sessionUser);

  // Log audit entry
  db.prepare(`
    INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'aud-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
    user.id,
    user.full_name,
    'user_login',
    'user',
    user.id,
    `${user.full_name} signed in as ${ROLES[user.role]?.label || user.role}`,
    null,
    null,
    '127.0.0.1',
    new Date().toISOString()
  );

  return { success: true, user: sessionUser, token };
}

// Middleware: extract token from Authorization header or Cookie
function getSessionFromRequest(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['cookie']) {
    const match = req.headers['cookie'].match(/flowguard_token=([^;]+)/);
    if (match) token = match[1];
  }
  return verifyToken(token);
}

// Check permission
function hasPermission(role, permission) {
  const def = ROLES[role];
  if (!def) return false;
  return def.permissions.includes(permission);
}

// Table-aware SQL scope clause builder
function getScopeClause(user, tableName = 'applications', tableAlias = '') {
  // Support calling signature getScopeClause(user, tableAlias) if tableName is not a recognized table
  let targetTable = 'applications';
  let alias = '';
  const recognizedTables = ['applications', 'evc_events', 'undertakings', 'documents', 'notifications', 'audit_trail', 'institutions'];

  if (recognizedTables.includes(tableName)) {
    targetTable = tableName;
    alias = tableAlias;
  } else if (typeof tableName === 'string' && tableName.length > 0) {
    alias = tableName;
  }

  const prefix = alias ? `${alias}.` : '';
  const roleDef = ROLES[user?.role];
  if (!roleDef) return { sql: '0 = 1', params: [] };

  if (roleDef.scope === 'all') {
    return { sql: '1 = 1', params: [] };
  }

  if (targetTable === 'applications') {
    switch (roleDef.scope) {
      case 'institution':
        return { sql: `${prefix}institution_id = ?`, params: [user.institutionId || ''] };
      case 'region':
        return { sql: `${prefix}region = ?`, params: [user.region || ''] };
      case 'bureau':
        return { sql: `(${prefix}region = ? OR ${prefix}assigned_officer = ?)`, params: [user.region || '', user.userId || ''] };
      case 'assigned':
        return { sql: `(${prefix}assigned_officer = ? OR ${prefix}id IN (SELECT application_id FROM evc_events WHERE committee_id = ?))`, params: [user.userId || '', user.userId || ''] };
      default:
        return { sql: '0 = 1', params: [] };
    }
  }

  if (targetTable === 'evc_events') {
    switch (roleDef.scope) {
      case 'institution':
        return { sql: `${prefix}institution_id = ?`, params: [user.institutionId || ''] };
      case 'region':
        return { sql: `${prefix}region = ?`, params: [user.region || ''] };
      case 'bureau':
        return { sql: `(${prefix}region = ? OR ${prefix}committee_id = ?)`, params: [user.region || '', user.userId || ''] };
      case 'assigned':
        return { sql: `${prefix}committee_id = ?`, params: [user.userId || ''] };
      default:
        return { sql: '0 = 1', params: [] };
    }
  }

  if (targetTable === 'undertakings') {
    switch (roleDef.scope) {
      case 'institution':
        return { sql: `${prefix}institution_id = ?`, params: [user.institutionId || ''] };
      case 'region':
        return { sql: `${prefix}region = ?`, params: [user.region || ''] };
      case 'bureau':
        return { sql: `(${prefix}region = ? OR ${prefix}verification_owner = ?)`, params: [user.region || '', user.userId || ''] };
      case 'assigned':
        return { sql: `${prefix}institution_id IN (SELECT institution_id FROM evc_events WHERE committee_id = ?)`, params: [user.userId || ''] };
      default:
        return { sql: '0 = 1', params: [] };
    }
  }

  if (targetTable === 'documents') {
    switch (roleDef.scope) {
      case 'institution':
        return { sql: `${prefix}institution_id = ?`, params: [user.institutionId || ''] };
      case 'region':
        return { sql: `${prefix}region = ?`, params: [user.region || ''] };
      case 'bureau':
        return { sql: `${prefix}region = ?`, params: [user.region || ''] };
      case 'assigned':
        return { sql: `${prefix}institution_id IN (SELECT institution_id FROM evc_events WHERE committee_id = ?)`, params: [user.userId || ''] };
      default:
        return { sql: '0 = 1', params: [] };
    }
  }

  if (targetTable === 'notifications') {
    switch (roleDef.scope) {
      case 'institution':
        return { sql: `(${prefix}recipient_id = ? OR (${prefix}recipient_institution = ? AND ${prefix}recipient_role = 'institution'))`, params: [user.userId || '', user.institutionId || ''] };
      case 'region':
        return { sql: `(${prefix}recipient_id = ? OR ${prefix}recipient_role = ? OR (${prefix}recipient_region = ? AND ? IN ('regional_officer', 'bureau_officer')))`, params: [user.userId || '', user.role, user.region || '', user.role] };
      case 'bureau':
        return { sql: `(${prefix}recipient_id = ? OR ${prefix}recipient_role = ? OR ${prefix}recipient_region = ?)`, params: [user.userId || '', user.role, user.region || ''] };
      case 'assigned':
        return { sql: `(${prefix}recipient_id = ? OR ${prefix}recipient_role = ?)`, params: [user.userId || '', user.role] };
      default:
        return { sql: '0 = 1', params: [] };
    }
  }

  if (targetTable === 'audit_trail') {
    switch (roleDef.scope) {
      case 'institution':
        return {
          sql: `(${prefix}actor_id = ? OR ${prefix}entity_id IN (SELECT id FROM applications WHERE institution_id = ?) OR ${prefix}entity_id = ?)`,
          params: [user.userId || '', user.institutionId || '', user.institutionId || '']
        };
      case 'region':
        return {
          sql: `(${prefix}actor_id = ? OR ${prefix}entity_id IN (SELECT id FROM applications WHERE region = ?) OR ${prefix}entity_id IN (SELECT id FROM institutions WHERE region = ?))`,
          params: [user.userId || '', user.region || '', user.region || '']
        };
      case 'bureau':
        return { sql: '1 = 1', params: [] };
      default:
        return { sql: '0 = 1', params: [] };
    }
  }

  return { sql: '1 = 1', params: [] };
}

// Verify if a user is authorized to access a given record
function canAccessRecord(user, tableName, record) {
  if (!user || !record) return false;
  const roleDef = ROLES[user.role];
  if (!roleDef) return false;
  if (roleDef.scope === 'all') return true;

  if (user.role === 'institution') {
    return record.institution_id === user.institutionId;
  }
  if (user.role === 'regional_officer') {
    return record.region === user.region;
  }
  if (user.role === 'bureau_officer') {
    if (record.region && record.region === user.region) return true;
    if (record.assigned_officer && record.assigned_officer === user.userId) return true;
    return true; // Bureau officers have oversight across their assigned jurisdiction
  }
  if (user.role === 'committee') {
    if (tableName === 'evc_events') {
      return record.committee_id === user.userId;
    }
    if (tableName === 'applications') {
      return record.assigned_officer === user.userId || record.id === user.assignedAppId;
    }
    return false;
  }
  return false;
}

module.exports = {
  ROLES,
  createToken,
  verifyToken,
  authenticateUser,
  getSessionFromRequest,
  hasPermission,
  getScopeClause,
  canAccessRecord
};
