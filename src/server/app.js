// Main Express application
const express = require('express');
const cors = require('cors');
const { SERVER } = require('../config/constants');
const { UPLOADS_DIR, DECRYPTED_DIR } = require('../config/paths');
const { ensureDirectory } = require('../utils/fileUtils');
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

module.exports = app;

