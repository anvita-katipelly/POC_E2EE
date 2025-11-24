// WebSocket service for real-time messaging
const { Server } = require('socket.io');
const peerStore = require('../storage/peerStore');
const encryptionService = require('./encryptionService');
const metadataStore = require('../storage/metadataStore');
const { generateMediaKey, generateIV } = require('../../utils/crypto');
const { logEvent } = require('../../utils/logger');
const { WEBSOCKET } = require('../../config/constants');

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
    pingTimeout: WEBSOCKET.PING_TIMEOUT,
    pingInterval: WEBSOCKET.PING_INTERVAL,
    maxHttpBufferSize: WEBSOCKET.MAX_HTTP_BUFFER_SIZE,
    connectTimeout: WEBSOCKET.CONNECT_TIMEOUT,
    transports: ['websocket', 'polling'], // Prefer WebSocket
    perMessageDeflate: false, // Disable compression for better performance at scale

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

        // Check if message is already encrypted by client (E2EE)
        const isEncrypted = typeof message === 'object' && message.encryptedData;
        
        let payload;
        
        if (isEncrypted) {
          // Client-side encryption (E2EE) - just relay the encrypted payload
          payload = {
            type: 'text',
            from,
            to,
            encrypted: true,
            encryptedData: message.encryptedData,
            mediaKey: message.mediaKey,
            iv: message.iv,
            hmac: message.hmac,
            timestamp: new Date().toISOString(),
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          
          logEvent('E2EE Message relayed', {
            from,
            to,
            messageId: payload.messageId,
          });
        } else {
          // Legacy: Server-side encryption for backwards compatibility
          const mediaKey = generateMediaKey();
          const iv = generateIV();
          const messageBuffer = Buffer.from(message, 'utf8');
          const { ciphertext, hmacHex } = encryptionService.encryptAndCompress(
            messageBuffer,
            mediaKey,
            iv
          );

          payload = {
            type: 'text',
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

          logEvent('Message sent (server-encrypted)', {
            from,
            to,
            messageId: payload.messageId,
            messageLength: message.length,
          });
        }

        // Check if recipient is online
        const recipientSocketId = peerStore.getSocketId(to);

        if (recipientSocketId) {
          // Send to online peer
          io.to(recipientSocketId).emit('message', payload);

          socket.emit('message-sent', {
            type: 'text',
            messageId: payload.messageId,
            to,
            timestamp: payload.timestamp,
          });

          logEvent('Message delivered', { from, to, messageId: payload.messageId });
        } else {
          // Store for offline delivery
          if (!offlineMessages.has(to)) {
            offlineMessages.set(to, []);
          }
          offlineMessages.get(to).push(payload);

          socket.emit('message-sent', {
            type: 'text',
            messageId: payload.messageId,
            to,
            timestamp: payload.timestamp,
            status: 'offline',
          });

          logEvent('Message queued (recipient offline)', { from, to, messageId: payload.messageId });
        }
      } catch (err) {
        logEvent('Send message error', { error: err.message, socketId: socket.id });
        socket.emit('error', { message: 'Failed to send message', error: err.message });
      }
    });

    socket.on('send-file', async (data) => {
      try {
        const { to, fileId, originalName, totalChunks } = data;
        const from = peerStore.getPhoneNumber(socket.id);

        if (!from) {
          socket.emit('error', { message: 'Not registered. Please register first.' });
          return;
        }

        if (!to || !fileId) {
          socket.emit('error', { message: 'to and fileId are required' });
          return;
        }

        const meta = metadataStore.get(fileId);
        if (!meta) {
          socket.emit('error', { message: `File metadata not found for ${fileId}` });
          return;
        }

        const payload = {
          type: 'file',
          from,
          to,
          fileId,
          originalName: originalName || meta.originalName,
          totalChunks: totalChunks || meta.totalChunks,
          mimeType: data.mimeType,
          size: data.size,
          timestamp: new Date().toISOString(),
          messageId: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };

        const recipientSocketId = peerStore.getSocketId(to);

        if (recipientSocketId) {
          io.to(recipientSocketId).emit('message', payload);
          socket.emit('message-sent', {
            type: 'file',
            messageId: payload.messageId,
            to,
            timestamp: payload.timestamp,
            fileId,
          });
          logEvent('File notification delivered', { from, to, fileId, messageId: payload.messageId });
        } else {
          if (!offlineMessages.has(to)) {
            offlineMessages.set(to, []);
          }
          offlineMessages.get(to).push(payload);
          socket.emit('message-sent', {
            type: 'file',
            messageId: payload.messageId,
            to,
            timestamp: payload.timestamp,
            status: 'offline',
            fileId,
          });
          logEvent('File notification queued (recipient offline)', { from, to, fileId, messageId: payload.messageId });
        }
      } catch (err) {
        logEvent('Send file error', { error: err.message, socketId: socket.id });
        socket.emit('error', { message: 'Failed to send file notification', error: err.message });
      }
    });

    // Call signaling - offer
    socket.on('call-offer', (data) => {
      try {
        const { to, offer, isVideo } = data;
        const from = peerStore.getPhoneNumber(socket.id);

        if (!from) {
          socket.emit('error', { message: 'Not registered. Please register first.' });
          return;
        }

        if (!to || !offer) {
          socket.emit('error', { message: 'to and offer are required' });
          return;
        }

        logEvent('Call offer', { from, to, isVideo });

        const recipientSocketId = peerStore.getSocketId(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('call-offer', {
            from,
            offer,
            isVideo,
            timestamp: new Date().toISOString(),
          });
        } else {
          socket.emit('error', { message: 'Recipient is offline' });
        }
      } catch (err) {
        logEvent('Call offer error', { error: err.message, socketId: socket.id });
        socket.emit('error', { message: 'Failed to send call offer', error: err.message });
      }
    });

    // Call signaling - answer
    socket.on('call-answer', (data) => {
      try {
        const { to, answer } = data;
        const from = peerStore.getPhoneNumber(socket.id);

        if (!from) {
          socket.emit('error', { message: 'Not registered. Please register first.' });
          return;
        }

        if (!to || !answer) {
          socket.emit('error', { message: 'to and answer are required' });
          return;
        }

        logEvent('Call answer', { from, to });

        const recipientSocketId = peerStore.getSocketId(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('call-answer', {
            from,
            answer,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        logEvent('Call answer error', { error: err.message, socketId: socket.id });
        socket.emit('error', { message: 'Failed to send call answer', error: err.message });
      }
    });

    // ICE candidate exchange
    socket.on('ice-candidate', (data) => {
      try {
        const { to, candidate } = data;
        const from = peerStore.getPhoneNumber(socket.id);

        if (!from || !to || !candidate) {
          return; // Silently ignore invalid ICE candidates
        }

        const recipientSocketId = peerStore.getSocketId(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('ice-candidate', {
            from,
            candidate,
          });
        }
      } catch (err) {
        logEvent('ICE candidate error', { error: err.message, socketId: socket.id });
      }
    });

    // Call rejection
    socket.on('call-reject', (data) => {
      try {
        const { to } = data;
        const from = peerStore.getPhoneNumber(socket.id);

        if (!from || !to) {
          return;
        }

        logEvent('Call rejected', { from, to });

        const recipientSocketId = peerStore.getSocketId(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('call-rejected', {
            from,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        logEvent('Call reject error', { error: err.message, socketId: socket.id });
      }
    });

    // Call end
    socket.on('call-end', (data) => {
      try {
        const { to } = data;
        const from = peerStore.getPhoneNumber(socket.id);

        if (!from || !to) {
          return;
        }

        logEvent('Call ended', { from, to });

        const recipientSocketId = peerStore.getSocketId(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('call-ended', {
            from,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        logEvent('Call end error', { error: err.message, socketId: socket.id });
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

