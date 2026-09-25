const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-demo-'));
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.AUTH_DB_PATH = path.join(temporaryDirectory, 'auth.sqlite');

const { app, closeDatabase } = require('../server');

let server;
let baseUrl;

test('registration, username/email login, session, and logout work', async (context) => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  context.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
    closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  const request = async (route, options = {}, cookie) => {
    const response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...options.headers,
      },
    });
    return response;
  };

  const initialSession = await request('/api/auth/me');
  assert.equal((await initialSession.json()).user, null);

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test User',
      username: 'Test_User',
      email: 'test@example.com',
      password: 'A-long-test-password!',
    }),
  });
  assert.equal(registration.status, 201);
  const registeredUser = (await registration.json()).user;
  assert.equal(registeredUser.username, 'test_user');
  assert.equal('password' in registeredUser, false);
  const registrationCookie = registration.headers.get('set-cookie').split(';')[0];

  const authenticatedSession = await request(
    '/api/auth/me',
    {},
    registrationCookie,
  );
  assert.equal((await authenticatedSession.json()).user.username, 'test_user');

  const duplicateRegistration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Duplicate',
      username: 'test_user',
      email: 'another@example.com',
      password: 'A-long-test-password!',
    }),
  });
  assert.equal(duplicateRegistration.status, 409);

  const logout = await request(
    '/api/auth/logout',
    { method: 'POST' },
    registrationCookie,
  );
  assert.equal(logout.status, 204);
  const loggedOutSession = await request(
    '/api/auth/me',
    {},
    registrationCookie,
  );
  assert.equal((await loggedOutSession.json()).user, null);

  for (const identifier of ['test_user', 'test@example.com']) {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        password: 'A-long-test-password!',
      }),
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.username, 'test_user');
  }

  const invalidLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: 'test_user',
      password: 'incorrect-password',
    }),
  });
  assert.equal(invalidLogin.status, 401);
});
