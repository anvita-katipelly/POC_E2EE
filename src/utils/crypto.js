// // Cryptographic utilities
// const crypto = require('crypto');
// const { CRYPTO } = require('../config/constants');

// /**
//  * Generate a random media key
//  * @returns {Buffer} 32-byte key
//  */
// function generateMediaKey() {
//   return crypto.randomBytes(CRYPTO.KEY_SIZE);
// }

// /**
//  * Generate a random IV
//  * @returns {Buffer} 16-byte IV
//  */
// function generateIV() {
//   return crypto.randomBytes(CRYPTO.IV_SIZE);
// }

// /**
//  * Create a cipher for encryption
//  * @param {Buffer} key - Media key
//  * @param {Buffer} iv - Initialization vector
//  * @returns {Object} Cipher stream
//  */
// function createCipher(key, iv) {
//   return crypto.createCipheriv(CRYPTO.ALGORITHM, key, iv);
// }

// /**
//  * Create a decipher for decryption
//  * @param {Buffer} key - Media key
//  * @param {Buffer} iv - Initialization vector
//  * @returns {Object} Decipher stream
//  */
// function createDecipher(key, iv) {
//   return crypto.createDecipheriv(CRYPTO.ALGORITHM, key, iv);
// }

// /**
//  * Create HMAC instance
//  * @param {Buffer} key - Media key
//  * @returns {Object} HMAC instance
//  */
// function createHMAC(key) {
//   return crypto.createHmac(CRYPTO.HMAC_ALGORITHM, key);
// }

// /**
//  * Compute HMAC digest
//  * @param {Buffer} key - Media key
//  * @param {Buffer} data - Data to hash
//  * @returns {string} Hex-encoded HMAC
//  */
// function computeHMAC(key, data) {
//   return crypto.createHmac(CRYPTO.HMAC_ALGORITHM, key).update(data).digest('hex');
// }

// /**
//  * Verify HMAC
//  * @param {Buffer} key - Media key
//  * @param {Buffer} data - Data to verify
//  * @param {string} expectedHMAC - Expected HMAC (hex)
//  * @returns {boolean} True if HMAC matches
//  */
// function verifyHMAC(key, data, expectedHMAC) {
//   const computed = computeHMAC(key, data);
//   return computed === expectedHMAC;
// }

// module.exports = {
//   generateMediaKey,
//   generateIV,
//   createCipher,
//   createDecipher,
//   createHMAC,
//   computeHMAC,
//   verifyHMAC,
// };

