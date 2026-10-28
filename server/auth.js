/* ============================================
   AICTE FlowGuard — Authentication & RBAC Engine
   ============================================ */

const crypto = require('node:crypto');
const { db, verifyPassword } = require('./db.js');

const JWT_SECRET = process.env.JWT_SECRET || 'flowguard-sih2026-super-secure-hmac-secret-key-32bytes';

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

// Verify a session token
function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (expectedSig !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

// Authenticate user via username and password
function authenticateUser(username, password) {
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

  // Log audit
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

// Check scope filter for SQL queries
function getScopeClause(user, tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const roleDef = ROLES[user.role];
  if (!roleDef) return { sql: '0 = 1', params: [] };

  switch (roleDef.scope) {
    case 'all':
      return { sql: '1 = 1', params: [] };
    case 'institution':
      return { sql: `${prefix}institution_id = ?`, params: [user.institutionId] };
    case 'region':
      return { sql: `${prefix}region = ?`, params: [user.region] };
    case 'bureau':
      return { sql: `(${prefix}region = ? OR ${prefix}assigned_officer = ?)`, params: [user.region, user.userId] };
    case 'assigned':
      return { sql: `(${prefix}assigned_officer = ? OR ${prefix}id IN (SELECT application_id FROM evc_events WHERE committee_id = ?))`, params: [user.userId, user.userId] };
    default:
      return { sql: '0 = 1', params: [] };
  }
}

module.exports = {
  ROLES,
  createToken,
  verifyToken,
  authenticateUser,
  getSessionFromRequest,
  hasPermission,
  getScopeClause
};
