/**
 * Compression utilities for React Native
 * Uses pako for gzip compression/decompression
 */
import pako from 'pako';
import { Buffer } from 'buffer';

/**
 * Compress data using gzip
 * @param {Buffer|string} data - Data to compress
 * @returns {Buffer} Compressed data
 */
export function compress(data) {
  try {
    // Convert to Uint8Array if it's a Buffer or string
    let input;
    if (typeof data === 'string') {
      input = Buffer.from(data, 'utf8');
    } else if (Buffer.isBuffer(data)) {
      input = new Uint8Array(data);
    } else {
      input = data;
    }

    const compressed = pako.gzip(input);
    return Buffer.from(compressed);
  } catch (error) {
    console.error('[Compression] Error compressing data:', error);
    throw new Error(`Compression failed: ${error.message}`);
  }
}

/**
 * Decompress gzip data
 * @param {Buffer|Uint8Array} data - Compressed data
 * @returns {Buffer} Decompressed data
 */
export function decompress(data) {
  try {
    // Convert to Uint8Array if it's a Buffer
    const input = Buffer.isBuffer(data) ? new Uint8Array(data) : data;
    
    const decompressed = pako.ungzip(input);
    return Buffer.from(decompressed);
  } catch (error) {
    console.error('[Compression] Error decompressing data:', error);
    throw new Error(`Decompression failed: ${error.message}`);
  }
}

export default {
  compress,
  decompress,
};

