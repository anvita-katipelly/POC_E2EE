// Configuration constants
module.exports = {
  SERVER: {
    PORT: process.env.PORT || 3000,
    HOST: process.env.HOST || '0.0.0.0',
    JSON_LIMIT: '50mb',
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

