/**
 * End-to-End Encryption Service for React Native
 * Handles encryption, compression, and HMAC generation for messages
 */
import { Buffer } from 'buffer';
import { generateMediaKey, generateIV, encrypt, decrypt, computeHMAC, verifyHMAC } from '../utils/crypto';
import { compress, decompress } from '../utils/compression';

/**
 * Convert Buffer to base64 string (React Native compatible)
 */
function bufferToBase64(buffer) {
  // Ensure we have a Buffer
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  
  // Convert buffer to array of bytes
  const bytes = Array.from(buf);
  
  // Convert to binary string
  const binaryString = bytes.map(byte => String.fromCharCode(byte)).join('');
  
  // Use global.btoa for base64 encoding
  return global.btoa(binaryString);
}

/**
 * Convert base64 string to Buffer (React Native compatible)
 */
function base64ToBuffer(base64String) {
  try {
    // Use global.atob for base64 decoding
    const binaryString = global.atob(base64String);
    
    // Convert binary string to bytes
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return Buffer.from(bytes);
  } catch (error) {
    console.error('[EncryptionService] Base64 decode error:', error);
    throw new Error(`Failed to decode base64: ${error.message}`);
  }
}

/**
 * Encrypt and compress data
 * @param {string|Buffer} data - Data to encrypt
 * @param {Buffer} mediaKey - Encryption key (32 bytes)
 * @param {Buffer} iv - Initialization vector (16 bytes)
 * @returns {Object} { ciphertext: Buffer, hmacHex: string }
 */
export function encryptAndCompress(data, mediaKey, iv) {
  try {
    console.log('[EncryptionService] Encrypting and compressing data...');
    
    // Convert string to Buffer if needed
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    
    // 1. Compress
    const compressed = compress(dataBuffer);
    console.log('[EncryptionService] Data compressed:', {
      original: dataBuffer.length,
      compressed: compressed.length,
      ratio: (compressed.length / dataBuffer.length * 100).toFixed(2) + '%'
    });
    
    // 2. Encrypt
    const ciphertext = encrypt(compressed, mediaKey, iv);
    console.log('[EncryptionService] Data encrypted, length:', ciphertext.length);
    
    // 3. Compute HMAC for integrity verification
    const hmacHex = computeHMAC(mediaKey, ciphertext);
    console.log('[EncryptionService] HMAC computed:', hmacHex.substring(0, 16) + '...');
    
    return { ciphertext, hmacHex };
  } catch (error) {
    console.error('[EncryptionService] Encryption failed:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt and decompress data
 * @param {Buffer} ciphertext - Encrypted data
 * @param {Buffer} mediaKey - Decryption key (32 bytes)
 * @param {Buffer} iv - Initialization vector (16 bytes)
 * @param {string} expectedHMAC - Expected HMAC (hex)
 * @returns {Buffer} Decrypted and decompressed data
 * @throws {Error} If HMAC verification fails
 */
export function decryptAndDecompress(ciphertext, mediaKey, iv, expectedHMAC) {
  try {
    console.log('[EncryptionService] Decrypting and decompressing data...');
    
    // 1. Verify HMAC for integrity
    if (!verifyHMAC(mediaKey, ciphertext, expectedHMAC)) {
      throw new Error('HMAC verification failed - data integrity check failed');
    }
    console.log('[EncryptionService] HMAC verified successfully');
    
    // 2. Decrypt
    const compressed = decrypt(ciphertext, mediaKey, iv);
    console.log('[EncryptionService] Data decrypted, length:', compressed.length);
    
    // 3. Decompress
    const original = decompress(compressed);
    console.log('[EncryptionService] Data decompressed, length:', original.length);
    
    return original;
  } catch (error) {
    console.error('[EncryptionService] Decryption failed:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Generate encryption keys for a message
 * @returns {Object} { mediaKey: Buffer, iv: Buffer }
 */
export function generateKeys() {
  return {
    mediaKey: generateMediaKey(),
    iv: generateIV(),
  };
}

/**
 * Encrypt a text message
 * @param {string} message - Plain text message
 * @returns {Object} { encryptedData: string (base64), mediaKey: string (base64), iv: string (base64), hmac: string (hex) }
 */
export function encryptMessage(message) {
  try {
    console.log('[EncryptionService] Encrypting message, length:', message.length);
    
    // Generate keys
    const { mediaKey, iv } = generateKeys();
    
    // Encrypt and compress
    const { ciphertext, hmacHex } = encryptAndCompress(message, mediaKey, iv);
    
    // Convert to base64 for transmission
    return {
      encryptedData: bufferToBase64(ciphertext),
      mediaKey: bufferToBase64(mediaKey),
      iv: bufferToBase64(iv),
      hmac: hmacHex,
    };
  } catch (error) {
    console.error('[EncryptionService] Message encryption failed:', error);
    throw error;
  }
}

/**
 * Decrypt a text message
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @param {string} mediaKey - Base64 encoded media key
 * @param {string} iv - Base64 encoded IV
 * @param {string} hmac - Hex encoded HMAC
 * @returns {string} Decrypted message
 */
export function decryptMessage(encryptedData, mediaKey, iv, hmac) {
  try {
    console.log('[EncryptionService] Decrypting message...');
    
    // Convert from base64
    const ciphertext = base64ToBuffer(encryptedData);
    const keyBuffer = base64ToBuffer(mediaKey);
    const ivBuffer = base64ToBuffer(iv);
    
    // Decrypt and decompress
    const decrypted = decryptAndDecompress(ciphertext, keyBuffer, ivBuffer, hmac);
    
    // Convert to string
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[EncryptionService] Message decryption failed:', error);
    throw error;
  }
}

export default {
  encryptAndCompress,
  decryptAndDecompress,
  generateKeys,
  encryptMessage,
  decryptMessage,
};

