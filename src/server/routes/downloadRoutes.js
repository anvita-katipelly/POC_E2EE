// Download routes
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const metadataStore = require('../storage/metadataStore');
const fileService = require('../services/fileService');
const encryptionService = require('../services/encryptionService');
const { getChunkIndices, ensureDirectory } = require('../../utils/fileUtils');
const { UPLOADS_DIR, DECRYPTED_DIR } = require('../../config/paths');
const { logEvent } = require('../../utils/logger');
const mime = require('mime-types');

/**
 * GET /meta/:fileId
 * Get metadata for a file
 */
router.get('/meta/:fileId', (req, res) => {
  const meta = metadataStore.get(req.params.fileId);
  if (!meta) {
    logEvent('Meta requested - not found', { fileId: req.params.fileId });
    return res.status(404).json({ error: 'not found' });
  }
  res.json(meta);
});

/**
 * GET /download-chunk/:fileId/:index
 * Download a specific chunk
 */
router.get('/download-chunk/:fileId/:index', (req, res) => {
  const { fileId, index } = req.params;
  try {
    const chunkPath = fileService.getChunkFilePath(fileId, index);
    if (!require('fs').existsSync(chunkPath)) {
      logEvent('Chunk requested - not found', { fileId, index });
      return res.status(404).json({ error: 'chunk not found' });
    }
    logEvent('Chunk download', { fileId, index });
    res.sendFile(path.resolve(chunkPath));
  } catch (err) {
    logEvent('Chunk download error', { fileId, index, error: err.message });
    res.status(500).json({ error: 'failed to download chunk' });
  }
});

/**
 * GET /status/:fileId
 * Get upload status (list of received chunks)
 */
router.get('/status/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const fileDir = path.join(UPLOADS_DIR, fileId);
  const meta = metadataStore.get(fileId);
  const received = getChunkIndices(fileDir);
  
  logEvent('Status requested', { fileId, receivedCount: received.length });
  res.json({
    fileId,
    received,
    totalChunks: meta ? meta.totalChunks : null,
  });
});

/**
 * GET /receive/:fileId
 * Receive and decrypt media file
 * Returns the decrypted file as a download
 */
router.get('/receive/:fileId', async (req, res) => {
  const fileId = req.params.fileId;

  try {
    // 1) Fetch metadata
    const meta = metadataStore.get(fileId);
    if (!meta) {
      logEvent('Receive requested - metadata not found', { fileId });
      return res.status(404).json({ error: 'file not found' });
    }

    const { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex, mimeType } = meta;
    logEvent('Receive requested', { fileId, originalName, totalChunks });

    const mediaKey = Buffer.from(mediaKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    // 2) Read and concatenate all chunks
    const ciphertext = fileService.readAllChunksForFile(fileId, totalChunks);

    // Save raw ciphertext to disk (like receiver script does)
    ensureDirectory(DECRYPTED_DIR);
    const ciphertextPath = path.join(DECRYPTED_DIR, `${originalName}.bin`);
    fs.writeFileSync(ciphertextPath, ciphertext);
    logEvent('Saved ciphertext', { fileId, path: ciphertextPath });

    // 3) Decrypt and decompress
    const original = encryptionService.decryptAndDecompress(ciphertext, mediaKey, iv, hmacHex);

    logEvent('File decrypted and decompressed', { fileId, originalBytes: original.length });

    // 4) Save decrypted file to disk (like receiver script does)
    const outPath = path.join(DECRYPTED_DIR, originalName);
    fs.writeFileSync(outPath, original);
    logEvent('File saved locally', { fileId, path: outPath, size: original.length });

    // 5) Return the decrypted file as download
    const contentType = mimeType || mime.lookup(originalName) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
    res.setHeader('Content-Length', original.length);
    res.send(original);

    logEvent('File delivered', { fileId, originalName, size: original.length });
  } catch (err) {
    logEvent('Receive error', { fileId, error: err.message });
    console.error('receive error:', err);
    res.status(500).json({ error: 'failed to decrypt and deliver file', message: err.message });
  }
});

module.exports = router;

