import AsyncStorage from '@react-native-async-storage/async-storage';

const MESSAGES_KEY_PREFIX = '@e2ee_messages_';
const CONVERSATIONS_KEY = '@e2ee_conversations';

class MessageStorage {
  /**
   * Get all messages for a specific conversation
   * @param {string} conversationId - Unique conversation ID (e.g., "phone1_phone2")
   * @returns {Promise<Array>} Array of messages
   */
  async getMessages(conversationId) {
    try {
      const key = `${MESSAGES_KEY_PREFIX}${conversationId}`;
      const jsonValue = await AsyncStorage.getItem(key);
      const messages = jsonValue != null ? JSON.parse(jsonValue) : [];
      
      // Deduplicate messages based on id
      const uniqueMessages = [];
      const seenIds = new Set();
      
      for (const msg of messages) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          uniqueMessages.push(msg);
        } else {
          console.log('[MessageStorage] Removing duplicate message during load:', msg.id);
        }
      }
      
      // If duplicates were found, save the cleaned version
      if (uniqueMessages.length < messages.length) {
        console.log(`[MessageStorage] Cleaned ${messages.length - uniqueMessages.length} duplicate(s) from storage`);
        await this.saveMessages(conversationId, uniqueMessages);
      }
      
      return uniqueMessages;
    } catch (error) {
      console.error('[MessageStorage] Error loading messages:', error);
      return [];
    }
  }

  /**
   * Save messages for a specific conversation
   * @param {string} conversationId - Unique conversation ID
   * @param {Array} messages - Array of messages to save
   */
  async saveMessages(conversationId, messages) {
    try {
      const key = `${MESSAGES_KEY_PREFIX}${conversationId}`;
      const jsonValue = JSON.stringify(messages);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
      console.error('[MessageStorage] Error saving messages:', error);
    }
  }

  /**
   * Add a single message to a conversation
   * @param {string} conversationId - Unique conversation ID
   * @param {Object} message - Message object to add
   */
  async addMessage(conversationId, message) {
    try {
      const messages = await this.getMessages(conversationId);
      
      // Check if message already exists (by id)
      const messageExists = messages.some(msg => msg.id === message.id);
      if (messageExists) {
        console.log('[MessageStorage] Duplicate message detected, skipping:', message.id);
        return;
      }
      
      const updatedMessages = [...messages, message];
      await this.saveMessages(conversationId, updatedMessages);
      
      // Update conversation metadata
      await this.updateConversationMetadata(conversationId, message);
    } catch (error) {
      console.error('[MessageStorage] Error adding message:', error);
    }
  }

  /**
   * Update conversation metadata (last message, timestamp, unread count)
   * @param {string} conversationId - Unique conversation ID
   * @param {Object} lastMessage - The last message in the conversation
   */
  async updateConversationMetadata(conversationId, lastMessage) {
    try {
      console.log('[MessageStorage] Updating conversation metadata:', { conversationId, messageText: lastMessage.text?.substring(0, 20) });
      const conversations = await this.getConversations();
      const existingIndex = conversations.findIndex(c => c.id === conversationId);
      
      const metadata = {
        id: conversationId,
        lastMessage: lastMessage.text,
        lastMessageTimestamp: lastMessage.timestamp,
        lastMessageFrom: lastMessage.from,
        updatedAt: new Date().toISOString(),
      };

      console.log('[MessageStorage] Conversation metadata:', metadata);

      if (existingIndex >= 0) {
        conversations[existingIndex] = {
          ...conversations[existingIndex],
          ...metadata,
        };
        console.log('[MessageStorage] Updated existing conversation at index:', existingIndex);
      } else {
        conversations.push(metadata);
        console.log('[MessageStorage] Added new conversation');
      }

      // Sort by most recent
      conversations.sort((a, b) => 
        new Date(b.lastMessageTimestamp) - new Date(a.lastMessageTimestamp)
      );

      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    } catch (error) {
      console.error('[MessageStorage] Error updating conversation metadata:', error);
    }
  }

  /**
   * Get all conversations metadata
   * @returns {Promise<Array>} Array of conversation metadata
   */
  async getConversations() {
    try {
      const jsonValue = await AsyncStorage.getItem(CONVERSATIONS_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (error) {
      console.error('[MessageStorage] Error loading conversations:', error);
      return [];
    }
  }

  /**
   * Get conversation metadata for a specific conversation
   * @param {string} conversationId - Unique conversation ID
   * @returns {Promise<Object|null>} Conversation metadata or null
   */
  async getConversationMetadata(conversationId) {
    try {
      const conversations = await this.getConversations();
      return conversations.find(c => c.id === conversationId) || null;
    } catch (error) {
      console.error('[MessageStorage] Error loading conversation metadata:', error);
      return null;
    }
  }

  /**
   * Clear all messages for a conversation
   * @param {string} conversationId - Unique conversation ID
   */
  async clearMessages(conversationId) {
    try {
      const key = `${MESSAGES_KEY_PREFIX}${conversationId}`;
      await AsyncStorage.removeItem(key);
      
      // Also remove from conversations list
      const conversations = await this.getConversations();
      const filtered = conversations.filter(c => c.id !== conversationId);
      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('[MessageStorage] Error clearing messages:', error);
    }
  }

  /**
   * Clear all data
   */
  async clearAll() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const e2eeKeys = keys.filter(key => 
        key.startsWith(MESSAGES_KEY_PREFIX) || key === CONVERSATIONS_KEY
      );
      await AsyncStorage.multiRemove(e2eeKeys);
    } catch (error) {
      console.error('[MessageStorage] Error clearing all data:', error);
    }
  }

  /**
   * Generate a conversation ID from two phone numbers
   * @param {string} phone1 - First phone number
   * @param {string} phone2 - Second phone number
   * @returns {string} Conversation ID
   */
  getConversationId(phone1, phone2) {
    // Sort phone numbers to ensure consistent conversation ID
    const phones = [phone1, phone2].sort();
    return `${phones[0]}_${phones[1]}`;
  }
}

// Export singleton instance
export default new MessageStorage();

