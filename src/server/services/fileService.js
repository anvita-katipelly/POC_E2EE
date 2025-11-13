// File service for handling file operations
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../../config/paths');
const { getFileDir, getChunkPath, readAllChunks } = require('../../utils/fileUtils');
const { ensureDirectory } = require('../../utils/fileUtils');

/**
 * Save a chunk to disk
 * @param {string} fileId - File ID
 * @param {number} chunkIndex - Chunk index
 * @param {Buffer} buffer - Chunk data
 * @returns {string} Path to saved chunk
 */
function saveChunk(fileId, chunkIndex, buffer) {
  const fileDir = getFileDir(UPLOADS_DIR, fileId);
  ensureDirectory(fileDir);
  const chunkPath = getChunkPath(UPLOADS_DIR, fileId, chunkIndex);
  fs.writeFileSync(chunkPath, buffer);
  return chunkPath;
}

/**
 * Read a chunk from disk
 * @param {string} fileId - File ID
 * @param {number} chunkIndex - Chunk index
 * @returns {Buffer} Chunk data
 * @throws {Error} If chunk doesn't exist
 */
function readChunk(fileId, chunkIndex) {
  const chunkPath = getChunkPath(UPLOADS_DIR, fileId, chunkIndex);
  if (!fs.existsSync(chunkPath)) {
    throw new Error(`Chunk ${chunkIndex} not found`);
  }
  return fs.readFileSync(chunkPath);
}

/**
 * Read all chunks and concatenate
 * @param {string} fileId - File ID
 * @param {number} totalChunks - Total number of chunks
 * @returns {Buffer} Concatenated ciphertext
 */
function readAllChunksForFile(fileId, totalChunks) {
  const fileDir = getFileDir(UPLOADS_DIR, fileId);
  const chunks = readAllChunks(fileDir, totalChunks);
  return Buffer.concat(chunks);
}

/**
 * Get chunk file path (for serving)
 * @param {string} fileId - File ID
 * @param {number} chunkIndex - Chunk index
 * @returns {string} Absolute path to chunk
 */
function getChunkFilePath(fileId, chunkIndex) {
  return getChunkPath(UPLOADS_DIR, fileId, chunkIndex);
}

module.exports = {
  saveChunk,
  readChunk,
  readAllChunksForFile,
  getChunkFilePath,
};

