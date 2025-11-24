// Upload routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const metadataStore = require('../storage/metadataStore');
const fileService = require('../services/fileService');
const autoProcessService = require('../services/autoProcessService');
const { logEvent } = require('../../utils/logger');

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * POST /upload-chunk
 * Upload a chunk of encrypted data
 */
router.post('/upload-chunk', upload.single('chunk'), (req, res) => {
  try {
    const fileId = req.body.fileId || req.query.fileId;
    const chunkIndex = req.body.chunkIndex || req.query.chunkIndex;

    if (!fileId || chunkIndex === undefined) {
      logEvent('Bad upload-chunk request: missing fileId or chunkIndex', { bodyKeys: Object.keys(req.body) });
      return res.status(400).json({ error: 'fileId & chunkIndex required' });
    }

    const buffer = req.file ? req.file.buffer : Buffer.from('');
    const chunkPath = fileService.saveChunk(fileId, Number(chunkIndex), buffer);

    logEvent('Uploaded chunk', { fileId, chunkIndex, bytes: buffer.length, path: chunkPath });
    
    // Check if all chunks are present and automatically process the file
    autoProcessService.checkAndProcessFile(fileId);
    
    return res.json({ ok: true, chunkIndex: Number(chunkIndex) });
  } catch (err) {
    logEvent('upload-chunk error', { error: err.message });
    console.error('upload-chunk error', err);
    return res.status(500).json({ error: 'upload failed' });
  }
});

/**
 * POST /complete
 * Store metadata after all chunks are uploaded and automatically decrypt/save the file
 * Body: { fileId, originalName, totalChunks, mediaKeyHex, ivHex, hmacHex, mimeType? }
 */
router.post('/complete', async (req, res) => {
  const { fileId, originalName, totalChunks, mediaKeyHex, ivHex, hmacHex, mimeType } = req.body;
  
  if (!fileId || !originalName || !totalChunks || !mediaKeyHex || !ivHex || !hmacHex) {
    logEvent('Bad /complete request', { body: req.body });
    return res.status(400).json({ error: 'missing fields' });
  }

  // Store metadata
  metadataStore.set(fileId, {
    originalName,
    totalChunks: Number(totalChunks),
    mediaKeyHex,
    ivHex,
    hmacHex,
    mimeType,
  });

  logEvent('File upload complete (metadata stored)', { fileId, originalName, totalChunks });

  // Check if all chunks are already present and automatically process
  autoProcessService.checkAndProcessFile(fileId);

  res.json({ ok: true });
});

module.exports = router;

