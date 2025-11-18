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
    this.reattachStoredListeners();
  }

  /**
   * Reattach all stored listeners to the new socket
   */
  reattachStoredListeners() {
    if (!this.socket) return;

    // Reattach all previously registered listeners
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((callback) => {
        this.socket.on(event, callback);
      });
    });
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

    // Listen for server response events
    this.socket.on('registered', (data) => {
      this.emit('registered', data);
    });

    this.socket.on('error', (data) => {
      this.emit('error', data);
    });

    this.socket.on('online-peers', (data) => {
      this.emit('online-peers', data);
    });

    this.socket.on('message', (data) => {
      this.emit('message', data);
    });

    this.socket.on('message-sent', (data) => {
      this.emit('message-sent', data);
    });

    this.socket.on('offline-messages', (data) => {
      this.emit('offline-messages', data);
    });

    this.socket.on('peer-online', (data) => {
      this.emit('peer-online', data);
    });

    this.socket.on('peer-offline', (data) => {
      this.emit('peer-offline', data);
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
    // Store listener for cleanup (even if socket doesn't exist yet)
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    // If socket exists, attach the listener immediately
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function (optional)
   */
  off(event, callback) {
    if (callback) {
      // Remove from stored listeners
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
      // Remove from socket if it exists
      if (this.socket) {
        this.socket.off(event, callback);
      }
    } else {
      // Remove all listeners for this event
      this.listeners.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
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
      // Don't clear listeners - they should persist for reconnection
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

