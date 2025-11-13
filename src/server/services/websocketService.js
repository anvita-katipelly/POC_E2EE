// WebSocket service for real-time messaging
const { Server } = require('socket.io');
const peerStore = require('../storage/peerStore');
const encryptionService = require('./encryptionService');
const { generateMediaKey, generateIV } = require('../../utils/crypto');
const { logEvent } = require('../../utils/logger');

// Message store for offline messages (phoneNumber -> messages[])
const offlineMessages = new Map();

/**
 * Initialize WebSocket server
 * @param {Object} httpServer - HTTP server instance
 * @returns {Object} Socket.IO server instance
 */
function initializeWebSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    logEvent('WebSocket client connected', { socketId: socket.id });

    // Register peer with phone number
    socket.on('register', (data) => {
      try {
        const { phoneNumber } = data;
        
        if (!phoneNumber || typeof phoneNumber !== 'string') {
          socket.emit('error', { message: 'phoneNumber is required' });
          return;
        }

        // Validate phone number format (basic validation)
        if (!/^\+?[1-9]\d{1,14}$/.test(phoneNumber.replace(/\s/g, ''))) {
          socket.emit('error', { message: 'Invalid phone number format' });
          return;
        }

        // Register peer
        peerStore.register(phoneNumber, socket.id);
        logEvent('Peer registered', { phoneNumber, socketId: socket.id });

        // Send confirmation
        socket.emit('registered', {
          phoneNumber,
          message: 'Successfully registered',
        });

        // Send any pending offline messages
        const pending = offlineMessages.get(phoneNumber) || [];
        if (pending.length > 0) {
          socket.emit('offline-messages', { messages: pending });
          offlineMessages.delete(phoneNumber);
          logEvent('Delivered offline messages', { phoneNumber, count: pending.length });
        }

        // Notify other peers (optional - for presence)
        socket.broadcast.emit('peer-online', { phoneNumber });
      } catch (err) {
        logEvent('Registration error', { error: err.message, socketId: socket.id });
        socket.emit('error', { message: 'Registration failed', error: err.message });
      }
    });

    // Send message to a phone number
    socket.on('send-message', async (data) => {
      try {
        const { to, message } = data;
        const from = peerStore.getPhoneNumber(socket.id);

        if (!from) {
          socket.emit('error', { message: 'Not registered. Please register first.' });
          return;
        }

        if (!to || !message) {
          socket.emit('error', { message: 'to and message are required' });
          return;
        }

        // Encrypt the message
        const mediaKey = generateMediaKey();
        const iv = generateIV();
        const messageBuffer = Buffer.from(message, 'utf8');
        const { ciphertext, hmacHex } = encryptionService.encryptAndCompress(
          messageBuffer,
          mediaKey,
          iv
        );

        const messageData = {
          from,
          to,
          message,
          encrypted: {
            ciphertext: ciphertext.toString('base64'),
            mediaKeyHex: mediaKey.toString('hex'),
            ivHex: iv.toString('hex'),
            hmacHex,
          },
          timestamp: new Date().toISOString(),
          messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };

        logEvent('Message sent', {
          from,
          to,
          messageId: messageData.messageId,
          messageLength: message.length,
        });

        // Check if recipient is online
        const recipientSocketId = peerStore.getSocketId(to);
        
        if (recipientSocketId) {
          // Send to online peer
          io.to(recipientSocketId).emit('message', {
            ...messageData,
            encrypted: undefined, // Don't send encrypted data to recipient, send plaintext
          });
          
          socket.emit('message-sent', {
            messageId: messageData.messageId,
            to,
            timestamp: messageData.timestamp,
          });
          
          logEvent('Message delivered', { from, to, messageId: messageData.messageId });
        } else {
          // Store for offline delivery
          if (!offlineMessages.has(to)) {
            offlineMessages.set(to, []);
          }
          offlineMessages.get(to).push(messageData);
          
          socket.emit('message-sent', {
            messageId: messageData.messageId,
            to,
            timestamp: messageData.timestamp,
            status: 'offline',
          });
          
          logEvent('Message queued (recipient offline)', { from, to, messageId: messageData.messageId });
        }
      } catch (err) {
        logEvent('Send message error', { error: err.message, socketId: socket.id });
        socket.emit('error', { message: 'Failed to send message', error: err.message });
      }
    });

    // Get online peers
    socket.on('get-online-peers', () => {
      const peers = peerStore.getAllPeers();
      socket.emit('online-peers', { peers });
    });

    // Get peer status
    socket.on('get-peer-status', (data) => {
      const { phoneNumber } = data;
      const isOnline = peerStore.isOnline(phoneNumber);
      const peer = peerStore.getPeer(phoneNumber);
      
      socket.emit('peer-status', {
        phoneNumber,
        isOnline,
        ...(peer || {}),
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const phoneNumber = peerStore.getPhoneNumber(socket.id);
      if (phoneNumber) {
        peerStore.unregister(socket.id);
        logEvent('Peer disconnected', { phoneNumber, socketId: socket.id });
        
        // Notify other peers
        socket.broadcast.emit('peer-offline', { phoneNumber });
      } else {
        logEvent('WebSocket client disconnected', { socketId: socket.id });
      }
    });

    // Heartbeat/ping
    socket.on('ping', () => {
      peerStore.updateLastSeen(socket.id);
      socket.emit('pong');
    });
  });

  return io;
}

module.exports = {
  initializeWebSocket,
};

