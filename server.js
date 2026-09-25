require('dotenv').config();

const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { rateLimit } = require('express-rate-limit');
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const isDemoEnabled = !isProduction && process.env.NODE_ENV !== 'test';
const databasePath = path.resolve(
  process.env.AUTH_DB_PATH || path.join(__dirname, 'data', 'auth.sqlite'),
);
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in production.');
}

if (!isProduction && !sessionSecret) {
  console.warn('SESSION_SECRET is not set; sessions will be invalidated when the server restarts.');
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS auth_sessions_expires_at
    ON auth_sessions (expires_at);
`);

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getSession = db.prepare(
      'SELECT data, expires_at FROM auth_sessions WHERE session_id = ?',
    );
    this.saveSession = db.prepare(`
      INSERT INTO auth_sessions (session_id, expires_at, data)
      VALUES (?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        expires_at = excluded.expires_at,
        data = excluded.data
    `);
    this.deleteSession = db.prepare('DELETE FROM auth_sessions WHERE session_id = ?');
    this.deleteExpiredSessions = db.prepare(
      'DELETE FROM auth_sessions WHERE expires_at <= ?',
    );
    this.updateExpiry = db.prepare(
      'UPDATE auth_sessions SET expires_at = ? WHERE session_id = ?',
    );
    this.cleanupTimer = setInterval(
      () => this.deleteExpiredSessions.run(Date.now()),
      60 * 60 * 1000,
    );
    this.cleanupTimer.unref();
    this.deleteExpiredSessions.run(Date.now());
  }

  get(sessionId, callback) {
    try {
      const record = this.getSession.get(sessionId);
      if (!record) {
        callback(null, null);
        return;
      }
      if (record.expires_at <= Date.now()) {
        this.deleteSession.run(sessionId);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(record.data));
    } catch (error) {
      callback(error);
    }
  }

  set(sessionId, sessionData, callback = () => {}) {
    try {
      const expiry = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + (sessionData.cookie?.maxAge || 24 * 60 * 60 * 1000);
      this.saveSession.run(sessionId, expiry, JSON.stringify(sessionData));
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sessionId, sessionData, callback = () => {}) {
    try {
      const expiry = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + (sessionData.cookie?.maxAge || 24 * 60 * 60 * 1000);
      this.updateExpiry.run(expiry, sessionId);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sessionId, callback = () => {}) {
    try {
      this.deleteSession.run(sessionId);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  close() {
    clearInterval(this.cleanupTimer);
  }
}

const sessionStore = new SQLiteSessionStore(database);
const demoUsername = 'demo';
const demoEmail = 'demo@example.com';
const demoPassword = 'DemoPass123!';

if (isDemoEnabled) {
  const existingDemo = database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(demoUsername);
  if (!existingDemo) {
    const passwordHash = bcrypt.hashSync(demoPassword, 12);
    database
      .prepare(
        'INSERT OR IGNORE INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)',
      )
      .run('Demo User', demoUsername, demoEmail, passwordHash);
  }
}

const dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

app.disable('x-powered-by');
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '10kb' }));
app.use(
  session({
    name: 'practice.sid',
    secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: isProduction,
    },
  }),
);
app.use(express.static(path.join(__dirname, 'public')));

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
  };
}

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

app.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/about', (request, response) => {
  response.sendFile(path.join(__dirname, 'views', 'about.html'));
});

app.post('/api/auth/register', authRateLimit, async (request, response) => {
  const { name, username, email, password } = request.body || {};
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!cleanName || cleanName.length > 80) {
    response.status(400).json({ error: 'Enter a name of 1 to 80 characters.' });
    return;
  }
  if (!/^[a-z0-9_-]{3,30}$/.test(cleanUsername)) {
    response.status(400).json({
      error: 'Username must be 3 to 30 characters and use letters, numbers, underscores, or hyphens.',
    });
    return;
  }
  if (
    cleanEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
  ) {
    response.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    response.status(400).json({
      error: 'Password must be at least 12 characters and no more than 72 bytes.',
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let result;
  try {
    result = database
      .prepare(
        'INSERT INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)',
      )
      .run(cleanName, cleanUsername, cleanEmail, passwordHash);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      response.status(409).json({ error: 'That username or email is already registered.' });
      return;
    }
    throw error;
  }

  const user = database
    .prepare('SELECT id, name, username, email FROM users WHERE id = ?')
    .get(result.lastInsertRowid);
  await regenerateSession(request);
  request.session.user = publicUser(user);
  await saveSession(request);
  response.status(201).json({ user: request.session.user });
});

app.post('/api/auth/login', authRateLimit, async (request, response) => {
  const { identifier, password } = request.body || {};
  if (
    typeof identifier !== 'string' ||
    !identifier.trim() ||
    identifier.length > 254 ||
    typeof password !== 'string' ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    response.status(400).json({ error: 'Enter a valid username/email and password.' });
    return;
  }

  const cleanIdentifier = identifier.trim().toLowerCase();
  const user = database
    .prepare(
      `SELECT id, name, username, email, password_hash
       FROM users WHERE username = ? OR email = ?`,
    )
    .get(cleanIdentifier, cleanIdentifier);
  const passwordMatches = await bcrypt.compare(
    password,
    user?.password_hash || dummyPasswordHash,
  );

  if (!user || !passwordMatches) {
    response.status(401).json({ error: 'Username/email or password is incorrect.' });
    return;
  }

  await regenerateSession(request);
  request.session.user = publicUser(user);
  await saveSession(request);
  response.json({ user: request.session.user });
});

app.get('/api/auth/me', (request, response) => {
  response.json({
    user: request.session.user || null,
    demoAccount: isDemoEnabled
      ? { username: demoUsername, password: demoPassword }
      : null,
  });
});

app.post('/api/auth/logout', (request, response, next) => {
  request.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    response.clearCookie('practice.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    });
    response.status(204).end();
  });
});

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error.type === 'entity.parse.failed') {
    response.status(400).json({ error: 'Request body must contain valid JSON.' });
    return;
  }
  if (error.type === 'entity.too.large') {
    response.status(413).json({ error: 'Request body is too large.' });
    return;
  }
  console.error(error);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

function closeDatabase() {
  sessionStore.close();
  database.close();
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, closeDatabase };
