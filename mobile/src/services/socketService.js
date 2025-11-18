import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.serverUrl = null;
    this.isConnected = false;
    this.listeners = new Map();
  }

  /**
   * Initialize socket connection
   * @param {string} serverUrl - Server URL (e.g., 'http://localhost:3000' or 'http://192.168.1.100:3000')
   */
  initialize(serverUrl) {
    if (this.socket && this.socket.connected) {
      this.disconnect();
    }

    this.serverUrl = serverUrl;
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.setupEventListeners();
  }

  /**
   * Setup default event listeners
   */
  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.emit('connected', {});
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.emit('disconnected', {});
    });

    this.socket.on('connect_error', (error) => {
      this.emit('connection-error', { error: error.message });
    });
  }

  /**
   * Register with phone number
   * @param {string} phoneNumber - Phone number to register
   */
  register(phoneNumber) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit('register', { phoneNumber });
  }

  /**
   * Send a text message to a peer
   * @param {string} to - Recipient phone number
   * @param {string} message - Message text
   */
  sendMessage(to, message) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit('send-message', { to, message });
  }

  /**
   * Request list of online peers
   */
  getOnlinePeers() {
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit('get-online-peers');
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.socket) return;

    // Store listener for cleanup
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    this.socket.on(event, callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function (optional)
   */
  off(event, callback) {
    if (!this.socket) return;

    if (callback) {
      this.socket.off(event, callback);
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    } else {
      this.socket.off(event);
      this.listeners.delete(event);
    }
  }

  /**
   * Emit custom event (for internal use)
   */
  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      serverUrl: this.serverUrl,
    };
  }
}

// Export singleton instance
export default new SocketService();

