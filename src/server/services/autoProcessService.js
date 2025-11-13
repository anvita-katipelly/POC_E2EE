// Auto-process service - automatically decrypts and saves files when all chunks are received
const fs = require('fs');
const path = require('path');
const metadataStore = require('../storage/metadataStore');
const fileService = require('./fileService');
const encryptionService = require('./encryptionService');
const { getChunkIndices } = require('../../utils/fileUtils');
const { ensureDirectory } = require('../../utils/fileUtils');
const { DECRYPTED_DIR, UPLOADS_DIR } = require('../../config/paths');
const { logEvent } = require('../../utils/logger');

// Track files that are being processed or have been processed
const processingFiles = new Set();
const processedFiles = new Set();

/**
 * Check if all chunks are present for a file
 * @param {string} fileId - File ID
 * @param {number} totalChunks - Total number of chunks expected
 * @returns {boolean} True if all chunks are present
 */
function areAllChunksPresent(fileId, totalChunks) {
  const fileDir = path.join(UPLOADS_DIR, fileId);
  if (!fs.existsSync(fileDir)) {
    return false;
  }
  const receivedChunks = getChunkIndices(fileDir);
  return receivedChunks.length === totalChunks && 
         receivedChunks.every((chunk, idx) => chunk === idx); // Ensure sequential chunks
}

/**
 * Automatically process a file: decrypt and save
 * @param {string} fileId - File ID
 * @returns {Promise<boolean>} True if processing was successful
 */
async function autoProcessFile(fileId) {
  // Prevent duplicate processing
  if (processingFiles.has(fileId) || processedFiles.has(fileId)) {
    return false;
  }

  const meta = metadataStore.get(fileId);
  if (!meta) {
    return false; // No metadata yet, can't process
  }

  const { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex } = meta;

  // Check if all chunks are present
  if (!areAllChunksPresent(fileId, totalChunks)) {
    return false; // Not all chunks received yet
  }

  processingFiles.add(fileId);

  try {
    logEvent('Auto-processing file', { fileId, originalName, totalChunks });

    const mediaKey = Buffer.from(mediaKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    // Read and concatenate all chunks
    const ciphertext = fileService.readAllChunksForFile(fileId, totalChunks);

    // Save raw ciphertext to disk
    ensureDirectory(DECRYPTED_DIR);
    const ciphertextPath = path.join(DECRYPTED_DIR, `${originalName}.bin`);
    fs.writeFileSync(ciphertextPath, ciphertext);
    logEvent('Saved ciphertext', { fileId, path: ciphertextPath });

    // Decrypt and decompress
    const original = encryptionService.decryptAndDecompress(ciphertext, mediaKey, iv, hmacHex);
    logEvent('File decrypted and decompressed', { fileId, originalBytes: original.length });

    // Save decrypted file to disk
    const outPath = path.join(DECRYPTED_DIR, originalName);
    fs.writeFileSync(outPath, original);
    logEvent('File automatically processed and saved', { fileId, path: outPath, size: original.length });

    processedFiles.add(fileId);
    processingFiles.delete(fileId);
    return true;
  } catch (err) {
    logEvent('Auto-process failed', { fileId, error: err.message });
    console.error('Auto-process error:', err);
    processingFiles.delete(fileId);
    return false;
  }
}

/**
 * Check and process a file if all chunks are present
 * Called after each chunk upload
 * @param {string} fileId - File ID
 */
function checkAndProcessFile(fileId) {
  // Only check if metadata exists (file has been initialized via /complete)
  if (!metadataStore.has(fileId)) {
    return;
  }

  const meta = metadataStore.get(fileId);
  if (!meta) {
    return;
  }

  // Check if all chunks are present and process if so
  if (areAllChunksPresent(fileId, meta.totalChunks)) {
    // Process asynchronously to not block the upload response
    setImmediate(() => {
      autoProcessFile(fileId).catch(err => {
        logEvent('Error in async auto-process', { fileId, error: err.message });
      });
    });
  }
}

/**
 * Get list of files ready for processing (all chunks present but not yet processed)
 * @returns {Array} Array of fileIds ready for processing
 */
function getFilesReadyForProcessing() {
  const allFileIds = metadataStore.getAllFileIds();
  return allFileIds.filter(fileId => {
    if (processedFiles.has(fileId) || processingFiles.has(fileId)) {
      return false;
    }
    const meta = metadataStore.get(fileId);
    if (!meta) {
      return false;
    }
    return areAllChunksPresent(fileId, meta.totalChunks);
  });
}

module.exports = {
  autoProcessFile,
  checkAndProcessFile,
  getFilesReadyForProcessing,
  areAllChunksPresent,
};

