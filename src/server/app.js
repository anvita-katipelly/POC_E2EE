// Main Express application
const express = require('express');
const cors = require('cors');
const { SERVER } = require('../config/constants');
const { UPLOADS_DIR, DECRYPTED_DIR } = require('../config/paths');
const { ensureDirectory } = require('../utils/fileUtils');
const autoProcessService = require('./services/autoProcessService');
const uploadRoutes = require('./routes/uploadRoutes');
const downloadRoutes = require('./routes/downloadRoutes');
const debugRoutes = require('./routes/debugRoutes');

// Initialize directories
ensureDirectory(UPLOADS_DIR);
ensureDirectory(DECRYPTED_DIR);

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: SERVER.JSON_LIMIT }));

// Routes
app.use(uploadRoutes);
app.use(downloadRoutes);
app.use(debugRoutes);

// Background service: periodically check for files ready to process
const MONITOR_INTERVAL = 5000; // Check every 5 seconds
setInterval(() => {
  try {
    const readyFiles = autoProcessService.getFilesReadyForProcessing();
    readyFiles.forEach(fileId => {
      autoProcessService.autoProcessFile(fileId).catch(err => {
        console.error(`Error auto-processing file ${fileId}:`, err.message);
      });
    });
  } catch (err) {
    console.error('Error in background file processor:', err);
  }
}, MONITOR_INTERVAL);

module.exports = app;

