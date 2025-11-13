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
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

module.exports = router;

