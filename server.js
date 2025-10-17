const express = require('express');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new Database(path.join(__dirname, 'data.db'));

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('hit','miss','start','end')),
  text TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  points INTEGER NOT NULL,
  shots INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Seed messages if empty
const countMessages = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
if (countMessages === 0) {
  const insert = db.prepare('INSERT INTO messages (type, text, weight) VALUES (@type, @text, @weight)');
  const messages = [
    // Hits
    { type: 'hit', text: 'Brick Legend! 🎉', weight: 3 },
    { type: 'hit', text: 'Buckets! 💥', weight: 2 },
    { type: 'hit', text: 'Bank’s open! 🏦', weight: 2 },
    { type: 'hit', text: 'Cold hands, hot bricks. ❄️🧱', weight: 1 },
    { type: 'hit', text: 'Snow net — nothing but ice. 🧊🏀', weight: 1 },
    { type: 'hit', text: 'The BANDITOS approve. 🏴‍☠️', weight: 1 },

    // Misses
    { type: 'miss', text: 'Try Again, Brickmaster! 😅', weight: 3 },
    { type: 'miss', text: 'That’s a wall shot, Davis. 🧱', weight: 2 },
    { type: 'miss', text: 'Air... I mean, Brick! 💨🧱', weight: 2 },
    { type: 'miss', text: 'Graffiti got in your head: "snich bitch" 😜', weight: 1 },
    { type: 'miss', text: 'Snow made it slippery. Sure. 😇', weight: 1 },

    // Starts
    { type: 'start', text: 'Merry Brickmas! 🎄🧱', weight: 1 },

    // Ends
    { type: 'end', text: 'Game Over — Brick Legend! 🏆', weight: 2 },
    { type: 'end', text: 'Game Over — Respect the Brick. 🙏', weight: 1 },
  ];
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(messages);
}

// Middleware
app.use(cors());
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function getWeightedRandomMessage(type) {
  const rows = db.prepare('SELECT id, text, weight FROM messages WHERE type = ?').all(type);
  if (rows.length === 0) return { text: '' };
  const totalWeight = rows.reduce((sum, r) => sum + (r.weight || 1), 0);
  let threshold = Math.random() * totalWeight;
  for (const r of rows) {
    threshold -= (r.weight || 1);
    if (threshold <= 0) return { id: r.id, text: r.text };
  }
  return { id: rows[rows.length - 1].id, text: rows[rows.length - 1].text };
}

// API routes
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/messages/random', (req, res) => {
  const type = (req.query.type || 'hit').toString();
  if (!['hit','miss','start','end'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  const msg = getWeightedRandomMessage(type);
  res.json(msg);
});

app.get('/api/scores/top', (req, res) => {
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10', 10)));
  const rows = db.prepare('SELECT name, points, shots, created_at FROM scores ORDER BY points DESC, created_at ASC LIMIT ?').all(limit);
  res.json(rows);
});

app.post('/api/scores', (req, res) => {
  const { name, points, shots } = req.body || {};
  const cleanName = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 24) : 'Davis';
  const cleanPoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  const cleanShots = Number.isFinite(shots) ? Math.max(0, Math.floor(shots)) : 0;

  const stmt = db.prepare('INSERT INTO scores (name, points, shots) VALUES (?, ?, ?)');
  const info = stmt.run(cleanName, cleanPoints, cleanShots);
  res.status(201).json({ id: info.lastInsertRowid, name: cleanName, points: cleanPoints, shots: cleanShots });
});

// Fallback to index.html for SPA behavior
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Davis BrickShot Challenge server running on http://localhost:${PORT}`);
});