// Encryption and decryption service
const zlib = require('zlib');
const { createCipher, createDecipher, createHMAC, verifyHMAC } = require('../../utils/crypto');

/**
 * Encrypt and compress data
 * @param {Buffer} data - Data to encrypt
 * @param {Buffer} mediaKey - Encryption key
 * @param {Buffer} iv - Initialization vector
 * @returns {Object} { ciphertext: Buffer, hmac: string }
 */
function encryptAndCompress(data, mediaKey, iv) {
  // Compress
  const compressed = zlib.gzipSync(data);

  // Encrypt
  const cipher = createCipher(mediaKey, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);

  // Compute HMAC
  const hmac = createHMAC(mediaKey);
  hmac.update(ciphertext);
  const hmacHex = hmac.digest('hex');

  return { ciphertext, hmacHex };
}

/**
 * Decrypt and decompress data
 * @param {Buffer} ciphertext - Encrypted data
 * @param {Buffer} mediaKey - Decryption key
 * @param {Buffer} iv - Initialization vector
 * @param {string} expectedHMAC - Expected HMAC (hex)
 * @returns {Buffer} Decrypted and decompressed data
 * @throws {Error} If HMAC verification fails
 */
function decryptAndDecompress(ciphertext, mediaKey, iv, expectedHMAC) {
  // Verify HMAC
  if (!verifyHMAC(mediaKey, ciphertext, expectedHMAC)) {
    throw new Error('HMAC verification failed - data integrity check failed');
  }

  // Decrypt
  const decipher = createDecipher(mediaKey, iv);
  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Decompress
  const original = zlib.gunzipSync(compressed);

  return original;
}

module.exports = {
  encryptAndCompress,
  decryptAndDecompress,
};

