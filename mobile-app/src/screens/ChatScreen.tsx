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
  Modal,
} from 'react-native';
import socketService from '../services/socketService';
import { downloadFile } from '../services/fileService';
import { Message, SocketMessage, Peer } from '../types';
import * as FileSystem from 'expo-file-system';

// Get document directory path - using any to bypass type checking for now
const getDocumentDirectory = (): string => {
  const fs = FileSystem as any;
  return fs.documentDirectory || fs.cacheDirectory || '';
};

interface ChatScreenProps {
  navigation: any;
}

const ChatScreen: React.FC<ChatScreenProps> = ({ navigation }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [onlinePeers, setOnlinePeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPeersModal, setShowPeersModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Set up socket listeners
    const handleIncomingMessage = (data: SocketMessage) => {
      if (data.type === 'file') {
        handleIncomingFile(data);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: data.messageId || Date.now().toString(),
            from: data.from,
            text: data.message || '',
            timestamp: data.timestamp,
            type: 'text',
          },
        ]);
        scrollToBottom();
      }
    };

    const handleOfflineMessages = (data: { messages: SocketMessage[] }) => {
      if (data.messages && data.messages.length > 0) {
        const newMessages: Message[] = data.messages.map((msg) => ({
          id: msg.messageId || Date.now().toString(),
          from: msg.from,
          text: msg.type === 'file' ? `📁 ${msg.originalName || ''}` : msg.message || '',
          timestamp: msg.timestamp,
          type: msg.type || 'text',
          fileId: msg.fileId,
        }));
        setMessages((prev) => [...prev, ...newMessages]);
        Alert.alert('Offline Messages', `You have ${data.messages.length} offline message(s)`);
      }
    };

    const handlePeerOnline = (data: { phoneNumber: string }) => {
      console.log('Peer came online:', data.phoneNumber);
      loadOnlinePeers();
    };

    const handlePeerOffline = (data: { phoneNumber: string }) => {
      console.log('Peer went offline:', data.phoneNumber);
      loadOnlinePeers();
    };

    const handleError = (data: { message: string }) => {
      Alert.alert('Error', data.message || 'An error occurred');
    };

    socketService.on('message', handleIncomingMessage);
    socketService.on('offline-messages', handleOfflineMessages);
    socketService.on('peer-online', handlePeerOnline);
    socketService.on('peer-offline', handlePeerOffline);
    socketService.on('error', handleError);

    // Load online peers
    loadOnlinePeers();

    // Cleanup on unmount
    return () => {
      socketService.off('message', handleIncomingMessage);
      socketService.off('offline-messages', handleOfflineMessages);
      socketService.off('peer-online', handlePeerOnline);
      socketService.off('peer-offline', handlePeerOffline);
      socketService.off('error', handleError);
    };
  }, []);

  const loadOnlinePeers = async () => {
    try {
      const peers = await socketService.getOnlinePeers();
      setOnlinePeers(peers);
      console.log('Loaded peers:', peers);
    } catch (error) {
      console.error('Failed to load peers:', error);
      Alert.alert('Error', 'Failed to load online peers');
    }
  };

  const handlePeerSelect = (phoneNumber: string) => {
    setRecipientPhone(phoneNumber);
    setShowPeersModal(false);
  };

  const handleIncomingFile = async (data: SocketMessage) => {
    if (!data.fileId) return;

    Alert.alert(
      'File Received',
      `${data.originalName || 'File'} from ${data.from}. Download now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            try {
              setLoading(true);
              const outputPath = `${getDocumentDirectory()}${data.originalName || 'file'}`;
              await downloadFile(data.fileId!, outputPath);
              Alert.alert('Success', `File saved to: ${outputPath}`);
              setMessages((prev) => [
                ...prev,
                {
                  id: data.messageId,
                  from: data.from,
                  text: `📁 ${data.originalName || 'File'}`,
                  timestamp: data.timestamp,
                  type: 'file',
                  fileId: data.fileId,
                },
              ]);
            } catch (error: any) {
              Alert.alert('Error', `Failed to download file: ${error.message}`);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !recipientPhone.trim()) {
      Alert.alert('Error', 'Please enter recipient phone number and message');
      return;
    }

    const messageText = inputText.trim();
    setInputText('');
    setLoading(true);

    try {
      await socketService.sendMessage(recipientPhone, messageText);

      // Add to local messages
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          from: socketService.getPhoneNumber() || 'You',
          to: recipientPhone,
          text: messageText,
          timestamp: new Date().toISOString(),
          type: 'text',
          sent: true,
        },
      ]);
      scrollToBottom();
    } catch (error: any) {
      Alert.alert('Send Failed', error.message || 'Could not send message');
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isSent = item.sent || item.from === socketService.getPhoneNumber();

    return (
      <View
        style={[
          styles.messageContainer,
          isSent ? styles.sentMessage : styles.receivedMessage,
        ]}
      >
        <Text style={styles.messageFrom}>{item.from}</Text>
        <Text style={styles.messageText}>{item.text}</Text>
        <Text style={styles.messageTime}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Chat - {socketService.getPhoneNumber()}
        </Text>
        <TouchableOpacity
          style={styles.peersButton}
          onPress={() => {
            loadOnlinePeers();
            setShowPeersModal(true);
          }}
        >
          <Text style={styles.peersButtonText}>Peers ({onlinePeers.length})</Text>
        </TouchableOpacity>
      </View>

      {/* Peers Modal */}
      <Modal
        visible={showPeersModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPeersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Online Peers</Text>
              <TouchableOpacity
                onPress={() => setShowPeersModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {onlinePeers.length === 0 ? (
              <View style={styles.emptyPeers}>
                <Text style={styles.emptyPeersText}>No other peers online</Text>
                <TouchableOpacity
                  onPress={loadOnlinePeers}
                  style={styles.refreshButton}
                >
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={onlinePeers}
                keyExtractor={(item) => item.phoneNumber}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.peerItem}
                    onPress={() => handlePeerSelect(item.phoneNumber)}
                  >
                    <View style={styles.peerInfo}>
                      <View style={styles.peerIndicator} />
                      <Text style={styles.peerPhoneNumber}>{item.phoneNumber}</Text>
                    </View>
                    <Text style={styles.peerTime}>
                      Connected: {new Date(item.connectedAt).toLocaleTimeString()}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.recipientInput}>
        <TextInput
          style={styles.recipientField}
          placeholder="Recipient phone number"
          value={recipientPhone}
          onChangeText={setRecipientPhone}
          keyboardType="phone-pad"
        />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          multiline={true}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, loading && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  peersButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  peersButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  recipientInput: {
    backgroundColor: '#fff',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  recipientField: {
    fontSize: 14,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 10,
  },
  messageContainer: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  sentMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  receivedMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
  },
  messageFrom: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    color: '#666',
  },
  messageText: {
    fontSize: 16,
    color: '#000',
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  emptyPeers: {
    padding: 40,
    alignItems: 'center',
  },
  emptyPeersText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  peerItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  peerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  peerIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    marginRight: 10,
  },
  peerPhoneNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  peerTime: {
    fontSize: 12,
    color: '#666',
    marginLeft: 20,
  },
});

export default ChatScreen;

