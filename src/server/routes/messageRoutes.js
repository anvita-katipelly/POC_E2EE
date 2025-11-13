// Message routes - for sending and receiving encrypted text messages
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const metadataStore = require('../storage/metadataStore');
const encryptionService = require('../services/encryptionService');
const { generateMediaKey, generateIV } = require('../../utils/crypto');
const { ensureDirectory } = require('../../utils/fileUtils');
const { DECRYPTED_DIR } = require('../../config/paths');
const { logEvent } = require('../../utils/logger');

// In-memory message store (messageId -> encrypted message)
const messageStore = {};

/**
 * POST /send-message
 * Send an encrypted text message
 * Body: { message: string, messageId?: string }
 * Returns: { ok: true, messageId: string, decryptedPath: string }
 */
router.post('/send-message', async (req, res) => {
  try {
    const { message, messageId: providedMessageId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message (string) is required' });
    }

    // Generate message ID if not provided
    const messageId = providedMessageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate encryption keys
    const mediaKey = generateMediaKey();
    const iv = generateIV();

    // Convert message to buffer
    const messageBuffer = Buffer.from(message, 'utf8');

    // Encrypt and compress (using the encryption service)
    const { ciphertext, hmacHex } = encryptionService.encryptAndCompress(messageBuffer, mediaKey, iv);

    // Store encrypted message and metadata
    messageStore[messageId] = {
      ciphertext,
      mediaKeyHex: mediaKey.toString('hex'),
      ivHex: iv.toString('hex'),
      hmacHex,
      createdAt: new Date().toISOString(),
    };

    // Also store in metadata store for consistency
    metadataStore.set(messageId, {
      originalName: `${messageId}.txt`,
      totalChunks: 1, // Text messages are single "chunk"
      mediaKeyHex: mediaKey.toString('hex'),
      ivHex: iv.toString('hex'),
      hmacHex,
    });

    // Automatically decrypt and save the message
    try {
      const decrypted = encryptionService.decryptAndDecompress(ciphertext, mediaKey, iv, hmacHex);
      const decryptedText = decrypted.toString('utf8');

      // Save decrypted message to disk
      ensureDirectory(DECRYPTED_DIR);
      const outPath = path.join(DECRYPTED_DIR, `${messageId}.txt`);
      fs.writeFileSync(outPath, decryptedText, 'utf8');

      logEvent('Message sent and auto-decrypted', {
        messageId,
        messageLength: message.length,
        path: outPath,
      });

      res.json({
        ok: true,
        messageId,
        decryptedPath: outPath,
        message: 'Message encrypted, stored, and auto-decrypted',
      });
    } catch (err) {
      logEvent('Auto-decrypt failed for message', { messageId, error: err.message });
      res.json({
        ok: true,
        messageId,
        message: 'Message encrypted and stored (auto-decrypt failed)',
      });
    }
  } catch (err) {
    logEvent('Send message error', { error: err.message });
    console.error('send-message error:', err);
    res.status(500).json({ error: 'failed to send message', message: err.message });
  }
});

/**
 * GET /receive-message/:messageId
 * Receive and decrypt a text message
 * Returns the decrypted message as text
 */
router.get('/receive-message/:messageId', async (req, res) => {
  const { messageId } = req.params;

  try {
    const stored = messageStore[messageId];
    if (!stored) {
      logEvent('Message requested - not found', { messageId });
      return res.status(404).json({ error: 'message not found' });
    }

    const { ciphertext, mediaKeyHex, ivHex, hmacHex } = stored;
    const mediaKey = Buffer.from(mediaKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');

    // Decrypt and decompress
    const decrypted = encryptionService.decryptAndDecompress(ciphertext, mediaKey, iv, hmacHex);
    const message = decrypted.toString('utf8');

    logEvent('Message received and decrypted', { messageId, messageLength: message.length });

    // Return as plain text
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(message);
  } catch (err) {
    logEvent('Receive message error', { messageId, error: err.message });
    console.error('receive-message error:', err);
    res.status(500).json({ error: 'failed to decrypt message', message: err.message });
  }
});

/**
 * GET /list-messages
 * List all available message IDs
 */
router.get('/list-messages', (req, res) => {
  const messages = Object.keys(messageStore).map(messageId => {
    const stored = messageStore[messageId];
    return {
      messageId,
      createdAt: stored.createdAt,
    };
  });
  res.json({ messages });
});

module.exports = router;

