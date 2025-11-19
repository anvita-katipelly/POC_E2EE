import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import socketService from '../services/socketService';
import messageStorage from '../services/messageStorage';
import { COLORS, STYLES } from '../config/config';

// Helper to generate unique IDs
const generateUniqueId = () => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const ChatScreen = ({ navigation, route }) => {
  const { peerPhone, myPhone } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const flatListRef = useRef(null);
  const conversationId = messageStorage.getConversationId(myPhone, peerPhone);

  useEffect(() => {
    // Load messages from storage
    const loadMessages = async () => {
      try {
        const storedMessages = await messageStorage.getMessages(conversationId);
        setMessages(storedMessages);
      } catch (error) {
        console.error('[ChatScreen] Error loading messages:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    // Set navigation header
    navigation.setOptions({
      title: peerPhone || 'Chat',
      headerBackTitle: 'Back',
    });

    // Listen for incoming messages (just to update UI, global handler saves to storage)
    const handleMessage = async (data) => {
      if (data.from === peerPhone && data.type === 'text') {
        console.log('[ChatScreen] Incoming message from peer, reloading from storage');
        
        // Wait a bit for global handler to save the message
        setTimeout(async () => {
          const updatedMessages = await messageStorage.getMessages(conversationId);
          setMessages(updatedMessages);

          // Scroll to bottom
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }, 200);
      }
    };

    const handleMessageSent = async (data) => {
      console.log('[ChatScreen] Message sent confirmation received:', data);
      if (data.to === peerPhone) {
        setIsSending(false);
        // Find the message and update its status
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          console.log('[ChatScreen] Last message:', lastMessage);
          if (lastMessage && lastMessage.isSent && !lastMessage.messageId) {
            console.log('[ChatScreen] Updating message with server ID:', data.messageId);
            const updatedMessages = prevMessages.map((msg, index) =>
              index === prevMessages.length - 1
                ? { ...msg, messageId: data.messageId, status: data.status || 'sent' }
                : msg
            );
            // Save updated messages to storage
            messageStorage.saveMessages(conversationId, updatedMessages);
            return updatedMessages;
          } else {
            console.log('[ChatScreen] Not updating message - conditions not met');
          }
          return prevMessages;
        });
      }
    };

    const handleOfflineMessages = async ({ messages: offlineMsgs }) => {
      const relevantMessages = offlineMsgs.filter(
        (msg) => msg.from === peerPhone && msg.type === 'text'
      );

      if (relevantMessages.length > 0) {
        console.log('[ChatScreen] Offline messages received, reloading from storage');
        
        // Wait for global handler to save the messages
        setTimeout(async () => {
          const updatedMessages = await messageStorage.getMessages(conversationId);
          setMessages(updatedMessages);

          // Scroll to bottom
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }, 300);
      }
    };

    const handleError = ({ message }) => {
      console.error('[ChatScreen] Socket error received:', message);
      setIsSending(false);
      Alert.alert('Error', message || 'Failed to send message');
    };

    socketService.on('message', handleMessage);
    socketService.on('message-sent', handleMessageSent);
    socketService.on('offline-messages', handleOfflineMessages);
    socketService.on('error', handleError);

    return () => {
      socketService.off('message', handleMessage);
      socketService.off('message-sent', handleMessageSent);
      socketService.off('offline-messages', handleOfflineMessages);
      socketService.off('error', handleError);
    };
  }, [peerPhone, navigation, conversationId]);

  const handleSend = async () => {
    const trimmedText = inputText.trim();
    if (!trimmedText || isSending) {
      return;
    }

    const tempMessage = {
      id: generateUniqueId(),
      text: trimmedText,
      from: myPhone,
      to: peerPhone,
      timestamp: new Date().toISOString(),
      isSent: true,
      messageId: null,
    };

    console.log('[ChatScreen] Sending message:', tempMessage.id);

    try {
      // Check socket connection first
      const connectionStatus = socketService.getConnectionStatus();
      if (!connectionStatus.isConnected) {
        console.error('[ChatScreen] Socket not connected');
        Alert.alert('Error', 'Not connected to server. Please check your connection.');
        return;
      }

      setInputText('');
      setIsSending(true);

      // Add message to local state immediately (optimistic update)
      setMessages((prevMessages) => [...prevMessages, tempMessage]);

      // Send message via socket
      console.log('[ChatScreen] Emitting send-message to socket');
      socketService.sendMessage(peerPhone, trimmedText);

      // Save to storage (async, non-blocking)
      messageStorage.addMessage(conversationId, tempMessage).catch(err => {
        console.error('[ChatScreen] Error saving message to storage:', err);
      });

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('[ChatScreen] Error sending message:', error);
      setIsSending(false);
      Alert.alert('Error', error.message || 'Failed to send message');
      // Remove the temp message on error
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== tempMessage.id)
      );
    }
  };

  const formatTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      // If less than 1 minute ago
      if (diff < 60000) {
        return 'Just now';
      }

      // If today
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
      }

      // Otherwise show date and time
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.isSent;
    return (
      <View
        style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessageContainer : styles.peerMessageContainer,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.peerMessageBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.peerMessageText,
            ]}
          >
            {item.text}
          </Text>
          <Text
            style={[
              styles.messageTime,
              isMyMessage ? styles.myMessageTime : styles.peerMessageTime,
            ]}
          >
            {formatTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.textSecondary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={1000}
          editable={!isSending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isSending}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: STYLES.spacing.md,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  messagesList: {
    padding: STYLES.spacing.md,
  },
  messageContainer: {
    marginBottom: STYLES.spacing.sm,
  },
  myMessageContainer: {
    alignItems: 'flex-end',
  },
  peerMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: STYLES.spacing.sm,
    borderRadius: STYLES.borderRadius.md,
  },
  myMessageBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: STYLES.borderRadius.xs,
  },
  peerMessageBubble: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: STYLES.borderRadius.xs,
  },
  messageText: {
    fontSize: 16,
    marginBottom: STYLES.spacing.xs,
  },
  myMessageText: {
    color: COLORS.surface,
  },
  peerMessageText: {
    color: COLORS.text,
  },
  messageTime: {
    fontSize: 10,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  peerMessageTime: {
    color: COLORS.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: STYLES.spacing.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: STYLES.borderRadius.md,
    paddingHorizontal: STYLES.spacing.md,
    paddingVertical: STYLES.spacing.sm,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 100,
    marginRight: STYLES.spacing.sm,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: STYLES.spacing.md,
    paddingVertical: STYLES.spacing.sm,
    borderRadius: STYLES.borderRadius.md,
    justifyContent: 'center',
    minWidth: 60,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ChatScreen;
