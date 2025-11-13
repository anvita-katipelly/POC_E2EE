// Logging utility
function logEvent(msg, meta = {}) {
  const ts = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
  console.log(`[${ts}] ${msg}`, metaStr);
}

function log(msg, meta = {}) {
  logEvent(msg, meta);
}

module.exports = {
  logEvent,
  log,
};

