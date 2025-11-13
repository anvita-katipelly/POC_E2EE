// autoReceiver.js
// Automatically monitors server and downloads/decrypts files when chunks are complete
// Usage: node src/client/autoReceiver.js <server_base>
// Example: node src/client/autoReceiver.js http://localhost:3000

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { DECRYPTED_DIR } = require('../config/paths');
const { ensureDirectory } = require('../utils/fileUtils');
const { verifyHMAC, createDecipher } = require('../utils/crypto');
const zlib = require('zlib');
const { log } = require('../utils/logger');
const { UPLOAD } = require('../config/constants');

const SERVER = process.argv[2] || 'http://localhost:3000';
const POLL_INTERVAL = 5000; // Check every 5 seconds
const MAX_RETRIES = UPLOAD.MAX_RETRIES;
const RETRY_BASE_MS = UPLOAD.RETRY_BASE_MS;

// Track processed files to avoid reprocessing
const processedFiles = new Set();

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Chunk download function with retry
async function downloadChunkWithRetry(fileId, chunkIndex) {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const resp = await axios.get(`${SERVER}/download-chunk/${fileId}/${chunkIndex}`, {
        responseType: 'arraybuffer',
        timeout: UPLOAD.TIMEOUT,
      });
      const buf = Buffer.from(resp.data);
      return buf;
    } catch (err) {
      attempt++;
      const wait = RETRY_BASE_MS * Math.pow(2, attempt);
      log('Chunk download failed, retrying', {
        fileId,
        chunkIndex,
        attempt,
        err: err.message,
        waitMs: wait,
      });
      await sleep(wait);
    }
  }
  throw new Error(`Failed to download chunk ${chunkIndex} after ${MAX_RETRIES} attempts`);
}

// Process a file: download chunks, decrypt, and save
async function processFile(fileId) {
  if (processedFiles.has(fileId)) {
    return; // Already processed
  }

  try {
    // 1) Fetch metadata
    const metaResp = await axios.get(`${SERVER}/meta/${fileId}`);
    const meta = metaResp.data;
    const { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = meta;
    
    log('Processing file', { fileId, originalName, totalChunks });

    const mediaKey = Buffer.from(mediaKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    // 2) Download and concatenate ciphertext chunks with retry
    const chunks = [];
    let totalBytes = 0;
    for (let i = 0; i < totalChunks; i++) {
      const buf = await downloadChunkWithRetry(fileId, i);
      chunks.push(buf);
      totalBytes += buf.length;
      log('Downloaded chunk', { fileId, chunkIndex: i, bytes: buf.length });
    }
    const ciphertext = Buffer.concat(chunks, totalBytes);

    // Save raw ciphertext to disk
    ensureDirectory(DECRYPTED_DIR);
    const ciphertextPath = path.join(DECRYPTED_DIR, `${originalName}.bin`);
    fs.writeFileSync(ciphertextPath, ciphertext);
    log('Saved ciphertext', { fileId, path: ciphertextPath });

    // 3) Verify HMAC
    if (!verifyHMAC(mediaKey, ciphertext, hmacHex)) {
      throw new Error('HMAC mismatch! data integrity failed.');
    }
    log('HMAC verified OK', { fileId });

    // 4) Decrypt ciphertext (AES-256-CBC)
    const decipher = createDecipher(mediaKey, iv);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    log('Decrypted', { fileId, compressedBytes: compressed.length });

    // 5) Decompress (gunzip)
    const original = zlib.gunzipSync(compressed);
    const outPath = path.join(DECRYPTED_DIR, originalName);
    fs.writeFileSync(outPath, original);
    log('File automatically saved', { fileId, path: outPath, size: original.length });

    // Mark as processed
    processedFiles.add(fileId);
    console.log(`\n✓ File automatically recovered: ${outPath}`);
  } catch (err) {
    log('Error processing file', { fileId, error: err.message });
    // Don't mark as processed if it failed - will retry next time
  }
}

// Check for new complete files on server and process them
async function checkForNewFiles() {
  try {
    // Get list of all available files from server
    const resp = await axios.get(`${SERVER}/list-files`);
    const { files } = resp.data;
    
    // Process files that are complete and not yet processed
    for (const file of files) {
      if (file.isComplete && !processedFiles.has(file.fileId)) {
        log('Found complete file, processing...', {
          fileId: file.fileId,
          originalName: file.originalName,
        });
        await processFile(file.fileId);
      }
    }
  } catch (err) {
    log('Error checking for new files', { error: err.message });
  }
}

// Main loop
(async () => {
  ensureDirectory(DECRYPTED_DIR);
  console.log(`Auto-receiver started. Monitoring server: ${SERVER}`);
  console.log(`Decrypted files will be saved to: ${DECRYPTED_DIR}`);
  console.log(`Checking for new files every ${POLL_INTERVAL / 1000} seconds...`);
  console.log('Press Ctrl+C to stop\n');

  // Initial check
  await checkForNewFiles();
  
  // Poll for new files
  while (true) {
    await sleep(POLL_INTERVAL);
    await checkForNewFiles();
  }
})();

// Export processFile for manual use
module.exports = { processFile };

