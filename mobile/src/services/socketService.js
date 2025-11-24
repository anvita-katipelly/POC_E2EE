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

    // Call signaling events
    this.socket.on('call-offer', (data) => {
      console.log('[SocketService] Received call-offer from:', data.from);
      this.emit('call-offer', data);
    });

    this.socket.on('call-answer', (data) => {
      console.log('[SocketService] Received call-answer from:', data.from);
      this.emit('call-answer', data);
    });

    this.socket.on('ice-candidate', (data) => {
      console.log('[SocketService] Received ice-candidate from:', data.from);
      this.emit('ice-candidate', data);
    });

    this.socket.on('call-rejected', (data) => {
      console.log('[SocketService] Call rejected by:', data.from);
      this.emit('call-rejected', data);
    });

    this.socket.on('call-ended', (data) => {
      console.log('[SocketService] Call ended by:', data.from);
      this.emit('call-ended', data);
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
   * @param {string|Object} message - Message text or encrypted payload object
   */
  sendMessage(to, message) {
    const isEncrypted = typeof message === 'object' && message.encrypted;
    console.log('[SocketService] sendMessage called:', { 
      to, 
      isEncrypted,
      messageType: typeof message,
      isConnected: this.isConnected 
    });
    
    if (!this.socket || !this.isConnected) {
      console.error('[SocketService] Cannot send - socket not connected');
      throw new Error('Socket not connected');
    }

    console.log('[SocketService] Emitting send-message event');
    this.socket.emit('send-message', { to, message });
    console.log('[SocketService] send-message event emitted successfully');
  }

  /**
   * Send a file notification to a peer after upload completes
   * @param {Object} payload
   * @param {string} payload.to - Recipient phone number
   * @param {string} payload.fileId - File identifier on the server
   * @param {string} payload.originalName - Original filename
   * @param {number} payload.totalChunks - Total chunk count
   * @param {string} [payload.mimeType] - MIME type
   * @param {number} [payload.size] - Original file size
   */
  async sendFile({ to, fileId, originalName, totalChunks, mimeType, size }) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    if (!to || !fileId || !originalName || !totalChunks) {
      throw new Error('Missing file metadata for sendFile');
    }

    this.socket.emit('send-file', {
      to,
      fileId,
      originalName,
      totalChunks,
      mimeType,
      size,
    });
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
   * Send call offer to a peer
   * @param {string} to - Recipient phone number
   * @param {Object} offer - WebRTC offer (SDP)
   * @param {boolean} isVideo - Is this a video call?
   */
  sendCallOffer(to, offer, isVideo) {
    console.log('[SocketService] Sending call offer to:', to);
    
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit('call-offer', { to, offer, isVideo });
  }

  /**
   * Send call answer to a peer
   * @param {string} to - Recipient phone number
   * @param {Object} answer - WebRTC answer (SDP)
   */
  sendCallAnswer(to, answer) {
    console.log('[SocketService] Sending call answer to:', to);
    
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit('call-answer', { to, answer });
  }

  /**
   * Send ICE candidate to a peer
   * @param {string} to - Recipient phone number
   * @param {Object} candidate - ICE candidate
   */
  sendIceCandidate(to, candidate) {
    if (!this.socket || !this.isConnected) {
      console.warn('[SocketService] Cannot send ICE candidate - not connected');
      return;
    }

    this.socket.emit('ice-candidate', { to, candidate });
  }

  /**
   * Reject an incoming call
   * @param {string} to - Caller's phone number
   */
  rejectCall(to) {
    console.log('[SocketService] Rejecting call from:', to);
    
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit('call-reject', { to });
  }

  /**
   * End an active call
   * @param {string} to - Other peer's phone number
   */
  endCall(to) {
    console.log('[SocketService] Ending call with:', to);
    
    if (!this.socket || !this.isConnected) {
      console.warn('[SocketService] Cannot end call - not connected');
      return;
    }

    this.socket.emit('call-end', { to });
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

