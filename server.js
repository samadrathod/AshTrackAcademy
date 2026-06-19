const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

// ── Database setup ────────────────────────────────────────
const db = new Database('academy.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL UNIQUE,
    email     TEXT    NOT NULL UNIQUE,
    password  TEXT    NOT NULL,
    role      TEXT    NOT NULL DEFAULT 'student',
    full_name TEXT    NOT NULL DEFAULT '',
    created_at TEXT   DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions_store (
    sid     TEXT PRIMARY KEY,
    sess    TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
`);

// Seed a default admin account if none exists
const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!existingAdmin) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password, role, full_name)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', 'admin@ashtrackacademy.edu', hash, 'admin', 'Administrator');
}

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'ashtrack-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ── API routes ────────────────────────────────────────────

// Get current session user
app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = db.prepare(
    'SELECT id, username, email, role, full_name, created_at FROM users WHERE id = ?'
  ).get(req.session.userId);
  res.json({ user: user || null });
});

// Register
app.post('/api/register', (req, res) => {
  const { username, email, password, role, full_name } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required.' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const validRoles = ['student', 'teacher', 'admin'];
  const userRole = validRoles.includes(role) ? role : 'student';

  const existing = db.prepare(
    'SELECT id FROM users WHERE username = ? OR email = ?'
  ).get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already in use.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, email, password, role, full_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, email, hash, userRole, full_name || username);

  req.session.userId = result.lastInsertRowid;
  req.session.role = userRole;

  const user = db.prepare(
    'SELECT id, username, email, role, full_name, created_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json({ user });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ? OR email = ?'
  ).get(username, username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      created_at: user.created_at
    }
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Update profile (authenticated)
app.put('/api/me', requireAuth, (req, res) => {
  const { full_name, email } = req.body;
  if (!full_name && !email) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const newName = full_name || user.full_name;
  const newEmail = email || user.email;

  db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?')
    .run(newName, newEmail, req.session.userId);

  const updated = db.prepare(
    'SELECT id, username, email, role, full_name, created_at FROM users WHERE id = ?'
  ).get(req.session.userId);
  res.json({ user: updated });
});

// Change password (authenticated)
app.put('/api/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password are required.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !bcrypt.compareSync(current_password, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.session.userId);
  res.json({ ok: true });
});

// Admin: list all users
app.get('/api/admin/users', requireAuth, (req, res) => {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only.' });
  }
  const users = db.prepare(
    'SELECT id, username, email, role, full_name, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json({ users });
});

// Fallback: serve index.html for unknown paths (nice 404 experience)
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AshTrack Academy server running on http://0.0.0.0:${PORT}`);
});
