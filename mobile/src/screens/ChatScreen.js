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
} from 'react-native';
import socketService from '../services/socketService';
import { COLORS, STYLES } from '../config/config';

const ChatScreen = ({ navigation, route }) => {
  const { peerPhone, myPhone } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    // Set navigation header
    navigation.setOptions({
      title: peerPhone || 'Chat',
      headerBackTitle: 'Back',
    });

    // Listen for incoming messages
    const handleMessage = (data) => {
      if (data.from === peerPhone && data.type === 'text') {
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: data.messageId || `msg_${Date.now()}`,
            text: data.message,
            from: data.from,
            to: data.to,
            timestamp: data.timestamp,
            isSent: false,
          },
        ]);

        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    };

    const handleMessageSent = (data) => {
      if (data.to === peerPhone) {
        setIsSending(false);
        // Find the message and update its status
        setMessages((prevMessages) => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          if (lastMessage && lastMessage.isSent && !lastMessage.messageId) {
            return prevMessages.map((msg, index) =>
              index === prevMessages.length - 1
                ? { ...msg, messageId: data.messageId, status: data.status || 'sent' }
                : msg
            );
          }
          return prevMessages;
        });
      }
    };

    const handleOfflineMessages = ({ messages: offlineMsgs }) => {
      const relevantMessages = offlineMsgs.filter(
        (msg) => msg.from === peerPhone && msg.type === 'text'
      );

      if (relevantMessages.length > 0) {
        const formattedMessages = relevantMessages.map((msg) => ({
          id: msg.messageId || `msg_${Date.now()}_${Math.random()}`,
          text: msg.message,
          from: msg.from,
          to: msg.to,
          timestamp: msg.timestamp,
          isSent: false,
        }));

        setMessages((prevMessages) => [...prevMessages, ...formattedMessages]);

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    };

    const handleError = ({ message }) => {
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
  }, [peerPhone, navigation]);

  const handleSend = () => {
    const trimmedText = inputText.trim();
    if (!trimmedText || isSending) {
      return;
    }

    try {
      // Add message to local state immediately (optimistic update)
      const tempMessage = {
        id: `temp_${Date.now()}`,
        text: trimmedText,
        from: myPhone,
        to: peerPhone,
        timestamp: new Date().toISOString(),
        isSent: true,
        messageId: null,
      };

      setMessages((prevMessages) => [...prevMessages, tempMessage]);
      setInputText('');
      setIsSending(true);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      // Send message via socket
      socketService.sendMessage(peerPhone, trimmedText);
    } catch (error) {
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

