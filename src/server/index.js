// Server entry point
const http = require('http');
const app = require('./app');
const { SERVER } = require('../config/constants');
const { logEvent } = require('../utils/logger');
const { initializeWebSocket } = require('./services/websocketService');

const PORT = SERVER.PORT;
const HOST = SERVER.HOST;

// Create HTTP server
const httpServer = http.createServer(app);


httpServer.maxConnections = SERVER.MAX_CONNECTIONS;
httpServer.keepAliveTimeout = SERVER.KEEP_ALIVE_TIMEOUT;
httpServer.headersTimeout = SERVER.HEADERS_TIMEOUT;
// Initialize WebSocket
const io = initializeWebSocket(httpServer);

// Start server
httpServer.listen(PORT, HOST, () => {
  logEvent('Media server started', { host: HOST, port: PORT });
  console.log(`Media server listening on http://${HOST}:${PORT}`);
  console.log(`WebSocket server ready for real-time messaging`);
});

