// Server entry point
const app = require('./app');
const { SERVER } = require('../config/constants');
const { logEvent } = require('../utils/logger');

const PORT = SERVER.PORT;
const HOST = SERVER.HOST;

app.listen(PORT, HOST, () => {
  logEvent('Media server started', { host: HOST, port: PORT });
  console.log(`Media server listening on http://${HOST}:${PORT}`);
});

