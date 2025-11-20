/**
 * Cryptographic utilities for React Native E2EE
 * Uses react-native-quick-crypto for AES-256-CBC encryption
 */
import { Buffer } from 'buffer';
import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'react-native-quick-crypto';

// Constants matching server configuration
const CRYPTO = {
  ALGORITHM: 'aes-256-cbc',
  KEY_SIZE: 32, // bytes
  IV_SIZE: 16, // bytes
  HMAC_ALGORITHM: 'sha256',
  HMAC_SIZE: 32, // bytes
};

/**
 * Generate a random media key
 * @returns {Buffer} 32-byte key
 */
export function generateMediaKey() {
  return randomBytes(CRYPTO.KEY_SIZE);
}

/**
 * Generate a random IV (Initialization Vector)
 * @returns {Buffer} 16-byte IV
 */
export function generateIV() {
  return randomBytes(CRYPTO.IV_SIZE);
}

/**
 * Create a cipher for encryption
 * @param {Buffer} key - Media key
 * @param {Buffer} iv - Initialization vector
 * @returns {Object} Cipher stream
 */
export function createCipher(key, iv) {
  return createCipheriv(CRYPTO.ALGORITHM, key, iv);
}

/**
 * Create a decipher for decryption
 * @param {Buffer} key - Media key
 * @param {Buffer} iv - Initialization vector
 * @returns {Object} Decipher stream
 */
export function createDecipher(key, iv) {
  return createDecipheriv(CRYPTO.ALGORITHM, key, iv);
}

/**
 * Create HMAC instance
 * @param {Buffer} key - Media key
 * @returns {Object} HMAC instance
 */
export function createHMAC(key) {
  return createHmac(CRYPTO.HMAC_ALGORITHM, key);
}

/**
 * Compute HMAC digest
 * @param {Buffer} key - Media key
 * @param {Buffer} data - Data to hash
 * @returns {string} Hex-encoded HMAC
 */
export function computeHMAC(key, data) {
  return createHmac(CRYPTO.HMAC_ALGORITHM, key).update(data).digest('hex');
}

/**
 * Verify HMAC
 * @param {Buffer} key - Media key
 * @param {Buffer} data - Data to verify
 * @param {string} expectedHMAC - Expected HMAC (hex)
 * @returns {boolean} True if HMAC matches
 */
export function verifyHMAC(key, data, expectedHMAC) {
  const computed = computeHMAC(key, data);
  return computed === expectedHMAC;
}

/**
 * Encrypt data
 * @param {Buffer} data - Data to encrypt
 * @param {Buffer} key - Encryption key
 * @param {Buffer} iv - Initialization vector
 * @returns {Buffer} Encrypted data
 */
export function encrypt(data, key, iv) {
  const cipher = createCipher(key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * Decrypt data
 * @param {Buffer} ciphertext - Encrypted data
 * @param {Buffer} key - Decryption key
 * @param {Buffer} iv - Initialization vector
 * @returns {Buffer} Decrypted data
 */
export function decrypt(ciphertext, key, iv) {
  const decipher = createDecipher(key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export default {
  generateMediaKey,
  generateIV,
  createCipher,
  createDecipher,
  createHMAC,
  computeHMAC,
  verifyHMAC,
  encrypt,
  decrypt,
  CRYPTO,
};

