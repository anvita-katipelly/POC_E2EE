import io, { Socket } from 'socket.io-client';
import { SERVER_CONFIG } from '../config/config';
import { SocketMessage, Peer } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private phoneNumber: string | null = null;
  private listeners: Map<string, Function[]> = new Map();

  /**
   * Connect to the server
   */
  async connect(phoneNumber: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.phoneNumber = phoneNumber;
      this.socket = io(SERVER_CONFIG.BASE_URL, SERVER_CONFIG.WS_OPTIONS);

      this.socket.on('connect', () => {
        console.log('Socket connected');
        this.isConnected = true;
        // Register with phone number
        this.socket!.emit('register', { phoneNumber });
      });

      this.socket.on('registered', (data: { phoneNumber: string }) => {
        console.log('Registered:', data.phoneNumber);
        resolve();
      });

      this.socket.on('connect_error', (error: Error) => {
        const errorMessage = error?.message || 'Unknown connection error';
        console.error('Connection error:', errorMessage);
        console.error('Server URL:', SERVER_CONFIG.BASE_URL);
        this.isConnected = false;
        reject(new Error(`Failed to connect to server at ${SERVER_CONFIG.BASE_URL}. ${errorMessage}`));
      });

      this.socket.on('disconnect', () => {
        console.log('Socket disconnected');
        this.isConnected = false;
      });

      this.socket.on('error', (data: { message: string }) => {
        console.error('Socket error:', data.message);
        if (data.message.includes('registration')) {
          reject(new Error(data.message));
        }
      });
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.phoneNumber = null;
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(to: string, message: string): Promise<{ messageId: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('send-message', { to, message });

      const timeout = setTimeout(() => {
        reject(new Error('Message send timeout'));
      }, 10000);

      this.socket.once('message-sent', (data: { messageId: string }) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this.socket.once('error', (data: { message: string }) => {
        clearTimeout(timeout);
        reject(new Error(data.message));
      });
    });
  }

  /**
   * Send file notification
   */
  async sendFileNotification(
    to: string,
    fileId: string,
    originalName: string,
    totalChunks: number
  ): Promise<{ messageId: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('send-file', { to, fileId, originalName, totalChunks });

      const timeout = setTimeout(() => {
        reject(new Error('File notification send timeout'));
      }, 10000);

      this.socket.once('message-sent', (data: { messageId: string }) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this.socket.once('error', (data: { message: string }) => {
        clearTimeout(timeout);
        reject(new Error(data.message));
      });
    });
  }

  /**
   * Get online peers
   */
  async getOnlinePeers(): Promise<Peer[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('get-online-peers');

      this.socket.once('online-peers', (data: { peers: Peer[] }) => {
        // Filter out self
        const peers = data.peers.filter(
          (peer) => peer.phoneNumber !== this.phoneNumber
        );
        resolve(peers);
      });
    });
  }

  /**
   * Check peer status
   */
  async getPeerStatus(phoneNumber: string): Promise<{ isOnline: boolean; phoneNumber: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('get-peer-status', { phoneNumber });

      this.socket.once('peer-status', (data: { isOnline: boolean; phoneNumber: string }) => {
        resolve(data);
      });
    });
  }

  /**
   * Add event listener
   */
  on(event: string, callback: Function): void {
    if (!this.socket) {
      console.warn('Socket not initialized');
      return;
    }

    this.socket.on(event, callback as any);

    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: Function): void {
    if (this.socket) {
      this.socket.off(event, callback as any);
    }
  }

  /**
   * Get current phone number
   */
  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }
}

// Singleton instance
const socketService = new SocketService();
export default socketService;

