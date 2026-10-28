/* ============================================
   AICTE FlowGuard — Full-Stack Server & REST API
   Native Node.js (No external dependencies)
   ============================================ */

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const url = require('node:url');
const crypto = require('node:crypto');

const { db, seedDatabase, hashPassword } = require('./server/db.js');
const {
  ROLES,
  createToken,
  authenticateUser,
  getSessionFromRequest,
  hasPermission,
  getScopeClause,
  canAccessRecord
} = require('./server/auth.js');
const WorkflowEngine = require('./server/workflow-engine.js');
const Scheduler = require('./server/scheduler.js');
const AIService = require('./server/ai-service.js');

const PORT = process.env.PORT || 5500;
const PUBLIC_DIR = path.resolve(__dirname);
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const DATA_DIR = path.resolve(__dirname, 'data');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME types for static assets and downloads
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const ALLOWED_UPLOAD_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.doc', '.docx'];
const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15MB limit
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

function getLoginAttemptKey(req, username) {
  const ip = getClientIp(req);
  const normalizedUser = (username || '').trim().toLowerCase();
  return `${ip}::${normalizedUser}`;
}

function getLoginRateLimitState(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) {
    return { limited: false, retryAfterMs: 0 };
  }
  if (entry.lockUntil && entry.lockUntil > now) {
    return { limited: true, retryAfterMs: entry.lockUntil - now };
  }
  if (entry.windowStart + LOGIN_WINDOW_MS <= now) {
    loginAttempts.delete(key);
    return { limited: false, retryAfterMs: 0 };
  }
  return { limited: false, retryAfterMs: 0 };
}

function registerFailedLoginAttempt(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.windowStart + LOGIN_WINDOW_MS <= now) {
    loginAttempts.set(key, {
      count: 1,
      windowStart: now,
      lockUntil: 0
    });
    return;
  }

  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockUntil = now + LOGIN_LOCK_MS;
  }
  loginAttempts.set(key, entry);
}

function clearFailedLoginAttempts(key) {
  loginAttempts.delete(key);
}

// JSON response helper
function sendJSON(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// RFC 7807 Problem Details Response Helper
function sendProblem(res, status, title, detail, instance = '', extra = {}) {
  const typeMap = {
    400: 'bad-request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not-found',
    409: 'conflict',
    413: 'payload-too-large',
    415: 'unsupported-media-type',
    422: 'unprocessable-entity',
    500: 'internal-server-error'
  };

  const problem = {
    type: `https://flowguard.aicte.gov.in/errors/${typeMap[status] || 'error'}`,
    title,
    status,
    detail,
    instance: instance || undefined,
    error: detail, // Backward compatibility for legacy clients
    timestamp: new Date().toISOString(),
    ...extra
  };

  sendJSON(res, status, problem);
}

// Parse request body with size limits and strict JSON verification
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    let totalLength = 0;
    let destroyed = false;

    req.on('data', chunk => {
      if (destroyed) return;
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        destroyed = true;
        const err = new Error('Payload Too Large: Body exceeds 15MB limit');
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      rawBody += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (destroyed) return;
      if (!rawBody || rawBody.trim() === '') {
        return resolve({});
      }
      try {
        const parsed = JSON.parse(rawBody);
        resolve(parsed);
      } catch (err) {
        const parseErr = new Error(`Malformed JSON request payload: ${err.message}`);
        parseErr.statusCode = 400;
        reject(parseErr);
      }
    });

    req.on('error', err => {
      if (!destroyed) reject(err);
    });
  });
}

// Safe multipart / raw upload extractor
function parseMultipartBuffer(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let startIndex = 0;

  while ((startIndex = buffer.indexOf(boundaryBuffer, startIndex)) !== -1) {
    startIndex += boundaryBuffer.length;
    if (buffer[startIndex] === 45 && buffer[startIndex + 1] === 45) { // '--' end
      break;
    }
    if (buffer[startIndex] === 13 && buffer[startIndex + 1] === 10) { // '\r\n'
      startIndex += 2;
    }

    const nextIndex = buffer.indexOf(boundaryBuffer, startIndex);
    if (nextIndex === -1) break;

    const partBuffer = buffer.slice(startIndex, nextIndex - 2); // strip trailing \r\n
    const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEndIndex !== -1) {
      const headerStr = partBuffer.slice(0, headerEndIndex).toString('utf8');
      const bodyBuffer = partBuffer.slice(headerEndIndex + 4);

      const nameMatch = headerStr.match(/name="([^"]+)"/);
      const filenameMatch = headerStr.match(/filename="([^"]+)"/);
      const contentTypeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

      parts.push({
        name: nameMatch ? nameMatch[1] : null,
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream',
        data: bodyBuffer
      });
    }
    startIndex = nextIndex;
  }
  return parts;
}

// Receive raw binary buffer
function parseRawBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;
    let destroyed = false;

    req.on('data', chunk => {
      if (destroyed) return;
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        destroyed = true;
        const err = new Error('Payload Too Large: File exceeds 15MB limit');
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (destroyed) return;
      resolve(Buffer.concat(chunks));
    });

    req.on('error', err => {
      if (!destroyed) reject(err);
    });
  });
}

// In-memory upload provenance cache for newly uploaded files pending attachment
const uploadedFilesRegistry = new Map();

// Verify if user is authorized to download a stored upload file
function canAccessUpload(session, storedFileName) {
  if (!session || !storedFileName) return false;
  if (['admin', 'competent_authority', 'bureau_officer'].includes(session.role)) return true;

  // Check newly uploaded registry
  const regEntry = uploadedFilesRegistry.get(storedFileName);
  if (regEntry) {
    if (session.userId === regEntry.userId) return true;
    if (session.role === 'institution' && session.institutionId === regEntry.institutionId) return true;
    if (session.role === 'regional_officer' && session.region === regEntry.region) return true;
    if (session.role === 'committee') return true;
  }

  // Check documents
  const doc = db.prepare('SELECT institution_id, region FROM documents WHERE stored_path = ?').get(storedFileName);
  if (doc) {
    if (session.role === 'institution') return doc.institution_id === session.institutionId;
    if (session.role === 'regional_officer') return doc.region === session.region;
    return true;
  }

  // Check undertaking submissions
  const sub = db.prepare(`
    SELECT u.institution_id, u.region
    FROM undertaking_submissions s
    JOIN undertakings u ON s.undertaking_id = u.id
    WHERE s.stored_path = ?
  `).get(storedFileName);
  if (sub) {
    if (session.role === 'institution') return sub.institution_id === session.institutionId;
    if (session.role === 'regional_officer') return sub.region === session.region;
    return true;
  }

  // Check applications attachments
  const app = db.prepare(`
    SELECT institution_id, region, attachments FROM applications WHERE attachments LIKE ?
  `).get(`%${storedFileName}%`);
  if (app) {
    if (session.role === 'institution') return app.institution_id === session.institutionId;
    if (session.role === 'regional_officer') return app.region === session.region;
    return true;
  }

  return false;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost:5500'));
  parsedUrl.query = Object.fromEntries(parsedUrl.searchParams.entries());
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // =============================================================
  // REST API ROUTING
  // =============================================================
  if (pathname.startsWith('/api/')) {
    try {
      const session = getSessionFromRequest(req);

      // 1. Health Check
      if (pathname === '/api/health' && method === 'GET') {
        let dbOk = false;
        try {
          db.prepare('SELECT 1').get();
          dbOk = true;
        } catch(e) {}

        return sendJSON(res, 200, {
          status: dbOk ? 'healthy' : 'degraded',
          platform: 'AICTE FlowGuard',
          version: '2.0.0',
          environment: process.env.NODE_ENV || 'development',
          database: dbOk ? 'node:sqlite (WAL Mode, Online)' : 'error',
          scheduler: 'active',
          timestamp: new Date().toISOString()
        });
      }

      // 2. Authentication: Login
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(req);
        if (
          typeof body.username !== 'string' ||
          typeof body.password !== 'string' ||
          !body.username.trim() ||
          !body.password
        ) {
          return sendProblem(res, 400, 'Bad Request', 'Username and password are required', pathname);
        }

        const loginKey = getLoginAttemptKey(req, body.username);
        const limitState = getLoginRateLimitState(loginKey);
        if (limitState.limited) {
          return sendProblem(
            res,
            429,
            'Too Many Requests',
            `Too many failed login attempts. Retry after ${Math.ceil(limitState.retryAfterMs / 1000)} seconds.`,
            pathname
          );
        }

        const result = authenticateUser(body.username.trim(), body.password, getClientIp(req));
        if (!result.success) {
          registerFailedLoginAttempt(loginKey);
          return sendProblem(res, 401, 'Unauthorized', result.error, pathname);
        }
        clearFailedLoginAttempts(loginKey);

        const isHttps = req.headers['x-forwarded-proto'] === 'https';
        const secureFlag = isHttps ? '; Secure' : '';
        const cookie = `flowguard_token=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secureFlag}`;

        return sendJSON(res, 200, {
          success: true,
          user: result.user,
          token: result.token
        }, { 'Set-Cookie': cookie });
      }

      // 2b. Authentication: Institutional Registration
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await parseBody(req);
        const { username, password, fullName, email, institutionName, region } = body;

        if (
          typeof username !== 'string' ||
          typeof password !== 'string' ||
          typeof fullName !== 'string' ||
          typeof email !== 'string' ||
          typeof institutionName !== 'string' ||
          typeof region !== 'string' ||
          !username.trim() ||
          !password ||
          !fullName.trim() ||
          !email.trim() ||
          !institutionName.trim() ||
          !region.trim()
        ) {
          return sendProblem(res, 400, 'Bad Request', 'All fields (username, password, fullName, email, institutionName, region) are required', pathname);
        }

        const trimmedUser = username.trim();
        if (trimmedUser.length < 3 || trimmedUser.length > 30 || !/^[a-zA-Z0-9_]+$/.test(trimmedUser)) {
          return sendProblem(res, 400, 'Bad Request', 'Username must be 3-30 alphanumeric characters or underscores', pathname);
        }

        if (password.length < 8) {
          return sendProblem(res, 400, 'Bad Request', 'Password must be at least 8 characters long', pathname);
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          return sendProblem(res, 400, 'Bad Request', 'Invalid email format', pathname);
        }

        const validRegions = ['reg-north', 'reg-south', 'reg-west', 'reg-east'];
        if (!validRegions.includes(region.trim())) {
          return sendProblem(res, 400, 'Bad Request', 'Invalid region. Must be reg-north, reg-south, reg-west, or reg-east', pathname);
        }

        const ip = getClientIp(req);
        const regRateKey = `reg::${ip}`;
        const limitState = getLoginRateLimitState(regRateKey);
        if (limitState.limited) {
          return sendProblem(res, 429, 'Too Many Requests', 'Too many registration attempts from this IP. Please try again later.', pathname);
        }

        const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(trimmedUser);
        if (existingUser) {
          registerFailedLoginAttempt(regRateKey);
          return sendProblem(res, 409, 'Conflict', 'Username is already taken', pathname);
        }

        const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
        if (existingEmail) {
          registerFailedLoginAttempt(regRateKey);
          return sendProblem(res, 409, 'Conflict', 'Email address is already registered', pathname);
        }

        // STRICT LEAST PRIVILEGE: Hardcoded role 'institution'. Never trust client-supplied roles.
        const assignedRole = 'institution';
        const instId = 'inst-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        const aicteId = '1-' + (10000000 + Math.floor(Math.random() * 90000000));
        const nowStr = new Date().toISOString();

        db.prepare(`
          INSERT INTO institutions (id, name, aicte_id, type, state, city, region, established, status, contact_person, contact_email, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          instId,
          institutionName.trim(),
          aicteId,
          'Engineering & Technology',
          'Registered State',
          'Registered City',
          region.trim(),
          new Date().getFullYear(),
          'active',
          fullName.trim(),
          email.trim(),
          nowStr
        );

        const { hash, salt } = hashPassword(password);
        const newUserId = 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

        db.prepare(`
          INSERT INTO users (id, username, password_hash, salt, full_name, role, region, institution_id, email, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newUserId,
          trimmedUser,
          hash,
          salt,
          fullName.trim(),
          assignedRole,
          region.trim(),
          instId,
          email.trim(),
          1,
          nowStr
        );

        db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'aud-' + Date.now().toString(36),
          newUserId,
          fullName.trim(),
          'user_registered',
          'user',
          newUserId,
          `New institutional representative '${fullName.trim()}' registered for institution '${institutionName.trim()}'`,
          null,
          null,
          ip,
          nowStr
        );

        const sessionUser = {
          userId: newUserId,
          username: trimmedUser,
          fullName: fullName.trim(),
          role: assignedRole,
          region: region.trim(),
          institutionId: instId,
          bureau: null,
          committeeType: null,
          email: email.trim()
        };

        const token = createToken(sessionUser);
        const isHttps = req.headers['x-forwarded-proto'] === 'https';
        const secureFlag = isHttps ? '; Secure' : '';
        const cookie = `flowguard_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secureFlag}`;

        return sendJSON(res, 201, {
          success: true,
          message: 'Institutional account registered successfully',
          user: sessionUser,
          token
        }, { 'Set-Cookie': cookie });
      }

      // 3. Authentication: Logout
      if (pathname === '/api/auth/logout' && method === 'POST') {
        if (session) {
          db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            'aud-' + Date.now().toString(36),
            session.userId,
            session.fullName,
            'user_logout',
            'user',
            session.userId,
            `${session.fullName} signed out`,
            null,
            null,
            req.socket.remoteAddress || '127.0.0.1',
            new Date().toISOString()
          );
        }
        return sendJSON(res, 200, { success: true }, { 'Set-Cookie': 'flowguard_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' });
      }

      // 4. Authentication: Me
      if (pathname === '/api/auth/me' && method === 'GET') {
        if (!session) return sendProblem(res, 401, 'Unauthorized', 'Valid session token required', pathname);
        return sendJSON(res, 200, { user: session, roles: ROLES });
      }

      // -------------------------------------------------------------
      // PROTECTED API ENDPOINTS
      // -------------------------------------------------------------
      if (!session) {
        return sendProblem(res, 401, 'Unauthorized', 'Valid authentication token required for this endpoint', pathname);
      }

      // 5. File Upload: Multipart or Base64 JSON
      if (pathname === '/api/upload' && method === 'POST') {
        const contentType = req.headers['content-type'] || '';
        let originalName = 'document.pdf';
        let fileBuffer = null;

        if (contentType.includes('multipart/form-data')) {
          const boundaryMatch = contentType.match(/boundary=([^;]+)/);
          if (!boundaryMatch) {
            return sendProblem(res, 400, 'Bad Request', 'Missing multipart boundary header', pathname);
          }
          const rawBuffer = await parseRawBodyBuffer(req);
          const parts = parseMultipartBuffer(rawBuffer, boundaryMatch[1]);
          const filePart = parts.find(p => p.filename && p.data);
          if (!filePart) {
            return sendProblem(res, 400, 'Bad Request', 'No file found in multipart upload payload', pathname);
          }
          originalName = filePart.filename;
          fileBuffer = filePart.data;
        } else {
          // JSON base64 upload
          const body = await parseBody(req);
          if (!body.fileData || !body.fileName) {
            return sendProblem(res, 400, 'Bad Request', 'Both fileName and fileData (base64) are required', pathname);
          }
          originalName = path.basename(body.fileName);
          const cleanBase64 = body.fileData.replace(/^data:[^;]+;base64,/, '');
          fileBuffer = Buffer.from(cleanBase64, 'base64');
        }

        // Validate File Extension
        const ext = path.extname(originalName).toLowerCase();
        if (!ALLOWED_UPLOAD_EXTS.includes(ext)) {
          return sendProblem(res, 415, 'Unsupported Media Type', `Unsupported file extension '${ext}'. Allowed: ${ALLOWED_UPLOAD_EXTS.join(', ')}`, pathname);
        }

        // Validate File Size
        if (fileBuffer.length > 10 * 1024 * 1024) {
          return sendProblem(res, 413, 'Payload Too Large', 'File exceeds the maximum allowable size of 10MB', pathname);
        }

        // Generate Collision-Resistant Safe Filename
        const safeStoredName = `fg_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}${ext}`;
        const targetPath = path.join(UPLOADS_DIR, safeStoredName);

        // Security check: ensure path does not escape UPLOADS_DIR
        if (!targetPath.startsWith(UPLOADS_DIR)) {
          return sendProblem(res, 400, 'Bad Request', 'Invalid target file destination path', pathname);
        }

        fs.writeFileSync(targetPath, fileBuffer);
        uploadedFilesRegistry.set(safeStoredName, {
          userId: session.userId,
          institutionId: session.institutionId,
          region: session.region,
          createdAt: Date.now()
        });

        return sendJSON(res, 201, {
          success: true,
          storedPath: safeStoredName,
          fileName: originalName,
          fileSize: fileBuffer.length,
          mimeType: MIME_TYPES[ext] || 'application/octet-stream',
          url: `/api/files/${safeStoredName}`
        });
      }

      // 6. Secure File Retrieval: Record-Scoped Access
      if (pathname.match(/^\/api\/files\/[^/]+$/) && method === 'GET') {
        const storedName = path.basename(pathname.split('/')[3]);
        const targetPath = path.normalize(path.join(UPLOADS_DIR, storedName));

        // Path Traversal Security Verification
        if (!targetPath.startsWith(UPLOADS_DIR)) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: Path traversal detected', pathname);
        }

        if (!fs.existsSync(targetPath)) {
          return sendProblem(res, 404, 'Not Found', 'The requested file does not exist', pathname);
        }

        // Enforce Record-Level Ownership / Scope Authorization
        const authorized = canAccessUpload(session, storedName);
        if (!authorized) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: You do not have permission to download this file', pathname);
        }

        const ext = path.extname(targetPath).toLowerCase();
        const stat = fs.statSync(targetPath);

        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `inline; filename="${storedName}"`,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN'
        });

        fs.createReadStream(targetPath).pipe(res);
        return;
      }

      // 7. Applications: List
      if (pathname === '/api/applications' && method === 'GET') {
        const scope = getScopeClause(session, 'applications');
        let query = `SELECT * FROM applications WHERE ${scope.sql}`;
        const params = [...scope.params];

        if (parsedUrl.query.status) {
          query += ' AND status = ?';
          params.push(parsedUrl.query.status);
        }
        if (parsedUrl.query.region) {
          // Regional officer cannot override own region query
          if (session.role !== 'regional_officer') {
            query += ' AND region = ?';
            params.push(parsedUrl.query.region);
          }
        }
        if (parsedUrl.query.type) {
          query += ' AND type = ?';
          params.push(parsedUrl.query.type);
        }
        if (parsedUrl.query.search) {
          query += ' AND (application_number LIKE ? OR institution_name LIKE ? OR program_name LIKE ?)';
          const s = `%${parsedUrl.query.search}%`;
          params.push(s, s, s);
        }

        query += ' ORDER BY submitted_date DESC';
        const apps = db.prepare(query).all(...params);

        apps.forEach(a => {
          if (typeof a.attachments === 'string') {
            try { a.attachments = JSON.parse(a.attachments); } catch(e) { a.attachments = []; }
          }
        });

        return sendJSON(res, 200, { applications: apps });
      }

      // 8. Applications: Detail
      if (pathname.match(/^\/api\/applications\/[^/]+$/) && method === 'GET') {
        const id = pathname.split('/')[3];
        const scope = getScopeClause(session, 'applications');
        const app = db.prepare(`SELECT * FROM applications WHERE id = ? AND (${scope.sql})`).get(id, ...scope.params);
        if (!app) {
          return sendProblem(res, 404, 'Not Found', 'Application not found or access restricted', pathname);
        }

        if (typeof app.attachments === 'string') {
          try { app.attachments = JSON.parse(app.attachments); } catch(e) { app.attachments = []; }
        }

        const history = db.prepare('SELECT * FROM stage_history WHERE application_id = ? ORDER BY date DESC').all(id);
        const audits = db.prepare('SELECT * FROM audit_trail WHERE entity_id = ? ORDER BY timestamp DESC').all(id);
        const evc = db.prepare('SELECT * FROM evc_events WHERE application_id = ?').get(id);
        const undertakings = db.prepare('SELECT * FROM undertakings WHERE application_id = ?').all(id);
        const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(app.workflow_template_id);

        return sendJSON(res, 200, {
          application: app,
          stageHistory: history,
          audits,
          evc,
          undertakings,
          template: template ? { ...template, stages: JSON.parse(template.stages) } : null
        });
      }

      // 9. Applications: Create
      if (pathname === '/api/applications' && method === 'POST') {
        if (!hasPermission(session.role, 'submit_application')) {
          return sendProblem(res, 403, 'Forbidden', 'Role not authorized to submit applications', pathname);
        }

        const body = await parseBody(req);
        if (!body.programName || typeof body.programName !== 'string' || body.programName.trim().length < 3) {
          return sendProblem(res, 400, 'Bad Request', 'Valid programName (at least 3 characters) is required', pathname);
        }
        if (!body.workflowTemplateId) {
          return sendProblem(res, 400, 'Bad Request', 'workflowTemplateId is required', pathname);
        }

        // Strictly enforce that institution user can ONLY create for their assigned institution
        let instId = session.institutionId;
        if (session.role !== 'institution' && body.institutionId) {
          instId = body.institutionId;
        }
        if (!instId) {
          return sendProblem(res, 400, 'Bad Request', 'Valid institution identification required', pathname);
        }

        const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId);
        if (!inst) {
          return sendProblem(res, 400, 'Bad Request', 'Institution does not exist', pathname);
        }

        const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(body.workflowTemplateId);
        if (!template) {
          return sendProblem(res, 400, 'Bad Request', 'Invalid workflow template specified', pathname);
        }

        const stages = JSON.parse(template.stages);
        const firstStage = stages[0]?.id || 'scrutiny';
        const firstSlaDays = stages[0]?.timelineDays || 15;

        const year = new Date().getFullYear();
        const count = db.prepare('SELECT COUNT(*) as c FROM applications').get().c + 1;
        const seq = String(count).padStart(4, '0');
        const regRow = db.prepare('SELECT code FROM regions WHERE id = ?').get(inst.region);
        const regCode = regRow?.code || 'NR';
        const appNumber = `FG/${regCode}/${year}/${seq}`;
        const appId = 'app-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
        const now = new Date().toISOString();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + firstSlaDays);

        db.prepare(`
          INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          appId,
          appNumber,
          inst.id,
          inst.name,
          body.type || 'new-program',
          body.programName.trim(),
          template.id,
          firstStage,
          firstStage,
          inst.region,
          null,
          null,
          now.split('T')[0],
          dueDate.toISOString().split('T')[0],
          body.notes || '',
          null,
          JSON.stringify(body.attachments || ['application_form.pdf']),
          body.priority || (body.type === 'new-institution' ? 'high' : 'normal'),
          body.type === 'new-institution' ? 1 : 0,
          now,
          now
        );

        // Stage history
        db.prepare('INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          'hist-' + Date.now().toString(36),
          appId,
          'submitted',
          'Application Submitted',
          session.userId,
          session.fullName,
          now,
          body.notes || 'Initial application filed'
        );

        // Audit
        db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'aud-' + Date.now().toString(36),
          session.userId,
          session.fullName,
          'application_submitted',
          'application',
          appId,
          `Submitted application ${appNumber} (${body.programName.trim()})`,
          null,
          JSON.stringify({ status: firstStage, programName: body.programName.trim() }),
          req.socket.remoteAddress || '127.0.0.1',
          now
        );

        return sendJSON(res, 201, { success: true, applicationId: appId, applicationNumber: appNumber });
      }

      // 10. Applications: Advance Stage
      if (pathname.match(/^\/api\/applications\/[^/]+\/advance$/) && method === 'POST') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        if (!body.nextStage) {
          return sendProblem(res, 400, 'Bad Request', 'nextStage parameter is required', pathname);
        }
        const result = WorkflowEngine.advanceStage(id, body.nextStage, body.notes, session);
        if (!result.success) {
          const status = result.error.includes('Unauthorized') || result.error.includes('Access Denied') ? 403 : 400;
          return sendProblem(res, status, 'Workflow Advance Error', result.error, pathname);
        }
        return sendJSON(res, 200, result);
      }

      // 11. Applications: Return
      if (pathname.match(/^\/api\/applications\/[^/]+\/return$/) && method === 'POST') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        if (!body.returnReason || !body.returnReason.trim()) {
          return sendProblem(res, 400, 'Bad Request', 'A mandatory returnReason must be specified', pathname);
        }
        const result = WorkflowEngine.returnApplication(id, body.returnReason, session);
        if (!result.success) {
          const status = result.error.includes('Unauthorized') || result.error.includes('Access Denied') ? 403 : 400;
          return sendProblem(res, status, 'Workflow Return Error', result.error, pathname);
        }
        return sendJSON(res, 200, result);
      }

      // 12. Applications: Approve
      if (pathname.match(/^\/api\/applications\/[^/]+\/approve$/) && method === 'POST') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        const result = WorkflowEngine.approveApplication(id, body.notes, session);
        if (!result.success) {
          const status = result.error.includes('Unauthorized') ? 403 : 400;
          return sendProblem(res, status, 'Approval Error', result.error, pathname);
        }
        return sendJSON(res, 200, result);
      }

      // 13. Applications: Reject
      if (pathname.match(/^\/api\/applications\/[^/]+\/reject$/) && method === 'POST') {
        const id = pathname.split('/')[3];
        const body = await parseBody(req);
        if (!body.rejectionReason || !body.rejectionReason.trim()) {
          return sendProblem(res, 400, 'Bad Request', 'A mandatory rejectionReason must be specified', pathname);
        }
        const result = WorkflowEngine.rejectApplication(id, body.rejectionReason, session);
        if (!result.success) {
          const status = result.error.includes('Unauthorized') ? 403 : 400;
          return sendProblem(res, status, 'Rejection Error', result.error, pathname);
        }
        return sendJSON(res, 200, result);
      }

      // 14. EVC Events: List
      if (pathname === '/api/evc' && method === 'GET') {
        const scope = getScopeClause(session, 'evc_events');
        const events = db.prepare(`SELECT * FROM evc_events WHERE ${scope.sql} ORDER BY created_at DESC`).all(...scope.params);
        return sendJSON(res, 200, { evcEvents: events });
      }

      // 15. EVC: Schedule
      if (pathname.match(/^\/api\/evc\/[^/]+\/schedule$/) && method === 'POST') {
        if (!hasPermission(session.role, 'manage_evc')) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: You do not have permission to schedule EVC inspections', pathname);
        }

        const id = pathname.split('/')[3];
        const evt = db.prepare('SELECT * FROM evc_events WHERE id = ?').get(id);
        if (!evt) return sendProblem(res, 404, 'Not Found', 'EVC Event not found', pathname);

        // Check regional jurisdiction
        if (session.role === 'regional_officer' && evt.region !== session.region) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: EVC event is outside your regional jurisdiction', pathname);
        }

        const body = await parseBody(req);
        if (!body.expertId || !body.plannedDate) {
          return sendProblem(res, 400, 'Bad Request', 'expertId and plannedDate are required', pathname);
        }

        const expert = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(body.expertId);
        if (!expert) return sendProblem(res, 400, 'Bad Request', 'Invalid committee expert selected', pathname);

        const now = new Date().toISOString();

        db.prepare(`
          UPDATE evc_events
          SET status = 'scheduled',
              committee_id = ?,
              committee_name = ?,
              planned_date = ?,
              notes = ?,
              updated_at = ?
          WHERE id = ?
        `).run(expert.id, expert.full_name, body.plannedDate, body.notes || '', now, id);

        // Advance app status if pending
        if (evt.application_id) {
          db.prepare(`
            UPDATE applications
            SET status = 'evc-scheduled', current_stage = 'evc-scheduled', updated_at = ?
            WHERE id = ? AND status = 'evc-pending'
          `).run(now, evt.application_id);
        }

        // Record audit
        db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'aud-' + Date.now().toString(36),
          session.userId,
          session.fullName,
          'evc_scheduled',
          'evc',
          id,
          `Scheduled EVC inspection for ${evt.institution_name} on ${body.plannedDate} led by ${expert.full_name}`,
          JSON.stringify({ status: evt.status }),
          JSON.stringify({ status: 'scheduled', plannedDate: body.plannedDate, expert: expert.full_name }),
          req.socket.remoteAddress || '127.0.0.1',
          now
        );

        return sendJSON(res, 200, { success: true, message: 'EVC inspection scheduled successfully' });
      }

      // 16. EVC: Submit Report
      if (pathname.match(/^\/api\/evc\/[^/]+\/report$/) && method === 'POST') {
        const id = pathname.split('/')[3];
        const evt = db.prepare('SELECT * FROM evc_events WHERE id = ?').get(id);
        if (!evt) return sendProblem(res, 404, 'Not Found', 'EVC Event not found', pathname);

        // Authorization check: must be assigned expert, regional officer of region, or admin
        const isAssignedExpert = session.role === 'committee' && evt.committee_id === session.userId;
        const isRegionalOfficer = session.role === 'regional_officer' && evt.region === session.region;
        const isExecutive = ['bureau_officer', 'admin'].includes(session.role);

        if (!isAssignedExpert && !isRegionalOfficer && !isExecutive) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: You are not authorized to file a report for this EVC event', pathname);
        }

        const body = await parseBody(req);
        if (!body.report || !body.report.trim()) {
          return sendProblem(res, 400, 'Bad Request', 'Formal inspection report text is required', pathname);
        }

        const now = new Date().toISOString();
        const recommendation = (body.recommendation || 'FAVORABLE').toUpperCase();
        const fullReport = `[Recommendation: ${recommendation}]\n${body.report.trim()}`;

        db.prepare(`
          UPDATE evc_events
          SET status = 'completed',
              completed_date = ?,
              report = ?,
              updated_at = ?
          WHERE id = ?
        `).run(body.completedDate || now.split('T')[0], fullReport, now, id);

        if (evt.application_id) {
          db.prepare(`
            UPDATE applications
            SET status = 'evc-completed', current_stage = 'evc-completed', updated_at = ?
            WHERE id = ?
          `).run(now, evt.application_id);

          db.prepare('INSERT INTO stage_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
            'hist-' + Date.now().toString(36),
            evt.application_id,
            'evc-completed',
            'EVC Inspection Report Filed',
            session.userId,
            session.fullName,
            now,
            fullReport
          );
        }

        // Audit
        db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'aud-' + Date.now().toString(36),
          session.userId,
          session.fullName,
          'evc_completed',
          'evc',
          id,
          `EVC report filed for ${evt.institution_name}: ${recommendation}`,
          JSON.stringify({ status: evt.status }),
          JSON.stringify({ status: 'completed', recommendation }),
          req.socket.remoteAddress || '127.0.0.1',
          now
        );

        return sendJSON(res, 200, { success: true, message: 'EVC report filed successfully' });
      }

      // 17. Undertakings: List
      if (pathname === '/api/undertakings' && method === 'GET') {
        const scope = getScopeClause(session, 'undertakings');
        let query = `SELECT * FROM undertakings WHERE ${scope.sql} ORDER BY due_date ASC`;
        const unds = db.prepare(query).all(...scope.params);

        for (const u of unds) {
          u.submissions = db.prepare('SELECT * FROM undertaking_submissions WHERE undertaking_id = ? ORDER BY submitted_at ASC').all(u.id);
        }

        return sendJSON(res, 200, { undertakings: unds });
      }

      // 18. Undertakings: Create (Restricted to Officers/Admin)
      if (pathname === '/api/undertakings' && method === 'POST') {
        if (!hasPermission(session.role, 'assign_undertaking')) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Only authorized officers can create institutional undertakings', pathname);
        }

        const body = await parseBody(req);
        if (!body.institutionId || !body.condition || !body.dueDate || !body.requiredEvidence) {
          return sendProblem(res, 400, 'Bad Request', 'institutionId, condition, dueDate, and requiredEvidence are required', pathname);
        }

        const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(body.institutionId);
        if (!inst) return sendProblem(res, 400, 'Bad Request', 'Invalid institution ID', pathname);

        if (session.role === 'regional_officer' && inst.region !== session.region) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: Institution is outside your regional jurisdiction', pathname);
        }

        const id = 'und-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO undertakings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          body.applicationId || null,
          inst.id,
          inst.name,
          body.condition.trim(),
          body.dueDate,
          body.requiredEvidence.trim(),
          'pending',
          session.userId,
          session.fullName,
          inst.region,
          now,
          now
        );

        return sendJSON(res, 201, { success: true, undertakingId: id });
      }

      // 19. Undertakings: Submit Evidence
      if (pathname.match(/^\/api\/undertakings\/[^/]+\/submit-evidence$/) && method === 'POST') {
        const id = pathname.split('/')[3];
        const und = db.prepare('SELECT * FROM undertakings WHERE id = ?').get(id);
        if (!und) return sendProblem(res, 404, 'Not Found', 'Undertaking not found', pathname);

        // Verification: If caller is institution user, it MUST match the undertaking's institution
        if (session.role === 'institution' && und.institution_id !== session.institutionId) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: You cannot submit evidence for another institution', pathname);
        }

        const body = await parseBody(req);
        const now = new Date().toISOString();
        const subId = 'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

        db.prepare(`
          INSERT INTO undertaking_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          subId,
          id,
          body.fileName || 'compliance_evidence.pdf',
          body.storedPath || null,
          now,
          session.userId,
          session.fullName,
          'under-review',
          body.notes || ''
        );

        db.prepare("UPDATE undertakings SET status = 'submitted', updated_at = ? WHERE id = ?").run(now, id);

        return sendJSON(res, 200, { success: true, submissionId: subId });
      }

      // 20. Undertakings: Review
      if (pathname.match(/^\/api\/undertakings\/[^/]+\/review$/) && method === 'POST') {
        if (!hasPermission(session.role, 'review_undertaking')) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Only authorized officers can review compliance undertakings', pathname);
        }

        const id = pathname.split('/')[3];
        const und = db.prepare('SELECT * FROM undertakings WHERE id = ?').get(id);
        if (!und) return sendProblem(res, 404, 'Not Found', 'Undertaking not found', pathname);

        if (session.role === 'regional_officer' && und.region !== session.region) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: Undertaking is outside your regional jurisdiction', pathname);
        }

        const body = await parseBody(req);
        if (!body.decision || !['verified', 'rejected'].includes(body.decision)) {
          return sendProblem(res, 400, 'Bad Request', "Decision must be 'verified' or 'rejected'", pathname);
        }

        const now = new Date().toISOString();

        db.prepare("UPDATE undertakings SET status = ?, updated_at = ? WHERE id = ?").run(body.decision, now, id);

        db.prepare(`
          UPDATE undertaking_submissions
          SET status = ?, review_notes = ?
          WHERE undertaking_id = ?
        `).run(body.decision === 'verified' ? 'accepted' : 'rejected', body.reviewNotes || '', id);

        return sendJSON(res, 200, { success: true, status: body.decision });
      }

      // 21. Documents: List
      if (pathname === '/api/documents' && method === 'GET') {
        const scope = getScopeClause(session, 'documents');
        const docs = db.prepare(`SELECT * FROM documents WHERE ${scope.sql} ORDER BY expiry_date ASC`).all(...scope.params);
        return sendJSON(res, 200, { documents: docs });
      }

      // 22. Documents: Add
      if (pathname === '/api/documents' && method === 'POST') {
        if (!hasPermission(session.role, 'upload_document')) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Role cannot upload statutory documents', pathname);
        }

        const body = await parseBody(req);
        if (!body.type || !body.issueDate) {
          return sendProblem(res, 400, 'Bad Request', 'type and issueDate are required', pathname);
        }

        let instId = session.institutionId;
        if (session.role !== 'institution' && body.institutionId) {
          instId = body.institutionId;
        }
        if (!instId) return sendProblem(res, 400, 'Bad Request', 'Valid institutionId required', pathname);

        const inst = db.prepare('SELECT * FROM institutions WHERE id = ?').get(instId);
        if (!inst) return sendProblem(res, 400, 'Bad Request', 'Invalid institution ID', pathname);

        if (session.role === 'regional_officer' && inst.region !== session.region) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: Institution is outside your regional jurisdiction', pathname);
        }

        const id = 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          inst.id,
          inst.name,
          body.type.trim(),
          body.description || '',
          body.issueDate,
          body.effectiveDate || body.issueDate,
          body.expiryDate || null,
          'valid',
          body.fileName || 'document.pdf',
          body.storedPath || null,
          inst.region,
          null,
          'pending',
          null,
          null,
          now,
          now
        );

        return sendJSON(res, 201, { success: true, documentId: id });
      }

      // 23. Documents: Renew
      if (pathname.match(/^\/api\/documents\/[^/]+\/renew$/) && method === 'POST') {
        if (!hasPermission(session.role, 'renew_document')) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Role cannot file document renewals', pathname);
        }

        const id = pathname.split('/')[3];
        const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
        if (!doc) return sendProblem(res, 404, 'Not Found', 'Document not found', pathname);

        if (session.role === 'institution' && doc.institution_id !== session.institutionId) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: Cannot renew document for another institution', pathname);
        }

        const body = await parseBody(req);
        if (!body.issueDate || !body.expiryDate) {
          return sendProblem(res, 400, 'Bad Request', 'Updated issueDate and expiryDate are required', pathname);
        }

        const now = new Date().toISOString();

        db.prepare(`
          UPDATE documents
          SET issue_date = ?,
              expiry_date = ?,
              file_name = ?,
              stored_path = COALESCE(?, stored_path),
              status = 'valid',
              renewal_status = 'renewed',
              verification_status = 'pending',
              updated_at = ?
          WHERE id = ?
        `).run(body.issueDate, body.expiryDate, body.fileName || doc.file_name, body.storedPath || null, now, id);

        return sendJSON(res, 200, { success: true, message: 'Document renewal submitted' });
      }

      // 24. Documents: Verify
      if (pathname.match(/^\/api\/documents\/[^/]+\/verify$/) && method === 'POST') {
        if (!hasPermission(session.role, 'verify_document')) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Role cannot verify documents', pathname);
        }

        const id = pathname.split('/')[3];
        const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
        if (!doc) return sendProblem(res, 404, 'Not Found', 'Document not found', pathname);

        if (session.role === 'regional_officer' && doc.region !== session.region) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: Document is outside your regional jurisdiction', pathname);
        }

        const now = new Date().toISOString();

        db.prepare(`
          UPDATE documents
          SET verification_status = 'verified',
              verified_by = ?,
              verified_date = ?,
              updated_at = ?
          WHERE id = ?
        `).run(session.userId, now, now, id);

        return sendJSON(res, 200, { success: true, message: 'Document verified' });
      }

      // 25. Notifications: List
      if (pathname === '/api/notifications' && method === 'GET') {
        const scope = getScopeClause(session, 'notifications');
        const notifs = db.prepare(`
          SELECT * FROM notifications
          WHERE ${scope.sql}
          ORDER BY created_at DESC
          LIMIT 50
        `).all(...scope.params);

        return sendJSON(res, 200, { notifications: notifs });
      }

      // 26. Notifications: Mark Read
      if (pathname.match(/^\/api\/notifications\/[^/]+\/read$/) && method === 'POST') {
        const id = pathname.split('/')[3];
        const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
        if (!notif) return sendProblem(res, 404, 'Not Found', 'Notification not found', pathname);

        // Verify recipient ownership
        const isRecipient = (notif.recipient_id === session.userId) ||
          (notif.recipient_role === session.role) ||
          (notif.recipient_region === session.region) ||
          (notif.recipient_institution === session.institutionId);

        if (!isRecipient && session.role !== 'admin') {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: Notification not addressed to your session', pathname);
        }

        db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
        return sendJSON(res, 200, { success: true });
      }

      // 27. Notifications: Mark All Read
      if (pathname === '/api/notifications/read-all' && method === 'POST') {
        const scope = getScopeClause(session, 'notifications');
        db.prepare(`UPDATE notifications SET read = 1 WHERE ${scope.sql}`).run(...scope.params);
        return sendJSON(res, 200, { success: true });
      }

      // 28. Notifications: Trigger Sample In-App Escalation Alert
      if (pathname === '/api/notifications/simulate-escalation' && method === 'POST') {
        const id = 'ntf-' + Date.now().toString(36);
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          'escalation',
          'CRITICAL ESCALATION: SLA Stage Breach Alert',
          'Sample in-app escalation: Application SLA exceeded. Escalated for officer review.',
          session.userId,
          session.role,
          session.region,
          null,
          'application',
          'app-007',
          2,
          0,
          'in_app',
          now
        );
        return sendJSON(res, 200, { success: true, notificationId: id, channel: 'in_app' });
      }

      // 29. Reports & Analytics (Properly Scoped)
      if (pathname === '/api/reports/stats' && method === 'GET') {
        if (
          !hasPermission(session.role, 'view_region_reports') &&
          !hasPermission(session.role, 'view_all_reports')
        ) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Your role does not have permission to view reports', pathname);
        }

        let appFilter = '1=1';
        let undFilter = '1=1';
        const params = [];

        if (session.role === 'institution') {
          appFilter = 'institution_id = ?';
          undFilter = 'institution_id = ?';
          params.push(session.institutionId);
        } else if (session.role === 'regional_officer') {
          appFilter = 'region = ?';
          undFilter = 'region = ?';
          params.push(session.region);
        }

        const totalApps = db.prepare(`SELECT COUNT(*) as c FROM applications WHERE ${appFilter}`).get(...params).c;
        const approvedApps = db.prepare(`SELECT COUNT(*) as c FROM applications WHERE ${appFilter} AND status = 'approved'`).get(...params).c;
        const overdueApps = db.prepare(`SELECT COUNT(*) as c FROM applications WHERE ${appFilter} AND current_stage_due_date < date('now') AND status NOT IN ('approved', 'rejected', 'cancelled')`).get(...params).c;
        const pendingUnd = db.prepare(`SELECT COUNT(*) as c FROM undertakings WHERE ${undFilter} AND status IN ('pending', 'overdue')`).get(...params).c;
        const verifiedUnd = db.prepare(`SELECT COUNT(*) as c FROM undertakings WHERE ${undFilter} AND status = 'verified'`).get(...params).c;
        const totalUnd = db.prepare(`SELECT COUNT(*) as c FROM undertakings WHERE ${undFilter}`).get(...params).c;

        const stageCounts = db.prepare(`SELECT current_stage as stage, COUNT(*) as count FROM applications WHERE ${appFilter} GROUP BY current_stage`).all(...params);

        let regionPerformance = [];
        if (session.role === 'regional_officer') {
          regionPerformance = db.prepare(`
            SELECT r.id, r.name, r.code, r.states,
                   COUNT(a.id) as total,
                   SUM(CASE WHEN a.status = 'approved' THEN 1 ELSE 0 END) as approved,
                   SUM(CASE WHEN a.current_stage_due_date < date('now') AND a.status NOT IN ('approved', 'rejected') THEN 1 ELSE 0 END) as overdue
            FROM regions r
            LEFT JOIN applications a ON r.id = a.region
            WHERE r.id = ?
            GROUP BY r.id
          `).all(session.region);
        } else if (session.role !== 'institution') {
          regionPerformance = db.prepare(`
            SELECT r.id, r.name, r.code, r.states,
                   COUNT(a.id) as total,
                   SUM(CASE WHEN a.status = 'approved' THEN 1 ELSE 0 END) as approved,
                   SUM(CASE WHEN a.current_stage_due_date < date('now') AND a.status NOT IN ('approved', 'rejected') THEN 1 ELSE 0 END) as overdue
            FROM regions r
            LEFT JOIN applications a ON r.id = a.region
            GROUP BY r.id
          `).all();
        }

        regionPerformance.forEach(r => {
          try { r.states = JSON.parse(r.states); } catch(e) { r.states = []; }
          r.sla = r.total > 0 ? Math.round(((r.total - r.overdue) / r.total) * 100) : 100;
        });

        return sendJSON(res, 200, {
          kpis: {
            totalApplications: totalApps,
            approvedApplications: approvedApps,
            overdueApplications: overdueApps,
            approvalRate: totalApps > 0 ? Math.round((approvedApps / totalApps) * 100) : 0,
            slaComplianceRate: totalApps > 0 ? Math.round(((totalApps - overdueApps) / totalApps) * 100) : 100,
            undertakingsComplianceRate: totalUnd > 0 ? Math.round((verifiedUnd / totalUnd) * 100) : 0,
            pendingUndertakings: pendingUnd
          },
          stageCounts,
          regionPerformance
        });
      }

      // 30. Audit Trail: List
      if (pathname === '/api/audit' && method === 'GET') {
        if (!hasPermission(session.role, 'view_audit')) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Your role does not have permission to view system audit logs', pathname);
        }

        const scope = getScopeClause(session, 'audit_trail');
        const audits = db.prepare(`SELECT * FROM audit_trail WHERE ${scope.sql} ORDER BY timestamp DESC LIMIT 100`).all(...scope.params);
        return sendJSON(res, 200, { audits });
      }

      // 31. Admin: Workflows
      if (pathname === '/api/admin/workflows' && method === 'GET') {
        if (session.role !== 'admin') {
          return sendProblem(res, 403, 'Forbidden', 'Admin role required to view workflow templates', pathname);
        }
        const tmpls = db.prepare('SELECT * FROM workflow_templates').all();
        tmpls.forEach(t => {
          try { t.stages = JSON.parse(t.stages); } catch(e) {}
          try { t.applicableTo = JSON.parse(t.applicable_to); } catch(e) {}
        });
        return sendJSON(res, 200, { templates: tmpls });
      }

      // 32. Admin: Escalation Rules
      if (pathname === '/api/admin/escalation-rules' && method === 'GET') {
        if (session.role !== 'admin') {
          return sendProblem(res, 403, 'Forbidden', 'Admin role required to view escalation rules', pathname);
        }
        const rules = db.prepare('SELECT * FROM escalation_rules').all();
        return sendJSON(res, 200, { escalationRules: rules });
      }

      // 33. Admin: Users
      if (pathname === '/api/admin/users' && method === 'GET') {
        if (session.role !== 'admin') {
          return sendProblem(res, 403, 'Forbidden', 'Admin role required to view users', pathname);
        }
        const users = db.prepare('SELECT id, username, full_name, role, region, institution_id, email, active, created_at FROM users').all();
        return sendJSON(res, 200, { users });
      }

      if (pathname === '/api/admin/users' && method === 'POST') {
        if (session.role !== 'admin') {
          return sendProblem(res, 403, 'Forbidden', 'Admin role required to create users', pathname);
        }
        const body = await parseBody(req);
        if (!body.username || !body.password || !body.fullName || !body.role) {
          return sendProblem(res, 400, 'Bad Request', 'username, password, fullName, and role are required', pathname);
        }
        const role = body.role.trim();
        if (!ROLES[role]) {
          return sendProblem(res, 400, 'Bad Request', `Invalid role '${role}'`, pathname);
        }
        const username = body.username.trim();
        if (username.length < 3) {
          return sendProblem(res, 400, 'Bad Request', 'Username must be at least 3 characters', pathname);
        }
        const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
        if (existing) {
          return sendProblem(res, 409, 'Conflict', 'Username is already taken', pathname);
        }

        const { hash, salt } = hashPassword(body.password);
        const newUserId = 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
        const nowStr = new Date().toISOString();
        db.prepare(`
          INSERT INTO users (id, username, password_hash, salt, full_name, role, region, institution_id, bureau, committee_type, email, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newUserId,
          username,
          hash,
          salt,
          body.fullName.trim(),
          role,
          body.region || null,
          body.institutionId || null,
          body.bureau || null,
          body.committeeType || null,
          body.email || `${username}@demo.flowguard.in`,
          1,
          nowStr
        );

        db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'aud-' + Date.now().toString(36),
          session.userId,
          session.fullName,
          'admin_create_user',
          'user',
          newUserId,
          `Administrator created user '${username}' with role '${ROLES[role]?.label || role}'`,
          null,
          null,
          getClientIp(req),
          nowStr
        );

        return sendJSON(res, 201, {
          success: true,
          user: {
            id: newUserId,
            username,
            fullName: body.fullName.trim(),
            role,
            region: body.region || null,
            institutionId: body.institutionId || null,
            email: body.email || `${username}@demo.flowguard.in`,
            active: 1,
            createdAt: nowStr
          }
        });
      }

      const toggleUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/toggle$/);
      if (toggleUserMatch && (method === 'POST' || method === 'PUT')) {
        if (session.role !== 'admin') {
          return sendProblem(res, 403, 'Forbidden', 'Admin role required to manage users', pathname);
        }
        const targetUserId = toggleUserMatch[1];
        if (targetUserId === session.userId) {
          return sendProblem(res, 400, 'Bad Request', 'Cannot disable your own administrator account', pathname);
        }
        const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
        if (!targetUser) {
          return sendProblem(res, 404, 'Not Found', 'User not found', pathname);
        }
        const newStatus = targetUser.active === 1 ? 0 : 1;
        db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newStatus, targetUserId);

        db.prepare('INSERT INTO audit_trail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'aud-' + Date.now().toString(36),
          session.userId,
          session.fullName,
          newStatus === 1 ? 'admin_enable_user' : 'admin_disable_user',
          'user',
          targetUserId,
          `Administrator ${newStatus === 1 ? 'enabled' : 'disabled'} user '${targetUser.username}'`,
          null,
          null,
          getClientIp(req),
          new Date().toISOString()
        );

        return sendJSON(res, 200, { success: true, userId: targetUserId, active: newStatus });
      }

      // 34. Admin: Reset Demo Data
      if (pathname === '/api/admin/reset-seed' && method === 'POST') {
        if (session.role !== 'admin') {
          return sendProblem(res, 403, 'Forbidden', 'Admin role required to reset system seed data', pathname);
        }
        seedDatabase(true);
        return sendJSON(res, 200, { success: true, message: 'Database reset to demo seed data' });
      }

      // 35. Scheduler: Manual Trigger
      if (pathname === '/api/scheduler/run' && method === 'POST') {
        if (!['regional_officer', 'bureau_officer', 'competent_authority', 'admin'].includes(session.role)) {
          return sendProblem(res, 403, 'Forbidden', 'Unauthorized: Officer or Administrator role required to run scheduler', pathname);
        }
        const summary = Scheduler.runSchedulerOnce();
        return sendJSON(res, 200, { success: true, summary });
      }

      // 36. AI Assistant: Summarize Application
      if (pathname === '/api/ai/summarize-application' && method === 'POST') {
        const body = await parseBody(req);
        if (!body.applicationId) {
          return sendProblem(res, 400, 'Bad Request', 'applicationId is required', pathname);
        }
        const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(body.applicationId);
        if (!app) return sendProblem(res, 404, 'Not Found', 'Application not found', pathname);

        // Scoping check
        if (!canAccessRecord(session, 'applications', app)) {
          return sendProblem(res, 403, 'Forbidden', 'Access Denied: You do not have permission to view this application summary', pathname);
        }

        const summary = await AIService.summarizeApplication(body.applicationId);
        return sendJSON(res, 200, summary);
      }

      // 37. AI Assistant: Document Checklist
      if (pathname === '/api/ai/document-checklist' && method === 'POST') {
        const body = await parseBody(req);
        const checklist = AIService.generateChecklist(body.applicationType);
        return sendJSON(res, 200, checklist);
      }

      // 38. AI Assistant: Search Assistant
      if (pathname === '/api/ai/search-assistant' && method === 'POST') {
        const body = await parseBody(req);
        const result = AIService.regulatorySearch(body.query);
        return sendJSON(res, 200, result);
      }

      // Unmatched API endpoint
      return sendProblem(res, 404, 'Not Found', `API endpoint '${pathname}' not found`, pathname);

    } catch (err) {
      console.error('[API Server Error]:', err);
      const status = err.statusCode || 500;
      return sendProblem(res, status, 'Internal Server Error', err.message || 'An unexpected error occurred', pathname);
    }
  }

  // =============================================================
  // HARDENED STATIC ASSET SERVING
  // =============================================================
  let relativePath = pathname.substring(1);
  if (!relativePath || relativePath === '/') {
    relativePath = 'index.html';
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  // Security Check 1: Must stay strictly within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  // Security Check 2: Block protected internal directories and sensitive files
  const forbiddenPrefixes = [
    path.normalize(DATA_DIR),
    path.normalize(UPLOADS_DIR),
    path.normalize(path.join(PUBLIC_DIR, '.git')),
    path.normalize(path.join(PUBLIC_DIR, 'server')),
    path.normalize(path.join(PUBLIC_DIR, 'tests')),
    path.normalize(path.join(PUBLIC_DIR, 'node_modules'))
  ];

  const forbiddenFiles = [
    'package.json',
    'package-lock.json',
    'Dockerfile',
    'docker-compose.yml',
    'server.js',
    'server.ps1',
    '.env',
    '.env.example',
    '.gitignore',
    '.gitattributes'
  ];

  const baseFileName = path.basename(filePath);
  const isForbiddenPrefix = forbiddenPrefixes.some(p => filePath.startsWith(p));
  const isForbiddenFile = forbiddenFiles.includes(baseFileName) || baseFileName.startsWith('.env');

  if (isForbiddenPrefix || isForbiddenFile) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied: Protected System Resource');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

// Start Background SLA Scheduler (runs every 60 seconds)
Scheduler.startScheduler(60000);

server.listen(PORT, () => {
  console.log(`
  ==============================================================
   🛡️  AICTE FlowGuard Full-Stack Platform Active!
   --------------------------------------------------------------
   🌐 Web Application URL : http://localhost:${PORT}
   🏥 API Health Check    : http://localhost:${PORT}/api/health
   🗄️ Database Engine     : Native node:sqlite (data/flowguard.db)
   ⏱️ SLA Scheduler       : Active (Due date checks & escalations)
   🔒 Security Status     : RBAC & Data Isolation Enforced
  ==============================================================
  `);
});
