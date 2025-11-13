// server.js
// Media server for chunked encrypted uploads
// Accepts form-data chunk uploads (suitable for Postman), exposes status endpoint
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '50mb' }));

const UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

// In-memory metadata store (POC). For production use persistent DB.
const metadataStore = {}; // fileId -> { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex }
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Logging helper
function logEvent(msg, meta = {}) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, Object.keys(meta).length ? meta : '');
}

// Upload chunk via form-data or raw
// POST /upload-chunk
// form-data fields: fileId, chunkIndex (string/number), chunk (file)
app.post('/upload-chunk', upload.single('chunk'), (req, res) => {
  try {
    const fileId = req.body.fileId || req.query.fileId;
    const chunkIndex = req.body.chunkIndex || req.query.chunkIndex;

    if (!fileId || chunkIndex === undefined) {
      logEvent('Bad upload-chunk request: missing fileId or chunkIndex', { bodyKeys: Object.keys(req.body) });
      return res.status(400).json({ error: 'fileId & chunkIndex required' });
    }

    const fileDir = path.join(UPLOADS, fileId);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

    // Accept either form file in req.file, or raw body (not typical with multer) - Postman uses form-data so req.file exists.
    const buffer = req.file ? req.file.buffer : Buffer.from('');
    const chunkPath = path.join(fileDir, `${chunkIndex}.chunk`);
    fs.writeFileSync(chunkPath, buffer);

    logEvent('Uploaded chunk', { fileId, chunkIndex, bytes: buffer.length, path: chunkPath });
    return res.json({ ok: true, chunkIndex: Number(chunkIndex) });
  } catch (err) {
    console.error('upload-chunk error', err);
    return res.status(500).json({ error: 'upload failed' });
  }
});

// POST /complete - store metadata after all chunks uploaded
// body: { fileId, originalName, totalChunks, mediaKeyHex, ivHex, hmacHex }
app.post('/complete', (req, res) => {
  const { fileId, originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = req.body;
  if (!fileId || !originalName || !totalChunks || !mediaKeyHex || !ivHex || !hmacHex) {
    logEvent('Bad /complete request', { body: req.body });
    return res.status(400).json({ error: 'missing fields' });
  }
  metadataStore[fileId] = { originalName, totalChunks: Number(totalChunks), mediaKeyHex, ivHex, hmacHex, createdAt: new Date().toISOString() };
  logEvent('File upload complete (metadata stored)', { fileId, originalName, totalChunks });
  res.json({ ok: true });
});

// GET /meta/:fileId
app.get('/meta/:fileId', (req, res) => {
  const meta = metadataStore[req.params.fileId];
  if (!meta) {
    logEvent('Meta requested - not found', { fileId: req.params.fileId });
    return res.status(404).json({ error: 'not found' });
  }
  res.json(meta);
});

// GET /download-chunk/:fileId/:index
app.get('/download-chunk/:fileId/:index', (req, res) => {
  const { fileId, index } = req.params;
  const chunkPath = path.join(UPLOADS, fileId, `${index}.chunk`);
  if (!fs.existsSync(chunkPath)) {
    logEvent('Chunk requested - not found', { fileId, index });
    return res.status(404).json({ error: 'chunk not found' });
  }
  logEvent('Chunk download', { fileId, index });
  res.sendFile(chunkPath);
});

// GET /status/:fileId
// returns list of received chunk indices and totalChunks if metadata present
app.get('/status/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const dir = path.join(UPLOADS, fileId);
  const meta = metadataStore[fileId] || null;
  let received = [];
  if (fs.existsSync(dir)) {
    received = fs.readdirSync(dir)
      .filter(f => f.endsWith('.chunk'))
      .map(f => Number(f.replace('.chunk', '')))
      .sort((a,b) => a-b);
  }
  logEvent('Status requested', { fileId, receivedCount: received.length });
  res.json({ fileId, received, totalChunks: meta ? meta.totalChunks : null });
});

// GET /list/:fileId (debug)
app.get('/list/:fileId', (req, res) => {
  const dir = path.join(UPLOADS, req.params.fileId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'not found' });
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.chunk')).sort();
  res.json({ files });
});

// Simple health
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Media server listening on http://0.0.0.0:${PORT}`));
