// Configuration constants
module.exports = {
SERVER: {
    PORT: process.env.PORT || 3000,
    HOST: process.env.HOST || '0.0.0.0',
    JSON_LIMIT: '50mb',
    MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS) || 100000, // Max concurrent connections
    KEEP_ALIVE_TIMEOUT: parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 65000, // 65 seconds
    HEADERS_TIMEOUT: parseInt(process.env.HEADERS_TIMEOUT) || 66000, // 66 seconds
  },
  WEBSOCKET: {
    PING_TIMEOUT: parseInt(process.env.WS_PING_TIMEOUT) || 60000, // 60 seconds
    PING_INTERVAL: parseInt(process.env.WS_PING_INTERVAL) || 25000, // 25 seconds
    MAX_HTTP_BUFFER_SIZE: parseInt(process.env.WS_MAX_BUFFER) || 1e8, // 100MB
    CONNECT_TIMEOUT: parseInt(process.env.WS_CONNECT_TIMEOUT) || 45000, // 45 seconds
  },
  UPLOAD: {
    CHUNK_SIZE: 512 * 1024, // 512 KB
    MAX_RETRIES: 5,
    RETRY_BASE_MS: 300,
    TIMEOUT: 15000,
  },
  CRYPTO: {
    ALGORITHM: 'aes-256-cbc',
    KEY_SIZE: 32, // bytes
    IV_SIZE: 16, // bytes
    HMAC_ALGORITHM: 'sha256',
    HMAC_SIZE: 32, // bytes
  },
  COMPRESSION: {
    ALGORITHM: 'gzip',
  },
};

