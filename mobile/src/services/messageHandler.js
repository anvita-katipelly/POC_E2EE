import socketService from './socketService';
import messageStorage from './messageStorage';

/**
 * Global message handler service
 * Listens for incoming messages and saves them to storage
 * regardless of which screen is active
 */
class MessageHandler {
  constructor() {
    this.isInitialized = false;
    this.currentUserPhone = null;
  }

  /**
   * Initialize the message handler
   * Should be called once after user registration
   * @param {string} phoneNumber - Current user's phone number
   */
  initialize(phoneNumber) {
    if (this.isInitialized) {
      console.log('[MessageHandler] Already initialized');
      return;
    }

    this.currentUserPhone = phoneNumber;
    this.setupListeners();
    this.isInitialized = true;
    console.log('[MessageHandler] Initialized for user:', phoneNumber);
  }

  /**
   * Setup socket event listeners for incoming messages
   */
  setupListeners() {
    // Listen for incoming messages
    socketService.on('message', this.handleIncomingMessage.bind(this));

    // Listen for offline messages
    socketService.on('offline-messages', this.handleOfflineMessages.bind(this));

    console.log('[MessageHandler] Event listeners set up');
  }

  /**
   * Generate unique message ID
   */
  generateUniqueId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle incoming message
   */
  async handleIncomingMessage(data) {
    try {
      console.log('[MessageHandler] Incoming message from:', data.from);

      if (data.type !== 'text') {
        console.log('[MessageHandler] Ignoring non-text message');
        return;
      }

      const conversationId = messageStorage.getConversationId(
        this.currentUserPhone,
        data.from
      );

      const newMessage = {
        id: data.messageId || this.generateUniqueId(),
        text: data.message,
        from: data.from,
        to: data.to,
        timestamp: data.timestamp || new Date().toISOString(),
        isSent: false,
      };

      console.log('[MessageHandler] Saving message:', newMessage.id);

      // Save to storage
      await messageStorage.addMessage(conversationId, newMessage);

      console.log('[MessageHandler] Message saved successfully');
    } catch (error) {
      console.error('[MessageHandler] Error handling incoming message:', error);
    }
  }

  /**
   * Handle offline messages (messages received while user was offline)
   */
  async handleOfflineMessages({ messages: offlineMsgs }) {
    try {
      console.log('[MessageHandler] Received offline messages:', offlineMsgs.length);

      if (!offlineMsgs || offlineMsgs.length === 0) {
        return;
      }

      // Filter text messages only
      const textMessages = offlineMsgs.filter((msg) => msg.type === 'text');

      // Group messages by sender
      const messagesBySender = {};
      textMessages.forEach((msg) => {
        if (!messagesBySender[msg.from]) {
          messagesBySender[msg.from] = [];
        }
        messagesBySender[msg.from].push(msg);
      });

      // Process messages for each sender
      for (const [senderPhone, messages] of Object.entries(messagesBySender)) {
        const conversationId = messageStorage.getConversationId(
          this.currentUserPhone,
          senderPhone
        );

        console.log(`[MessageHandler] Processing ${messages.length} offline messages from ${senderPhone}`);

        // Save each message
        for (const msg of messages) {
          const newMessage = {
            id: msg.messageId || this.generateUniqueId(),
            text: msg.message,
            from: msg.from,
            to: msg.to,
            timestamp: msg.timestamp || new Date().toISOString(),
            isSent: false,
          };

          await messageStorage.addMessage(conversationId, newMessage);
        }
      }

      console.log('[MessageHandler] All offline messages processed');
    } catch (error) {
      console.error('[MessageHandler] Error handling offline messages:', error);
    }
  }

  /**
   * Cleanup when user logs out
   */
  cleanup() {
    if (!this.isInitialized) {
      return;
    }

    // Remove listeners
    socketService.off('message', this.handleIncomingMessage.bind(this));
    socketService.off('offline-messages', this.handleOfflineMessages.bind(this));

    this.isInitialized = false;
    this.currentUserPhone = null;
    console.log('[MessageHandler] Cleaned up');
  }
}

// Export singleton instance
export default new MessageHandler();

