// server.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${file.originalname}`)
});
const upload = multer({ storage });

// In-memory key store: filename -> mediaKeyHex
const keyStore = {};

// Upload encrypted file
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no file' });
  const filename = req.file.filename;
  // For remote callers, use host header so URL works from other devices
  const host = req.get('host');
  const proto = req.protocol;
  const url = `${proto}://${host}/uploads/${filename}`;
  res.json({ ok: true, filename, url });
});

// Store plaintext media key (INSECURE: server stores key)
app.post('/store-key', (req, res) => {
  const { filename, mediaKeyHex } = req.body;
  if (!filename || !mediaKeyHex) return res.status(400).json({ ok: false, error: 'filename & mediaKeyHex required' });
  keyStore[filename] = mediaKeyHex;
  res.json({ ok: true, msg: 'key stored' });
});

// Get plaintext media key (INSECURE)
app.get('/get-key', (req, res) => {
  const filename = `${req.query.filename}.bin`;
  console.log('Key store',keyStore);
  if (!filename || !keyStore[filename]) return res.status(404).json({ ok: false, error: 'key not found' });
  res.json({ ok: true, mediaKeyHex: keyStore[filename] });
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

app.listen(PORT, () => {
  console.log(`Media server + key-store listening at http://0.0.0.0:${PORT}`);
});
