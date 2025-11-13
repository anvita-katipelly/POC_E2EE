// In-memory metadata store (POC)
// For production, use a persistent database
class MetadataStore {
  constructor() {
    this.store = {}; // fileId -> { originalName, totalChunks, mediaKeyHex, ivHex, hmacHex, createdAt }
  }

  /**
   * Store metadata for a file
   * @param {string} fileId - File ID
   * @param {Object} metadata - File metadata
   */
  set(fileId, metadata) {
    this.store[fileId] = {
      ...metadata,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get metadata for a file
   * @param {string} fileId - File ID
   * @returns {Object|null} File metadata or null if not found
   */
  get(fileId) {
    return this.store[fileId] || null;
  }

  /**
   * Check if file exists
   * @param {string} fileId - File ID
   * @returns {boolean} True if file exists
   */
  has(fileId) {
    return fileId in this.store;
  }

  /**
   * Get all file IDs
   * @returns {string[]} Array of file IDs
   */
  getAllFileIds() {
    return Object.keys(this.store);
  }

  /**
   * Delete metadata for a file
   * @param {string} fileId - File ID
   */
  delete(fileId) {
    delete this.store[fileId];
  }

  /**
   * Clear all metadata
   */
  clear() {
    this.store = {};
  }
}

// Singleton instance
const metadataStore = new MetadataStore();

module.exports = metadataStore;

