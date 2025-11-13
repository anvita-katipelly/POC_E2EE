// File system utilities
const fs = require('fs');
const path = require('path');

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get chunk file path
 * @param {string} uploadsDir - Uploads directory
 * @param {string} fileId - File ID
 * @param {number} chunkIndex - Chunk index
 * @returns {string} Chunk file path
 */
function getChunkPath(uploadsDir, fileId, chunkIndex) {
  return path.join(uploadsDir, fileId, `${chunkIndex}.chunk`);
}

/**
 * Get file directory for a fileId
 * @param {string} uploadsDir - Uploads directory
 * @param {string} fileId - File ID
 * @returns {string} File directory path
 */
function getFileDir(uploadsDir, fileId) {
  return path.join(uploadsDir, fileId);
}

/**
 * Get list of chunk indices for a file
 * @param {string} fileDir - File directory
 * @returns {number[]} Array of chunk indices
 */
function getChunkIndices(fileDir) {
  if (!fs.existsSync(fileDir)) {
    return [];
  }
  return fs.readdirSync(fileDir)
    .filter(f => f.endsWith('.chunk'))
    .map(f => Number(f.replace('.chunk', '')))
    .sort((a, b) => a - b);
}

/**
 * Read all chunks for a file
 * @param {string} fileDir - File directory
 * @param {number} totalChunks - Total number of chunks
 * @returns {Buffer[]} Array of chunk buffers
 */
function readAllChunks(fileDir, totalChunks) {
  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(fileDir, `${i}.chunk`);
    if (!fs.existsSync(chunkPath)) {
      throw new Error(`Chunk ${i} not found`);
    }
    chunks.push(fs.readFileSync(chunkPath));
  }
  return chunks;
}

module.exports = {
  ensureDirectory,
  getChunkPath,
  getFileDir,
  getChunkIndices,
  readAllChunks,
};

