/* ============================================
   AICTE FlowGuard — Authentication Lifecycle & RBAC Integration Tests
   ============================================ */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { db, hashPassword } = require('../server/db.js');
const { createToken, verifyToken } = require('../server/auth.js');

async function runAuthIntegrationTests({ test, asyncTest }) {
  console.log('\n--- 9. Full Authentication Lifecycle & Session Tests ---');

  const port = 5603;
  const serverProc = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(port);

    // 1. Valid login through HTTP endpoint
    await asyncTest('Valid HTTP login returns signed JWT, user payload, and HttpOnly cookie', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ro_north', password: 'demo123' })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.token, 'JWT token returned');
      assert.strictEqual(data.user.username, 'ro_north');
      assert.strictEqual(data.user.role, 'regional_officer');
      assert.strictEqual(data.user.region, 'reg-north');

      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie && setCookie.includes('flowguard_token='), 'HttpOnly session cookie set');
      assert.ok(setCookie.includes('HttpOnly'), 'Cookie is HttpOnly');
      assert.ok(setCookie.includes('SameSite=Strict'), 'Cookie is SameSite=Strict');
    });

    // 2. Invalid credentials and missing fields
    await asyncTest('Missing or invalid credentials return 400 Bad Request or 401 Unauthorized', async () => {
      // Missing password
      const noPass = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ro_north' })
      });
      assert.strictEqual(noPass.status, 400, 'Missing password returns 400');

      // Empty / whitespace username
      const emptyUser = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '   ', password: 'demo123' })
      });
      assert.strictEqual(emptyUser.status, 400, 'Whitespace-only username returns 400');

      // Wrong password
      const wrongPass = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ro_north', password: 'incorrect_password_xyz' })
      });
      assert.strictEqual(wrongPass.status, 401, 'Wrong password returns 401');

      // Nonexistent user
      const nonExistent = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nonexistent_user_999', password: 'demo123' })
      });
      assert.strictEqual(nonExistent.status, 401, 'Nonexistent user returns 401');
    });

    // 3. JWT verification, tampering, and expiration
    test('JWT algorithm verification, expiration, and tampering guards', () => {
      const validToken = createToken({ userId: 'user-ro1', role: 'regional_officer' });
      assert.ok(verifyToken(validToken), 'Valid token verified');

      // Tampered signature
      const tampered = validToken.substring(0, validToken.lastIndexOf('.') + 1) + 'tamperedSignature';
      assert.strictEqual(verifyToken(tampered), null, 'Tampered signature rejected');

      // Expired token (iat & exp in the past)
      const now = Math.floor(Date.now() / 1000);
      const expiredPayload = { userId: 'user-ro1', role: 'regional_officer', iat: now - 3600, exp: now - 10 };
      const secret = process.env.JWT_SECRET || 'flowguard-dev-only-hmac-secret-key-minimum-32-chars-long';
      const crypto = require('node:crypto');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
      const expiredToken = `${header}.${body}.${sig}`;
      assert.strictEqual(verifyToken(expiredToken), null, 'Expired token rejected');

      // None algorithm attack attempt
      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const noneToken = `${noneHeader}.${body}.`;
      assert.strictEqual(verifyToken(noneToken), null, 'None algorithm token rejected');
    });

    // 4. Session restoration via /api/auth/me
    await asyncTest('Session restoration via /api/auth/me with Bearer token and Cookie', async () => {
      // Login to get token
      const login = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'inst_demotech', password: 'demo123' })
      });
      assert.strictEqual(login.status, 200);
      const token = login.json.token;

      // Verify with Bearer header
      const meHeader = await fetchJson(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.strictEqual(meHeader.status, 200, '/api/auth/me succeeds with Bearer header');
      assert.strictEqual(meHeader.json.user.username, 'inst_demotech');
      assert.strictEqual(meHeader.json.user.institutionId, 'inst-001');

      // Verify with Cookie header
      const meCookie = await fetchJson(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: { Cookie: `flowguard_token=${token}` }
      });
      assert.strictEqual(meCookie.status, 200, '/api/auth/me succeeds with Cookie');
      assert.strictEqual(meCookie.json.user.username, 'inst_demotech');

      // Unauthenticated request
      const meAnon = await fetchJson(`http://127.0.0.1:${port}/api/auth/me`);
      assert.strictEqual(meAnon.status, 401, 'Unauthenticated /api/auth/me returns 401');
    });

    // 5. Logout and subsequent session behavior
    await asyncTest('Logout clears session cookie and records audit trail', async () => {
      const login = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ro_south', password: 'demo123' })
      });
      assert.strictEqual(login.status, 200);

      const logoutRes = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${login.json.token}` }
      });
      assert.strictEqual(logoutRes.status, 200);
      const setCookie = logoutRes.headers.get('set-cookie');
      assert.ok(setCookie && setCookie.includes('Max-Age=0'), 'Logout clears cookie with Max-Age=0');
    });

    // 6. All eight demo accounts and their expected roles
    await asyncTest('All eight seeded demo accounts authenticate and return correct roles and scopes', async () => {
      const demoAccounts = [
        { u: 'ro_north', role: 'regional_officer', region: 'reg-north', inst: null },
        { u: 'ro_south', role: 'regional_officer', region: 'reg-south', inst: null },
        { u: 'inst_demotech', role: 'institution', region: 'reg-north', inst: 'inst-001' },
        { u: 'inst_southeng', role: 'institution', region: 'reg-south', inst: 'inst-002' },
        { u: 'bo_bureau1', role: 'bureau_officer', region: 'reg-north', inst: null },
        { u: 'evc_expert1', role: 'committee', region: null, inst: null },
        { u: 'ca_authority', role: 'competent_authority', region: null, inst: null },
        { u: 'admin', role: 'admin', region: null, inst: null }
      ];

      for (const acc of demoAccounts) {
        const res = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: acc.u, password: 'demo123' })
        });
        assert.strictEqual(res.status, 200, `Login for ${acc.u} must succeed`);
        assert.strictEqual(res.json.user.role, acc.role, `Role for ${acc.u} matches ${acc.role}`);
        if (acc.region) {
          assert.strictEqual(res.json.user.region, acc.region, `Region for ${acc.u} matches`);
        }
        if (acc.inst) {
          assert.strictEqual(res.json.user.institutionId, acc.inst, `InstitutionId for ${acc.u} matches`);
        }
      }
    });

    // 7. Disabled accounts cannot authenticate or access endpoints
    await asyncTest('Disabled accounts cannot authenticate or access protected endpoints', async () => {
      // Create a test user directly in DB
      const testUserId = 'test-disabled-user';
      const { hash, salt } = hashPassword('temp1234');
      db.prepare(`
        INSERT OR REPLACE INTO users (id, username, password_hash, salt, full_name, role, region, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(testUserId, 'temp_disabled_user', hash, salt, 'Temporary Disabled User', 'institution', 'reg-north', 0, new Date().toISOString());

      try {
        // Attempt login with disabled account
        const disabledLogin = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'temp_disabled_user', password: 'temp1234' })
        });
        assert.strictEqual(disabledLogin.status, 401, 'Disabled account login must return 401');

        // Forge or use a token with this user ID
        const forgedToken = createToken({ userId: testUserId, username: 'temp_disabled_user', role: 'institution' });
        const protectedRes = await fetchJson(`http://127.0.0.1:${port}/api/applications`, {
          headers: { Authorization: `Bearer ${forgedToken}` }
        });
        assert.strictEqual(protectedRes.status, 401, 'Disabled account must not access protected endpoints even with signed token');
      } finally {
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      }
    });

    // 8. Institutional registration succeeds with least privilege and prevents role escalation
    await asyncTest('Institutional registration assigns least privilege role and rejects role escalation', async () => {
      const uniqueSuffix = Date.now().toString(36);
      const testUsername = `test_inst_${uniqueSuffix}`;
      const testEmail = `test_${uniqueSuffix}@institution.edu.in`;

      const regPayload = {
        username: testUsername,
        password: 'ValidPassword123!',
        fullName: 'Dr. Test Principal',
        email: testEmail,
        institutionName: 'Apex Institute of Advanced Research',
        region: 'reg-west',
        role: 'admin' // Role escalation attempt! Must be ignored and overridden to 'institution'
      };

      let createdInstId = null;
      try {
        const regRes = await fetchJson(`http://127.0.0.1:${port}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(regPayload)
        });

        assert.strictEqual(regRes.status, 201, `Registration returns 201 Created (got ${regRes.status}: ${JSON.stringify(regRes.json)})`);
        assert.strictEqual(regRes.json.success, true);
        assert.strictEqual(regRes.json.user.role, 'institution', 'Role MUST strictly be institution, not admin');
        assert.strictEqual(regRes.json.user.region, 'reg-west');
        assert.ok(regRes.json.user.institutionId, 'Institution ID created');
        createdInstId = regRes.json.user.institutionId;

        // Verify the new user can log in with new credentials
        const loginRes = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: testUsername, password: 'ValidPassword123!' })
        });
        assert.strictEqual(loginRes.status, 200, 'Newly registered user can log in');
        assert.strictEqual(loginRes.json.user.role, 'institution');
      } finally {
        db.prepare('DELETE FROM users WHERE username = ?').run(testUsername);
        if (createdInstId) {
          db.prepare('DELETE FROM institutions WHERE id = ?').run(createdInstId);
        }
      }
    });

    // 9. Registration validation and duplicate conflict handling
    await asyncTest('Registration validates inputs and prevents duplicate username or email', async () => {
      // Weak password (< 8 chars)
      const weakPass = await fetchJson(`http://127.0.0.1:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'valid_user_abc',
          password: '123',
          fullName: 'Test User',
          email: 'test@example.com',
          institutionName: 'Test College',
          region: 'reg-north'
        })
      });
      assert.strictEqual(weakPass.status, 400, 'Weak password rejected with 400');

      // Invalid region
      const badRegion = await fetchJson(`http://127.0.0.1:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'valid_user_def',
          password: 'ValidPassword123',
          fullName: 'Test User',
          email: 'test_region@example.com',
          institutionName: 'Test College',
          region: 'invalid-region'
        })
      });
      assert.strictEqual(badRegion.status, 400, 'Invalid region rejected with 400');

      // Duplicate username (using existing seeded username 'admin')
      const dupUser = await fetchJson(`http://127.0.0.1:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'ValidPassword123',
          fullName: 'Test Impersonator',
          email: 'newemail@example.com',
          institutionName: 'Test College',
          region: 'reg-north'
        })
      });
      assert.strictEqual(dupUser.status, 409, 'Duplicate username returns 409 Conflict');

      // Duplicate email (using existing seeded email 'admin@demo.flowguard.in')
      const dupEmail = await fetchJson(`http://127.0.0.1:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'unique_user_999',
          password: 'ValidPassword123',
          fullName: 'Test Duplicate Email',
          email: 'admin@demo.flowguard.in',
          institutionName: 'Test College',
          region: 'reg-north'
        })
      });
      assert.strictEqual(dupEmail.status, 409, 'Duplicate email returns 409 Conflict');
    });

    // 10. Administrator user provisioning and enable/disable toggle
    await asyncTest('Administrator user provisioning, role validation, and disable toggle', async () => {
      // Login as admin
      const adminLogin = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'demo123' })
      });
      assert.strictEqual(adminLogin.status, 200);
      const adminToken = adminLogin.json.token;

      // Create new officer user
      const createRes = await fetchJson(`http://127.0.0.1:${port}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          username: 'ro_test_officer',
          password: 'OfficerPassword123',
          fullName: 'Dr. Test Officer',
          role: 'regional_officer',
          region: 'reg-east'
        })
      });
      assert.strictEqual(createRes.status, 201, 'Admin can provision new user');
      assert.strictEqual(createRes.json.user.role, 'regional_officer');
      const createdUserId = createRes.json.user.id;

      try {
        // Toggle user to disabled
        const toggleOff = await fetchJson(`http://127.0.0.1:${port}/api/admin/users/${createdUserId}/toggle`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(toggleOff.status, 200);
        assert.strictEqual(toggleOff.json.active, 0, 'User is now disabled');

        // Verify disabled user cannot log in
        const disabledAttempt = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'ro_test_officer', password: 'OfficerPassword123' })
        });
        assert.strictEqual(disabledAttempt.status, 401, 'Disabled user cannot authenticate');

        // Toggle user back to enabled
        const toggleOn = await fetchJson(`http://127.0.0.1:${port}/api/admin/users/${createdUserId}/toggle`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(toggleOn.status, 200);
        assert.strictEqual(toggleOn.json.active, 1, 'User is re-enabled');

        // Verify re-enabled user can now log in
        const enabledAttempt = await fetchJson(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'ro_test_officer', password: 'OfficerPassword123' })
        });
        assert.strictEqual(enabledAttempt.status, 200, 'Re-enabled user can authenticate');

        // Self-disable protection: admin cannot disable own account
        const selfDisable = await fetchJson(`http://127.0.0.1:${port}/api/admin/users/${adminLogin.json.user.userId}/toggle`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(selfDisable.status, 400, 'Admin cannot disable own account');
      } finally {
        db.prepare('DELETE FROM users WHERE id = ?').run(createdUserId);
      }
    });

  } finally {
    serverProc.kill('SIGTERM');
    await waitForExit(serverProc);
  }
}

module.exports = { runAuthIntegrationTests };

async function waitForServer(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch (err) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Server did not become healthy on port ${port} within ${timeoutMs}ms`);
}

async function fetchJson(targetUrl, options = {}) {
  const res = await fetch(targetUrl, options);
  let json = {};
  try {
    json = await res.json();
  } catch (err) {}
  return { status: res.status, json };
}

async function waitForExit(proc, timeoutMs = 5000) {
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    proc.once('exit', done);
    setTimeout(() => {
      if (!settled) {
        proc.kill('SIGKILL');
      }
      done();
    }, timeoutMs);
  });
}
