// server/index.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');
const moderation = require('./moderation');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// init DB (ensures tables exist)
(async()=>{ try{ await db.init(); } catch(e){ console.error('DB init error', e); } })();

// Admin credentials (read from env)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'lantern-admin-demo-CHANGE_ME';
let runtimeAutoPublish = (process.env.AUTO_PUBLISH || 'false').toLowerCase() === 'true';

// Serve public static files and admin static
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/admin-static', express.static(path.join(__dirname, '..', 'admin')));

// --------- Public API ----------
// Get published posts (public)
app.get('/api/public/posts', async (req, res) => {
  const channel = req.query.channel || null;
  try {
    const posts = await db.getPublishedPosts(channel);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Create post (anonymous)
app.post('/api/posts', moderation.rateLimitMiddleware, async (req, res) => {
  try {
    const { text, channel } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    const flagged = moderation.checkForFlags(text);
    const state = flagged ? 'held' : (runtimeAutoPublish ? 'published' : 'held');
    const post = await db.createPost({ text: text.trim(), channel: channel || 'confess-here', state });
    res.json({ ok: true, post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Add reaction
app.post('/api/reactions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { kind } = req.body || {};
    if (!kind) return res.status(400).json({ error: 'kind required' });
    const post = await db.addReaction(id, kind);
    res.json({ ok: true, post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Report post
app.post('/api/report/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await db.flagPostForReview(id, 'reported by user');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// --------- Admin auth (HTTP Basic or X-Admin-Pass fallback) ----------
function adminAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (header && header.startsWith('Basic ')) {
    try {
      const b = Buffer.from(header.split(' ')[1], 'base64').toString('utf8'); // "user:pass"
      const [user, pass] = b.split(':');
      if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
    } catch(e){ /* fallthrough */ }
  }
  // fallback: allow header x-admin-pass for legacy clients
  const pass = req.headers['x-admin-pass'] || req.query.admin_pass;
  if (pass === ADMIN_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Lantern Admin"');
  return res.status(401).json({ error: 'unauthorized' });
}

// Admin: list all posts
app.get('/api/admin/posts', adminAuth, async (req, res) => {
  try {
    const posts = await db.getAllPosts();
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Admin: update post (state/text)
app.patch('/api/admin/posts/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { state, text } = req.body || {};
    const updated = await db.updatePost(id, { state, text });
    await db.logAudit({ action: 'update_post', target: id, details: { state, text } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Admin: delete post
app.delete('/api/admin/posts/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    await db.deletePost(id);
    await db.logAudit({ action: 'delete_post', target: id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Admin: toggle runtime auto-publish (in-memory)
app.post('/api/admin/toggle-auto-publish', adminAuth, (req, res) => {
  runtimeAutoPublish = !runtimeAutoPublish;
  res.json({ ok: true, autoPublish: runtimeAutoPublish });
});

// Admin: export posts
app.get('/api/admin/export', adminAuth, async (req, res) => {
  try {
    const posts = await db.getAllPosts();
    res.setHeader('Content-Disposition', 'attachment; filename="lantern_posts.json"');
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// health
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on', PORT));
