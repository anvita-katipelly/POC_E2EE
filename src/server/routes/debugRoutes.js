// Debug routes
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../../config/paths');
const { logEvent } = require('../../utils/logger');

/**
 * GET /list/:fileId
 * List all chunks for a file (debug endpoint)
 */
router.get('/list/:fileId', (req, res) => {
  const fileDir = path.join(UPLOADS_DIR, req.params.fileId);
  if (!fs.existsSync(fileDir)) {
    return res.status(404).json({ error: 'not found' });
  }
  const files = fs.readdirSync(fileDir).filter(f => f.endsWith('.chunk')).sort();
  res.json({ files });
});

/**
 * GET /list-files
 * List all available files (fileIds with metadata)
 */
router.get('/list-files', (req, res) => {
  const metadataStore = require('../storage/metadataStore');
  const { getChunkIndices } = require('../../utils/fileUtils');
  const { UPLOADS_DIR } = require('../../config/paths');
  
  const allFileIds = metadataStore.getAllFileIds();
  const files = allFileIds.map(fileId => {
    const meta = metadataStore.get(fileId);
    const fileDir = path.join(UPLOADS_DIR, fileId);
    const receivedChunks = getChunkIndices(fileDir);
    const isComplete = meta && receivedChunks.length === meta.totalChunks;
    
    return {
      fileId,
      originalName: meta?.originalName,
      totalChunks: meta?.totalChunks,
      receivedChunks: receivedChunks.length,
      isComplete,
      createdAt: meta?.createdAt,
    };
  });
  
  res.json({ files });
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

module.exports = router;

