// Upload routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const metadataStore = require('../storage/metadataStore');
const fileService = require('../services/fileService');
const encryptionService = require('../services/encryptionService');
const { ensureDirectory } = require('../../utils/fileUtils');
const { DECRYPTED_DIR } = require('../../config/paths');
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
 * Body: { fileId, originalName, totalChunks, mediaKeyHex, ivHex, hmacHex }
 */
router.post('/complete', async (req, res) => {
  const { fileId, originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = req.body;
  
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
  });

  logEvent('File upload complete (metadata stored)', { fileId, originalName, totalChunks });

  // Automatically decrypt and save the file (background processing)
  try {
    const mediaKey = Buffer.from(mediaKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    // Read and concatenate all chunks
    const ciphertext = fileService.readAllChunksForFile(fileId, Number(totalChunks));

    // Save raw ciphertext to disk
    ensureDirectory(DECRYPTED_DIR);
    const ciphertextPath = path.join(DECRYPTED_DIR, `${originalName}.bin`);
    fs.writeFileSync(ciphertextPath, ciphertext);
    logEvent('Saved ciphertext', { fileId, path: ciphertextPath });

    // Decrypt and decompress
    const original = encryptionService.decryptAndDecompress(ciphertext, mediaKey, iv, hmacHex);
    logEvent('File decrypted and decompressed', { fileId, originalBytes: original.length });

    // Save decrypted file to disk
    const outPath = path.join(DECRYPTED_DIR, originalName);
    fs.writeFileSync(outPath, original);
    logEvent('File automatically saved', { fileId, path: outPath, size: original.length });
  } catch (err) {
    // Log error but don't fail the request - metadata is already stored
    logEvent('Auto-decrypt failed (file can still be retrieved via /receive)', {
      fileId,
      error: err.message,
    });
    console.error('Auto-decrypt error:', err);
  }

  res.json({ ok: true });
});

module.exports = router;

