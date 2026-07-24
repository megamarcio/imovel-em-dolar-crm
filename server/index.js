// ============================================
// CRM Imóvel em Dólar — servidor único (Express + SQLite)
// Leads (kanban/lista) · WhatsApp via UAZAPI (proxy ao vivo) · Inbox de emails
// (recebidos pelo Email Worker da Cloudflare)
// ============================================
import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleParser } from 'mailparser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'crm.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH_SECRET = process.env.AUTH_SECRET || '';
const UAZAPI_URL = (process.env.UAZAPI_URL || 'https://r3group.uazapi.com').replace(/\/+$/, '');
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || '';
const EMAIL_INBOUND_SECRET = process.env.EMAIL_INBOUND_SECRET || '';
const WA_HOOK_SECRET = process.env.WA_HOOK_SECRET || '';

if (!ADMIN_PASSWORD || !AUTH_SECRET) {
  console.error('ADMIN_PASSWORD e AUTH_SECRET são obrigatórios');
  process.exit(1);
}

// ── DB ──────────────────────────────────────
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS leads(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  stage TEXT DEFAULT 'novo',
  value REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS emails(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT DEFAULT '',
  from_addr TEXT DEFAULT '',
  from_name TEXT DEFAULT '',
  to_addr TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  text TEXT DEFAULT '',
  html TEXT DEFAULT '',
  date TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at);
`);

const STAGES = ['novo', 'contato', 'qualificado', 'proposta', 'ganho', 'perdido'];
const normPhone = (p) => String(p || '').replace(/\D/g, '');

function findLeadByPhone(phone) {
  const p = normPhone(phone);
  if (!p) return null;
  return db.prepare('SELECT * FROM leads WHERE phone=?').get(p) || null;
}
function findLeadByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return db.prepare('SELECT * FROM leads WHERE lower(email)=?').get(e) || null;
}
function createLead({ name = '', phone = '', email = '', source = 'manual', stage = 'novo', value = 0, notes = '' }) {
  const r = db.prepare(`INSERT INTO leads(name,phone,email,source,stage,value,notes) VALUES(?,?,?,?,?,?,?)`)
    .run(String(name).slice(0, 200), normPhone(phone), String(email).trim().toLowerCase().slice(0, 200),
      source, STAGES.includes(stage) ? stage : 'novo', Number(value) || 0, String(notes).slice(0, 5000));
  return db.prepare('SELECT * FROM leads WHERE id=?').get(r.lastInsertRowid);
}

// ── Auth (senha única → cookie assinado) ────
const sign = (v) => crypto.createHmac('sha256', AUTH_SECRET).update(v).digest('hex');
function makeToken() {
  const exp = String(Date.now() + 90 * 24 * 3600 * 1000);
  return exp + '.' + sign(exp);
}
function tokenOk(tok) {
  const [exp, sig] = String(tok || '').split('.');
  if (!exp || !sig) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sign(exp)), Buffer.from(sig))) return false;
  } catch { return false; }
  return Number(exp) > Date.now();
}
function cookieToken(req) {
  const m = /(?:^|;\s*)crm=([^;]+)/.exec(req.headers.cookie || '');
  return m ? m[1] : '';
}

// ── UAZAPI helper ───────────────────────────
async function uaz(pathname, body, method = 'POST') {
  const r = await fetch(UAZAPI_URL + pathname, {
    method,
    headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok) throw new Error(j.message || j.error || ('UAZAPI HTTP ' + r.status));
  return j;
}
const mediaKind = (mt) => {
  const t = String(mt || '').toLowerCase();
  if (t.includes('image')) return 'image';
  if (t.includes('audio') || t.includes('ptt')) return 'audio';
  if (t.includes('video')) return 'video';
  if (t.includes('document')) return 'document';
  if (t.includes('sticker')) return 'sticker';
  return 'text';
};

// ── App ─────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// inbox de email precisa do corpo BRUTO (MIME) — antes do json()
app.post('/api/email/inbound', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  if (!EMAIL_INBOUND_SECRET || req.headers['x-email-secret'] !== EMAIL_INBOUND_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json({ ok: true }); // responde já, processa async
  try {
    const parsed = await simpleParser(req.body);
    const from = parsed.from?.value?.[0] || {};
    const to = String(req.headers['x-envelope-to'] || parsed.to?.text || '');
    db.prepare(`INSERT INTO emails(message_id,from_addr,from_name,to_addr,subject,text,html,date)
      VALUES(?,?,?,?,?,?,?,?)`).run(
      parsed.messageId || '', (from.address || '').toLowerCase(), from.name || '', to,
      parsed.subject || '(sem assunto)', parsed.text || '', parsed.html || '',
      parsed.date ? parsed.date.toISOString() : new Date().toISOString());
    if (from.address && !findLeadByEmail(from.address)) {
      createLead({ name: from.name || from.address, email: from.address, source: 'email' });
    }
    console.log(`📧 email de ${from.address}: ${parsed.subject}`);
  } catch (e) { console.error('[email/inbound]', e.message); }
});

app.use(express.json({ limit: '2mb' }));

// webhook UAZAPI (público, protegido por segredo na URL)
app.post('/api/wa/webhook/:secret', (req, res) => {
  res.json({ ok: true });
  try {
    if (!WA_HOOK_SECRET || req.params.secret !== WA_HOOK_SECRET) return;
    const body = req.body || {};
    let m = body.message || body.data || null;
    if (!m && Array.isArray(body.messages) && body.messages.length) m = body.messages[0];
    if (!m) m = body;
    const chatId = String(m.chatid || m.chat || m.remoteJid || m.key?.remoteJid || '');
    if (!chatId || chatId.includes('@g.us') || m.isGroup) return; // só DM
    if (m.fromMe) return;
    const evt = String(body.event || body.type || body.EventType || '').toLowerCase();
    if (evt.includes('reaction') || m.reactionMessage || m.reaction) return;
    const phone = normPhone(chatId.split('@')[0]);
    if (!phone) return;
    if (!findLeadByPhone(phone)) {
      const name = m.senderName || m.pushName || phone;
      createLead({ name, phone, source: 'whatsapp' });
      console.log(`🟢 lead novo via WhatsApp: ${name} (${phone})`);
    }
  } catch (e) { console.error('[wa/webhook]', e.message); }
});

// login / auth
app.post('/api/login', (req, res) => {
  if (String(req.body?.password || '') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'senha incorreta' });
  }
  res.setHeader('Set-Cookie', `crm=${makeToken()}; HttpOnly; Path=/; Max-Age=${90 * 24 * 3600}; SameSite=Lax; Secure`);
  res.json({ ok: true });
});
app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'crm=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// tudo abaixo exige login
app.use('/api', (req, res, next) => {
  if (tokenOk(cookieToken(req))) return next();
  res.status(401).json({ error: 'não autenticado' });
});
app.get('/api/me', (_req, res) => res.json({ ok: true }));

// ── Leads ───────────────────────────────────
app.get('/api/leads', (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(`SELECT * FROM leads WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR notes LIKE ?
      ORDER BY updated_at DESC LIMIT 500`).all(like, like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM leads ORDER BY updated_at DESC LIMIT 500').all();
  }
  res.json({ leads: rows, stages: STAGES });
});
app.post('/api/leads', (req, res) => {
  const lead = createLead(req.body || {});
  res.json({ lead });
});
app.patch('/api/leads/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM leads WHERE id=?').get(id);
  if (!cur) return res.status(404).json({ error: 'lead não encontrado' });
  const b = req.body || {};
  const next = {
    name: b.name !== undefined ? String(b.name).slice(0, 200) : cur.name,
    phone: b.phone !== undefined ? normPhone(b.phone) : cur.phone,
    email: b.email !== undefined ? String(b.email).trim().toLowerCase().slice(0, 200) : cur.email,
    source: b.source !== undefined ? String(b.source).slice(0, 50) : cur.source,
    stage: b.stage !== undefined && STAGES.includes(b.stage) ? b.stage : cur.stage,
    value: b.value !== undefined ? (Number(b.value) || 0) : cur.value,
    notes: b.notes !== undefined ? String(b.notes).slice(0, 5000) : cur.notes,
  };
  db.prepare(`UPDATE leads SET name=?,phone=?,email=?,source=?,stage=?,value=?,notes=?,updated_at=datetime('now') WHERE id=?`)
    .run(next.name, next.phone, next.email, next.source, next.stage, next.value, next.notes, id);
  res.json({ lead: db.prepare('SELECT * FROM leads WHERE id=?').get(id) });
});
app.delete('/api/leads/:id', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── WhatsApp (proxy UAZAPI) ─────────────────
app.get('/api/wa/status', async (_req, res) => {
  try {
    const r = await uaz('/instance/status', null, 'GET');
    res.json({
      connected: !!r.status?.connected,
      owner: r.instance?.owner || '',
      profileName: r.instance?.profileName || '',
      qrcode: r.instance?.qrcode || '',
    });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/wa/connect', async (_req, res) => {
  try {
    const r = await uaz('/instance/connect', {});
    res.json({ qrcode: r.instance?.qrcode || r.qrcode || '', connected: !!r.connected });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/wa/chats', async (_req, res) => {
  try {
    const r = await uaz('/chat/find', { limit: 100, sort: '-wa_lastMsgTimestamp' });
    const arr = Array.isArray(r) ? r : (r.chats || r.data || []);
    const chats = arr.map((c) => {
      const chatid = c.wa_chatid || c.id || '';
      return {
        chatid,
        name: c.wa_contactName || c.name || c.lead_name || c.wa_name || chatid.split('@')[0],
        image: c.imagePreview || c.image || '',
        isGroup: !!c.wa_isGroup,
        lastText: c.wa_lastMessageTextVote || '',
        ts: Number(c.wa_lastMsgTimestamp) || 0,
        unread: Number(c.wa_unreadCount) || 0,
        phone: chatid.split('@')[0],
      };
    }).filter((c) => !c.isGroup);
    res.json({ chats });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/wa/messages', async (req, res) => {
  try {
    const chatid = String(req.query.chatid || '');
    if (!chatid) return res.status(400).json({ error: 'chatid obrigatório' });
    const r = await uaz('/message/find', { chatid, limit: Number(req.query.limit) || 50 });
    const arr = Array.isArray(r) ? r : (r.messages || r.data || []);
    const messages = arr.map((m) => ({
      id: m.messageid || m.id || '',
      fromMe: !!m.fromMe,
      text: m.text || m.content?.text || m.caption || '',
      kind: mediaKind(m.messageType || m.type),
      fileURL: m.fileURL || '',
      senderName: m.senderName || '',
      ts: Number(m.messageTimestamp) || 0,
    })).sort((a, b) => a.ts - b.ts);
    res.json({ messages });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/wa/send', async (req, res) => {
  try {
    const { chatid, text } = req.body || {};
    if (!chatid || !text) return res.status(400).json({ error: 'chatid e text obrigatórios' });
    const r = await uaz('/send/text', { number: chatid, text: String(text) });
    // garante lead pro contato
    const phone = normPhone(String(chatid).split('@')[0]);
    if (phone && !findLeadByPhone(phone)) createLead({ name: phone, phone, source: 'whatsapp' });
    res.json({ ok: true, id: r.messageid || r.id || '' });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ── Emails ──────────────────────────────────
app.get('/api/emails', (_req, res) => {
  const rows = db.prepare(`SELECT id,from_addr,from_name,to_addr,subject,date,created_at,
    substr(text,1,140) AS preview FROM emails ORDER BY id DESC LIMIT 300`).all();
  res.json({ emails: rows });
});
app.get('/api/emails/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM emails WHERE id=?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'não encontrado' });
  res.json({ email: row });
});
app.delete('/api/emails/:id', (req, res) => {
  db.prepare('DELETE FROM emails WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── SPA estática ────────────────────────────
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, () => console.log(`CRM Imóvel em Dólar na porta ${PORT}`));
