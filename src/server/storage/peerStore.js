// Peer store - manages phone number to socket connection mapping
class PeerStore {
  constructor() {
    // phoneNumber -> { socketId, connectedAt, lastSeen }
    this.peers = new Map();
    // socketId -> phoneNumber (reverse mapping)
    this.socketToPhone = new Map();
  }

  /**
   * Register a peer with a phone number
   * @param {string} phoneNumber - Phone number
   * @param {string} socketId - Socket connection ID
   */
  register(phoneNumber, socketId) {
    // Remove old connection if phone number was already registered
    const existing = this.peers.get(phoneNumber);
    if (existing) {
      this.socketToPhone.delete(existing.socketId);
    }

    this.peers.set(phoneNumber, {
      socketId,
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
    this.socketToPhone.set(socketId, phoneNumber);
  }

  /**
   * Unregister a peer by socket ID
   * @param {string} socketId - Socket connection ID
   */
  unregister(socketId) {
    const phoneNumber = this.socketToPhone.get(socketId);
    if (phoneNumber) {
      this.peers.delete(phoneNumber);
      this.socketToPhone.delete(socketId);
    }
  }

  /**
   * Get phone number for a socket ID
   * @param {string} socketId - Socket connection ID
   * @returns {string|null} Phone number or null
   */
  getPhoneNumber(socketId) {
    return this.socketToPhone.get(socketId) || null;
  }

  /**
   * Get socket ID for a phone number
   * @param {string} phoneNumber - Phone number
   * @returns {string|null} Socket ID or null
   */
  getSocketId(phoneNumber) {
    const peer = this.peers.get(phoneNumber);
    return peer ? peer.socketId : null;
  }

  /**
   * Check if a phone number is online
   * @param {string} phoneNumber - Phone number
   * @returns {boolean} True if peer is online
   */
  isOnline(phoneNumber) {
    return this.peers.has(phoneNumber);
  }

  /**
   * Update last seen timestamp
   * @param {string} socketId - Socket connection ID
   */
  updateLastSeen(socketId) {
    const phoneNumber = this.socketToPhone.get(socketId);
    if (phoneNumber) {
      const peer = this.peers.get(phoneNumber);
      if (peer) {
        peer.lastSeen = new Date().toISOString();
      }
    }
  }

  /**
   * Get all online peers
   * @returns {Array} Array of { phoneNumber, connectedAt, lastSeen }
   */
  getAllPeers() {
    return Array.from(this.peers.entries()).map(([phoneNumber, data]) => ({
      phoneNumber,
      ...data,
    }));
  }

  /**
   * Get peer info
   * @param {string} phoneNumber - Phone number
   * @returns {Object|null} Peer info or null
   */
  getPeer(phoneNumber) {
    const peer = this.peers.get(phoneNumber);
    return peer ? { phoneNumber, ...peer } : null;
  }
}

// Singleton instance
const peerStore = new PeerStore();

module.exports = peerStore;

