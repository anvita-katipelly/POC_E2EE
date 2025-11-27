import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  PermissionsAndroid,
  Image,
  Modal,
  Keyboard,
} from 'react-native';
import socketService from '../services/socketService';
import messageStorage from '../services/messageStorage';
import contactsService from '../services/contactsService';
import encryptionService from '../services/encryptionService';
import webrtcService from '../services/webrtcService';
import mediaUploadService from '../services/mediaUploadService';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import { COLORS, STYLES } from '../config/config';
import RNFS from 'react-native-fs';
import WebView from 'react-native-webview';
import Video from 'react-native-video';

const isImageAttachment = (message) => {
  if (!message) {
    return false;
  }
  if (message.mimeType && message.mimeType.startsWith('image/')) {
    return true;
  }
  const name = message.fileName || '';
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name);
};

const sanitizeFileName = (name) => {
  if (!name) {
    return `media_${Date.now()}.bin`;
  }
  return name.replace(/[^\w\-.]/g, '_');
};

const getDownloadDirectory = () => {
  if (Platform.OS === 'android' && RNFS.DownloadDirectoryPath) {
    return `${RNFS.DownloadDirectoryPath}/E2EE`;
  }
  return `${RNFS.DocumentDirectoryPath}/E2EE`;
};

const formatContactLabel = (name, phone) => {
  if (!phone) {
    return name || '';
  }
  if (!name || name === phone) {
    return phone;
  }
  return `${name} (${phone})`;
};

const REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const stripFileScheme = (uri = '') => uri.replace(/^file:\/\//, '');

// Forward Contact Selection Component
const ForwardContactScreen = ({ message, myPhone, onClose, navigation }) => {
  const [contacts, setContacts] = useState([]);
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContacts = async () => {
      setLoading(true);
      try {
        const rawContacts = await contactsService.loadContacts();
        const allContacts = Array.isArray(rawContacts) ? rawContacts : [];
        const normalizedMyPhone = myPhone?.replace(/[\s\-()]/g, '') || '';
        
        // Filter out current chat peer
        const filteredContacts = allContacts.filter(contact => {
          const normalizedContact = contact.phoneNumbers?.[0]?.number?.replace(/[\s\-()]/g, '') || '';
          return normalizedContact && normalizedContact !== normalizedMyPhone;
        });

        setContacts(filteredContacts);
        
        // Get online peers
        socketService.getOnlinePeers();
        socketService.on('online-peers', (data) => {
          const onlinePeers = (data.peers || []).filter(peer => {
            const normalizedPeer = peer.phoneNumber?.replace(/[\s\-()]/g, '') || '';
            return normalizedPeer && normalizedPeer !== normalizedMyPhone;
          });
          setPeers(onlinePeers);
        });
      } catch (error) {
        console.error('[ForwardContactScreen] Error loading contacts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
  }, [myPhone]);

  const formatDisplayLabel = useCallback((phone) => {
    if (!phone) return '';
    const name = contactsService.getDisplayName(phone);
    if (!name || name === phone) {
      return phone;
    }
    return `${name} (${phone})`;
  }, []);

  const handleForward = async (toPhone) => {
    try {
      const normalizedToPhone = toPhone?.replace(/[\s\-()]/g, '') || '';
      const normalizedMyPhone = myPhone?.replace(/[\s\-()]/g, '') || '';

      if (message.type === 'text') {
        // Forward text message
        const encrypted = await encryptionService.encryptMessage(
          message.text,
          normalizedMyPhone,
          normalizedToPhone
        );

        socketService.sendMessage(normalizedToPhone, encrypted);

        const conversationId = messageStorage.getConversationId(normalizedMyPhone, normalizedToPhone);
        const forwardedMessage = {
          id: generateUniqueId(),
          type: 'text',
          text: message.text,
          from: normalizedMyPhone,
          to: normalizedToPhone,
          timestamp: new Date().toISOString(),
          isSent: true,
          isForwarded: true,
          originalFrom: message.from,
        };

        await messageStorage.addMessage(conversationId, forwardedMessage, normalizedMyPhone);
      } else if (message.type === 'file') {
        // Forward file - reuse the same fileId
        const conversationId = messageStorage.getConversationId(normalizedMyPhone, normalizedToPhone);
        
        const forwardedMessage = {
          id: generateUniqueId(),
          type: 'file',
          text: message.caption || message.text || `[File] ${message.fileName}`,
          caption: message.caption,
          fileName: message.fileName,
          mimeType: message.mimeType,
          fileSize: message.fileSize,
          fileId: message.fileId,
          from: normalizedMyPhone,
          to: normalizedToPhone,
          timestamp: new Date().toISOString(),
          isSent: true,
          isForwarded: true,
          originalFrom: message.from,
          status: 'sent',
        };

        // Send file notification
        await socketService.sendFile({
          to: normalizedToPhone,
          fileId: message.fileId,
          originalName: message.fileName,
          totalChunks: 1, // Will be determined by server
          mimeType: message.mimeType,
          size: message.fileSize,
        });

        await messageStorage.addMessage(conversationId, forwardedMessage, normalizedMyPhone);
      }

      Alert.alert('Success', 'Message forwarded');
      onClose();
    } catch (error) {
      console.error('[ForwardContactScreen] Error forwarding message:', error);
      Alert.alert('Error', 'Failed to forward message: ' + error.message);
    }
  };

  // Combine contacts and peers
  const combinedList = React.useMemo(() => {
    const processed = new Set();
    const list = [];

    // Add contacts
    contacts.forEach(contact => {
      const phone = contact.phoneNumbers?.[0]?.number;
      if (phone) {
        const normalized = phone.replace(/[\s\-()]/g, '');
        if (!processed.has(normalized)) {
          list.push({
            phoneNumber: phone,
            displayLabel: formatDisplayLabel(phone),
            isContact: true,
          });
          processed.add(normalized);
        }
      }
    });

    // Add online peers
    peers.forEach(peer => {
      const phone = peer.phoneNumber;
      if (phone) {
        const normalized = phone.replace(/[\s\-()]/g, '');
        if (!processed.has(normalized)) {
          list.push({
            phoneNumber: phone,
            displayLabel: formatDisplayLabel(phone),
            isContact: false,
            isOnline: true,
          });
          processed.add(normalized);
        }
      }
    });

    return list.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [contacts, peers]);

  const renderContact = ({ item }) => (
    <TouchableOpacity
      style={styles.forwardContactItem}
      onPress={() => handleForward(item.phoneNumber)}
    >
      <View style={styles.forwardContactAvatar}>
        <Text style={styles.forwardContactAvatarText}>
          {item.displayLabel.charAt(0).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.forwardContactName}>{item.displayLabel}</Text>
      {item.isOnline && <Text style={styles.forwardContactOnline}>●</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.forwardModalOverlay}>
      <View style={styles.forwardModalContainer}>
        <View style={styles.forwardModalHeader}>
          <Text style={styles.forwardModalTitle}>Forward to</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.forwardModalClose}>✕</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={styles.forwardLoadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={combinedList}
            renderItem={renderContact}
            keyExtractor={(item) => item.phoneNumber}
            style={styles.forwardContactList}
          />
        )}
      </View>
    </View>
  );
};
const ensureDirectoryExists = async (dirPath) => {
  try {
    const exists = await RNFS.exists(dirPath);
    if (!exists) {
      await RNFS.mkdir(dirPath);
    }
  } catch (error) {
    console.error('[ChatScreen] Failed to create directory:', dirPath, error);
    throw error;
  }
};

// Helper to generate unique IDs
const generateUniqueId = () => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const ChatScreen = ({ navigation, route }) => {
  const { peerPhone, myPhone } = route.params || {};
  
  // Normalize phone numbers (remove spaces, dashes, etc)
  const normalizedPeerPhone = peerPhone?.replace(/[\s\-()]/g, '') || peerPhone;
  const normalizedMyPhone = myPhone?.replace(/[\s\-()]/g, '') || myPhone;
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingMediaMessageId, setPendingMediaMessageId] = useState(null);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [pendingMedia, setPendingMedia] = useState(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [forwardTarget, setForwardTarget] = useState(null);
  const flatListRef = useRef(null);
  const autoDownloadQueue = useRef(new Set());
  const conversationId = messageStorage.getConversationId(normalizedMyPhone, normalizedPeerPhone);

  console.log('[ChatScreen] Initialized with:', { 
    originalPeerPhone: peerPhone,
    normalizedPeerPhone,
    originalMyPhone: myPhone,
    normalizedMyPhone,
    conversationId 
  });

  const loadMessages = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    }
    try {
      const storedMessages = await messageStorage.getMessages(conversationId);
      setMessages(storedMessages);
      
      // Clear unread count when opening or revisiting the chat
      await messageStorage.clearUnreadCount(conversationId);
    } catch (error) {
      console.error('[ChatScreen] Error loading messages:', error);
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, [conversationId]);

  useEffect(() => {
    loadMessages(true);
  }, [loadMessages]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadMessages();
    });

    return unsubscribe;
  }, [navigation, loadMessages]);

  useEffect(() => {
    // Set navigation header with contact name and call buttons
    const displayName = contactsService.getDisplayName(peerPhone);
    const headerTitle = formatContactLabel(displayName, peerPhone);
    navigation.setOptions({
      title: headerTitle || 'Chat',
      headerBackTitle: 'Back',
      headerRight: () => (
        <View style={{ flexDirection: 'row', marginRight: 10 }}>
          <TouchableOpacity
            style={{ padding: 10 }}
            onPress={handleVoiceCall}
          >
            <Text style={{ fontSize: 20 }}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ padding: 10, marginLeft: 10 }}
            onPress={handleVideoCall}
          >
            <Text style={{ fontSize: 20 }}>📹</Text>
          </TouchableOpacity>
        </View>
      ),
    });

    // Listen for incoming messages (just to update UI, global handler saves to storage)
    const handleMessage = async (data) => {
      const normalizedDataFrom = data.from?.replace(/[\s\-()]/g, '');
      if (normalizedDataFrom === normalizedPeerPhone && (data.type === 'text' || data.type === 'file')) {
        console.log('[ChatScreen] Incoming message from peer, reloading from storage');
        
        // Wait a bit for global handler to save the message
        setTimeout(async () => {
          const updatedMessages = await messageStorage.getMessages(conversationId);
          setMessages(updatedMessages);

          // Clear unread count since chat is open and user is viewing the message
          await messageStorage.clearUnreadCount(conversationId);
          console.log('[ChatScreen] Cleared unread count (chat is open)');

          // Scroll to bottom
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }, 200);
      }
    };

    const handleMessageSent = async (data) => {
      console.log('[ChatScreen] Message sent confirmation received:', data);
      const normalizedDataTo = data.to?.replace(/[\s\-()]/g, '');
      if (normalizedDataTo === normalizedPeerPhone) {
        if (data.type !== 'file') {
          setIsSending(false);
        } else if (data.type === 'file' && pendingMediaMessageId) {
          setIsUploading(false);
          setPendingMediaMessageId(null);
        }

        setMessages((prevMessages) => {
          let updated = prevMessages;

          if (data.type === 'file' && data.fileId) {
            updated = prevMessages.map((msg) =>
              msg.fileId === data.fileId
                ? { ...msg, messageId: data.messageId, status: data.status || 'sent' }
                : msg
            );
          } else {
            const lastMessage = prevMessages[prevMessages.length - 1];
            if (lastMessage && lastMessage.isSent && !lastMessage.messageId) {
              updated = prevMessages.map((msg, index) =>
                index === prevMessages.length - 1
                  ? { ...msg, messageId: data.messageId, status: data.status || 'sent' }
                  : msg
              );
            }
          }

          if (updated !== prevMessages) {
            messageStorage.saveMessages(conversationId, updated);
          }

          return updated;
        });
      }
    };

    const handleOfflineMessages = async ({ messages: offlineMsgs }) => {
      const relevantMessages = offlineMsgs.filter(
        (msg) => {
          const normalizedMsgFrom = msg.from?.replace(/[\s\-()]/g, '');
          return normalizedMsgFrom === normalizedPeerPhone && msg.type === 'text';
        }
      );

      if (relevantMessages.length > 0) {
        console.log('[ChatScreen] Offline messages received, reloading from storage');
        
        // Wait for global handler to save the messages
        setTimeout(async () => {
          const updatedMessages = await messageStorage.getMessages(conversationId);
          setMessages(updatedMessages);

          // Clear unread count since chat is open and user is viewing the messages
          await messageStorage.clearUnreadCount(conversationId);
          console.log('[ChatScreen] Cleared unread count for offline messages (chat is open)');

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

  const updateStoredMessage = useCallback(
    async (messageId, updates) => {
      try {
        const stored = await messageStorage.getMessages(conversationId);
        const index = stored.findIndex((msg) => msg.id === messageId);
        if (index >= 0) {
          stored[index] = { ...stored[index], ...updates };
          await messageStorage.saveMessages(conversationId, stored);
        }
      } catch (err) {
        console.error('[ChatScreen] Failed to persist message update:', err);
      }
    },
    [conversationId]
  );

  const handleMessageLongPress = useCallback((message) => {
    if (message.type === 'text') {
      setReactionTarget(message);
    } else {
      // Show forward/reaction options for media
      Alert.alert(
        'Message Options',
        'Choose an action',
        [
          {
            text: 'Forward',
            onPress: () => setForwardTarget(message),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ],
        { cancelable: true }
      );
    }
  }, []);

  const handleReactionSelect = useCallback(
    async (emoji) => {
      if (!reactionTarget) {
        return;
      }
      const targetId = reactionTarget.id;
      setMessages((prev) =>
        prev.map((msg) => (msg.id === targetId ? { ...msg, reaction: emoji } : msg))
      );
      await updateStoredMessage(targetId, { reaction: emoji });
      setReactionTarget(null);
    },
    [reactionTarget, updateStoredMessage]
  );

  const handleReactionClear = useCallback(async () => {
    if (!reactionTarget) {
      return;
    }
    const targetId = reactionTarget.id;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === targetId ? { ...msg, reaction: undefined } : msg))
    );
    await updateStoredMessage(targetId, { reaction: undefined });
    setReactionTarget(null);
  }, [reactionTarget, updateStoredMessage]);

  const closeReactionPicker = useCallback(() => {
    setReactionTarget(null);
  }, []);

  const handleOpenPreview = useCallback(
    (message) => {
      if (!message || message.type !== 'file') {
        return;
      }

      // Prefer already-downloaded local file
      let previewUri = message.localUri;

      // If we don't have a local file yet, stream directly from server
      if (!previewUri && message.fileId) {
        const connectionStatus = socketService.getConnectionStatus();
        const serverUrl =
          connectionStatus.serverUrl ||
          (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');
        previewUri = `${serverUrl}/receive/${message.fileId}`;
      }

      if (!previewUri) {
        Alert.alert('Preview unavailable', 'No preview source available for this file yet.');
        return;
      }

      setPreviewMedia({
        ...message,
        previewUri,
      });
    },
    []
  );

  const closeMediaPreview = useCallback(() => {
    setPreviewMedia(null);
  }, []);

  const handleAttachPress = () => {
    if (isUploading) {
      Alert.alert('Upload in progress', 'Please wait for the current upload to finish.');
      return;
    }

    Alert.alert(
      'Select Media',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: () => handleOpenCamera(),
        },
        {
          text: 'Media Library',
          onPress: () => handleOpenMediaLibrary(),
        },
        {
          text: 'Files',
          onPress: () => handleOpenDocumentPicker(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const handleConfirmMediaWithCaption = useCallback(async () => {
    if (!pendingMedia) return;
    const asset = pendingMedia;
    setPendingMedia(null);
    await handleSendMedia(asset, mediaCaption.trim());
    setMediaCaption('');
  }, [pendingMedia, mediaCaption]);

  const handleCancelMediaCaption = useCallback(() => {
    setPendingMedia(null);
    setMediaCaption('');
  }, []);

  const handleOpenCamera = async () => {
    // Check camera permissions on Android
    if (Platform.OS === 'android') {
      const hasCameraPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      
      if (!hasCameraPermission) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Camera permission is required to take photos/videos');
          return;
        }
      }
    }

    launchCamera(
      {
        mediaType: 'mixed',
        quality: 0.8,
        videoQuality: 'high',
        saveToPhotos: false,
      },
      async (response) => {
        if (response.didCancel) {
          return;
        }

        if (response.errorCode) {
          Alert.alert('Camera Error', response.errorMessage || 'Failed to open camera');
          return;
        }

        const asset = response.assets?.[0];
        if (asset?.uri) {
          await handleSendMedia(asset);
        } else {
          Alert.alert('Media Error', 'No media captured');
        }
      }
    );
  };

  const handleOpenMediaLibrary = () => {
    launchImageLibrary(
      {
        mediaType: 'mixed',
        selectionLimit: 1,
        quality: 0.8,
        videoQuality: 'high',
      },
      async (response) => {
        if (response.didCancel) {
          return;
        }

        if (response.errorCode) {
          Alert.alert('Media Error', response.errorMessage || 'Failed to open media library');
          return;
        }

        const asset = response.assets?.[0];
        if (asset?.uri) {
          setPendingMedia(asset);
          setMediaCaption('');
        } else {
          Alert.alert('Media Error', 'No media asset selected');
        }
      }
    );
  };

  const handleOpenDocumentPicker = async () => {
    try {
      const document = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
        presentationStyle: 'fullScreen',
      });

      const resolvedUri = document.fileCopyUri || document.uri;
      if (!resolvedUri) {
        Alert.alert('File Error', 'Unable to access the selected file.');
        return;
      }

      const asset = {
        uri: resolvedUri,
        fileName: document.name || sanitizeFileName(document.uri?.split('/').pop()),
        type: document.type || 'application/octet-stream',
        fileSize: document.size || 0,
      };

      setPendingMedia(asset);
      setMediaCaption('');
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        return;
      }
      console.error('[ChatScreen] Document picker error:', err);
      Alert.alert('File Error', err.message || 'Failed to select file');
    }
  };

  const handleSendMedia = async (asset, caption = '') => {
    const mediaName = asset.fileName || 'Attachment';
    const mimeType = asset.type || 'application/octet-stream';
    const fileSize = asset.fileSize || 0;

    const tempMessage = {
      id: generateUniqueId(),
      type: 'file',
      text: caption || `[File] ${mediaName}`,
      caption: caption || undefined,
      fileName: mediaName,
      mimeType,
      fileSize,
      from: normalizedMyPhone,
      to: normalizedPeerPhone,
      timestamp: new Date().toISOString(),
      isSent: true,
      status: 'uploading',
      uploadProgress: 0,
      fileId: null,
      localUri: asset.uri,
    };

    setMessages((prev) => [...prev, tempMessage]);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
    messageStorage
      .addMessage(conversationId, tempMessage, normalizedMyPhone)
      .catch((err) => console.error('[ChatScreen] Error storing temp media message:', err));

    setIsUploading(true);
    setUploadProgress(0);
    setPendingMediaMessageId(tempMessage.id);

    try {
      const result = await mediaUploadService.uploadMedia({
        fileUri: asset.uri,
        fileName: mediaName,
        mimeType,
        recipientPhone: normalizedPeerPhone,
        onProgress: (progress) => {
          setUploadProgress(progress);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempMessage.id ? { ...msg, uploadProgress: progress } : msg
            )
          );
        },
      });

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id
            ? {
                ...msg,
                fileId: result.fileId,
                status: 'sent',
                uploadProgress: 100,
              }
            : msg
        )
      );
      await updateStoredMessage(tempMessage.id, {
        fileId: result.fileId,
        status: 'sent',
        uploadProgress: 100,
      });
    } catch (error) {
      console.error('[ChatScreen] Media upload failed:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id ? { ...msg, status: 'failed', error: error.message } : msg
        )
      );
      Alert.alert('Upload failed', error.message || 'Unable to send media');
      await updateStoredMessage(tempMessage.id, {
        status: 'failed',
        error: error.message,
      });
    } finally {
      setIsUploading(false);
      setPendingMediaMessageId(null);
      setUploadProgress(0);
    }
  };

  const handleDownloadMedia = useCallback(
    async (message, options = {}) => {
      if (!message?.fileId) {
        if (!options.silent) {
          Alert.alert('Download unavailable', 'Missing file reference for this attachment.');
        }
        return;
      }

      if (message.status === 'downloading') {
        return;
      }

      const connectionStatus = socketService.getConnectionStatus();
      const serverUrl = connectionStatus.serverUrl || 'http://10.0.2.2:3000';
      const downloadUrl = `${serverUrl}/receive/${message.fileId}`;
      const safeName = sanitizeFileName(message.fileName || message.fileId);
      const localPath = `${RNFS.CachesDirectoryPath}/e2ee_${safeName}`;
      const displayUri = `file://${localPath}`;

      console.log('[ChatScreen] Downloading media:', { downloadUrl, fileId: message.fileId, serverUrl });

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === message.id ? { ...msg, status: 'downloading' } : msg
        )
      );

      try {
        const { promise } = RNFS.downloadFile({
          fromUrl: downloadUrl,
          toFile: localPath,
        });
        await promise;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id ? { ...msg, status: 'downloaded', localUri: displayUri } : msg
          )
        );
        await updateStoredMessage(message.id, {
          status: 'downloaded',
          localUri: displayUri,
        });

        return displayUri;
      } catch (error) {
        console.error('[ChatScreen] Failed to download media:', error);
        console.error('[ChatScreen] Download URL was:', downloadUrl);
        console.error('[ChatScreen] Server URL from socket:', serverUrl);
        if (!options.silent) {
          Alert.alert('Download failed', `${error.message || 'Unable to download media'}\n\nURL: ${downloadUrl.substring(0, 80)}...`);
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id ? { ...msg, status: 'failed' } : msg
          )
        );
        await updateStoredMessage(message.id, { status: 'failed' });
        throw error;
      }
    },
    [updateStoredMessage]
  );

  useEffect(() => {
    messages.forEach((msg) => {
      if (
        msg.type === 'file' &&
        isImageAttachment(msg) &&
        !msg.localUri &&
        msg.from !== normalizedMyPhone &&
        msg.status !== 'downloading' &&
        !autoDownloadQueue.current.has(msg.id)
      ) {
        autoDownloadQueue.current.add(msg.id);
        handleDownloadMedia(msg, { silent: true })
          .catch(() => null)
          .finally(() => {
            autoDownloadQueue.current.delete(msg.id);
          });
      }
    });
  }, [messages, normalizedMyPhone, handleDownloadMedia]);

  const handleSend = async () => {
    const trimmedText = inputText.trim();
    console.log('[ChatScreen] handleSend called, text:', trimmedText?.substring(0, 20));
    
    if (!trimmedText || isSending) {
      console.log('[ChatScreen] Not sending - empty or already sending');
      return;
    }

    const tempMessage = {
      id: generateUniqueId(),
      type: 'text',
      text: trimmedText,
      from: normalizedMyPhone,
      to: normalizedPeerPhone,
      timestamp: new Date().toISOString(),
      isSent: true,
      messageId: null,
    };

    console.log('[ChatScreen] Preparing message:', {
      id: tempMessage.id,
      from: normalizedMyPhone,
      to: normalizedPeerPhone,
      textLength: trimmedText.length
    });

    try {
      // Check socket connection first
      const connectionStatus = socketService.getConnectionStatus();
      console.log('[ChatScreen] Socket status:', connectionStatus);
      
      if (!connectionStatus.isConnected) {
        console.error('[ChatScreen] Socket not connected');
        Alert.alert('Error', 'Not connected to server. Please check your connection.');
        return;
      }

      setInputText('');
      setIsSending(true);
      console.log('[ChatScreen] Input cleared, sending flag set');

      // Add message to local state immediately (optimistic update)
      setMessages((prevMessages) => {
        console.log('[ChatScreen] Adding message to state, current count:', prevMessages.length);
        return [...prevMessages, tempMessage];
      });

      // Encrypt message before sending
      console.log('[ChatScreen] Encrypting message...');
      const encryptedPayload = encryptionService.encryptMessage(trimmedText);
      console.log('[ChatScreen] Message encrypted successfully');

      // Send encrypted message via socket
      console.log('[ChatScreen] Calling socketService.sendMessage with encrypted payload');
      socketService.sendMessage(normalizedPeerPhone, {
        encrypted: true,
        encryptedData: encryptedPayload.encryptedData,
        mediaKey: encryptedPayload.mediaKey,
        iv: encryptedPayload.iv,
        hmac: encryptedPayload.hmac,
      });
      console.log('[ChatScreen] socketService.sendMessage returned');

      // Save to storage (async, non-blocking)
      messageStorage.addMessage(conversationId, tempMessage, normalizedMyPhone).catch(err => {
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

  // Handle voice call
  const handleVoiceCall = async () => {
    try {
      console.log('[ChatScreen] Initiating voice call to', normalizedPeerPhone);
      
      // Check if camera/mic permissions are granted
      if (Platform.OS === 'android') {
        const hasMicPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        
        if (!hasMicPermission) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
          );
          
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission Denied', 'Microphone permission is required for voice calls');
            return;
          }
        }
      }
      
      // Initiate call through WebRTC service
      const offer = await webrtcService.initiateCall(normalizedPeerPhone, false);
      
      // Set up ICE candidate callback
      webrtcService.onIceCandidate = (candidate) => {
        socketService.sendIceCandidate(normalizedPeerPhone, candidate);
      };
      
      // Send call offer through signaling server
      socketService.sendCallOffer(normalizedPeerPhone, offer, false);
      
      // Navigate to call screen
      navigation.navigate('Call', {
        peerPhone: normalizedPeerPhone,
        isVideo: false,
        isOutgoing: true,
        myPhone: normalizedMyPhone,
      });
    } catch (error) {
      console.error('[ChatScreen] Error initiating voice call:', error);
      Alert.alert('Call Failed', error.message || 'Failed to start voice call');
    }
  };

  // Handle video call
  const handleVideoCall = async () => {
    try {
      console.log('[ChatScreen] Initiating video call to', normalizedPeerPhone);
      
      // Check if camera/mic permissions are granted
      if (Platform.OS === 'android') {
        const hasCameraPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        const hasMicPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        
        if (!hasCameraPermission || !hasMicPermission) {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
          
          if (granted['android.permission.CAMERA'] !== PermissionsAndroid.RESULTS.GRANTED ||
              granted['android.permission.RECORD_AUDIO'] !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission Denied', 'Camera and microphone permissions are required for video calls');
            return;
          }
        }
      }
      
      // Initiate call through WebRTC service
      const offer = await webrtcService.initiateCall(normalizedPeerPhone, true);
      
      // Set up ICE candidate callback
      webrtcService.onIceCandidate = (candidate) => {
        socketService.sendIceCandidate(normalizedPeerPhone, candidate);
      };
      
      // Send call offer through signaling server
      socketService.sendCallOffer(normalizedPeerPhone, offer, true);
      
      // Navigate to call screen
      navigation.navigate('Call', {
        peerPhone: normalizedPeerPhone,
        isVideo: true,
        isOutgoing: true,
        myPhone: normalizedMyPhone,
      });
    } catch (error) {
      console.error('[ChatScreen] Error initiating video call:', error);
      Alert.alert('Call Failed', error.message || 'Failed to start video call');
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

  const renderPreviewContent = () => {
    if (!previewMedia) {
      return null;
    }
    const uri = previewMedia.previewUri || previewMedia.localUri;
    if (!uri) {
      return (
        <Text style={styles.previewFallbackText}>
          Unable to preview this file.
        </Text>
      );
    }

    const isHttp = uri.startsWith('http://') || uri.startsWith('https://');
    const normalizedUri = isHttp
      ? uri
      : uri.startsWith('file://')
        ? uri
        : `file://${uri}`;
    const safeUri = isHttp ? uri : encodeURI(normalizedUri);
    const baseWebViewProps = {
      originWhitelist: ['*'],
      allowsInlineMediaPlayback: true,
      mediaPlaybackRequiresUserAction: false,
      allowFileAccess: true,
      allowFileAccessFromFileURLs: true,
      allowUniversalAccessFromFileURLs: true,
      javaScriptEnabled: true,
    };

    if (previewMedia.mimeType?.startsWith('image/')) {
      return <Image source={{ uri: safeUri }} style={styles.previewImage} resizeMode="contain" />;
    }

    if (previewMedia.mimeType?.startsWith('video/')) {
      return (
        <Video
          source={{ uri: safeUri }}
          style={styles.previewVideo}
          controls
          resizeMode="contain"
          paused={false}
          repeat={false}
        />
      );
    }

    if (previewMedia.mimeType?.startsWith('audio/')) {
      return (
        <Video
          source={{ uri: safeUri }}
          style={styles.previewAudio}
          controls
          audioOnly
          paused={false}
          repeat={false}
        />
      );
    }

    if (previewMedia.mimeType === 'application/pdf') {
      return (
        <WebView
          {...baseWebViewProps}
          source={{ uri: safeUri }}
          style={styles.previewWeb}
        />
      );
    }

    return (
      <View style={styles.previewFallback}>
        <Text style={styles.previewFallbackEmoji}>📄</Text>
        <Text style={styles.previewFallbackText}>Preview not available for this file type.</Text>
      </View>
    );
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.from === normalizedMyPhone;
    const isFileMessage = item.type === 'file';
    const showImagePreview = isFileMessage && isImageAttachment(item);
    const hasLocalPreview = showImagePreview && !!item.localUri;

    return (
      <TouchableWithoutFeedback onLongPress={() => handleMessageLongPress(item)}>
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
            {isFileMessage ? (
            <View style={styles.attachmentContainer}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleOpenPreview(item)}
              >
                {showImagePreview ? (
                  hasLocalPreview ? (
                    <Image
                      source={{ uri: item.localUri }}
                      style={styles.attachmentPreview}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.attachmentPreviewPlaceholder}>
                      {item.status === 'downloading' ? (
                        <ActivityIndicator color={COLORS.primary} />
                      ) : (
                        <Text style={styles.previewPlaceholderText}>
                          Download to preview
                        </Text>
                      )}
                    </View>
                  )
                ) : (
                  <View style={styles.genericAttachmentPreview}>
                    <Text style={styles.genericAttachmentEmoji}>
                      {item.mimeType?.startsWith('video/')
                        ? '🎬'
                        : item.mimeType?.startsWith('audio/')
                        ? '🎵'
                        : item.mimeType === 'application/pdf'
                        ? '📄'
                        : '📁'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              {item.caption && (
                <Text
                  style={[
                    styles.messageText,
                    isMyMessage ? styles.myMessageText : styles.peerMessageText,
                    styles.captionText,
                  ]}
                >
                  {item.caption}
                </Text>
              )}
              {item.isForwarded && (
                <View style={styles.forwardedIndicator}>
                  <Text style={styles.forwardedText}>↗️ Forwarded</Text>
                </View>
              )}
              <Text style={styles.attachmentMeta}>
                {mediaUploadService.formatBytes(item.fileSize)} · {item.status || 'pending'}
              </Text>
              {item.status === 'uploading' && (
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${item.uploadProgress || 0}%` },
                    ]}
                  />
                </View>
              )}
              {!item.localUri && item.fileId && (
                <TouchableOpacity
                  style={[
                    styles.downloadButton,
                    item.status === 'downloading' && styles.downloadButtonDisabled,
                  ]}
                  onPress={() => handleDownloadMedia(item)}
                  disabled={item.status === 'downloading'}
                >
                  <Text style={styles.downloadButtonText}>
                    {item.status === 'downloading' ? 'Downloading…' : 'Download'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {item.isForwarded && (
                <View style={styles.forwardedIndicator}>
                  <Text style={styles.forwardedText}>↗️ Forwarded</Text>
                </View>
              )}
              <Text
                style={[
                  styles.messageText,
                  isMyMessage ? styles.myMessageText : styles.peerMessageText,
                ]}
              >
                {item.text}
              </Text>
            </>
          )}
            {item.reaction && (
              <View
                style={[
                  styles.reactionTag,
                  isMyMessage ? styles.myReactionTag : styles.peerReactionTag,
                ]}
              >
                <Text style={styles.reactionTagText}>{item.reaction}</Text>
              </View>
            )}
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
      </TouchableWithoutFeedback>
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
    <>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
          <TouchableOpacity
            style={[
              styles.attachButton,
              (isUploading || isSending) && styles.attachButtonDisabled,
            ]}
            onPress={handleAttachPress}
            disabled={isUploading || isSending}
          >
            <Text style={styles.attachButtonText}>📎</Text>
          </TouchableOpacity>
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
            onPress={() => {
              console.log('[ChatScreen] Send button pressed');
              handleSend();
            }}
            disabled={!inputText.trim() || isSending}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
        {isUploading && (
          <Text style={styles.uploadStatus}>
            Uploading media... {uploadProgress}%
          </Text>
        )}
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <Modal
        visible={!!reactionTarget}
        transparent
        animationType="fade"
        onRequestClose={closeReactionPicker}
      >
        <TouchableWithoutFeedback onPress={closeReactionPicker}>
          <View style={styles.reactionOverlay}>
            <View style={styles.reactionPicker}>
              {REACTION_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionEmojiButton}
                  onPress={() => handleReactionSelect(emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              {reactionTarget?.reaction && (
                <TouchableOpacity
                  style={styles.reactionClearButton}
                  onPress={handleReactionClear}
                >
                  <Text style={styles.reactionClearText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={!!previewMedia}
        transparent
        animationType="fade"
        onRequestClose={closeMediaPreview}
      >
        <TouchableWithoutFeedback onPress={closeMediaPreview}>
          <View style={styles.previewOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.previewContainer}>{renderPreviewContent()}</View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={!!pendingMedia}
        transparent
        animationType="slide"
        onRequestClose={handleCancelMediaCaption}
      >
        <View style={styles.captionModalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <KeyboardAvoidingView
              style={styles.captionModalContainer}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
            >
              <Text style={styles.captionModalTitle}>Add Caption (Optional)</Text>
              {pendingMedia && (
                <View style={styles.captionPreviewContainer}>
                  {isImageAttachment({ mimeType: pendingMedia.type, fileName: pendingMedia.fileName }) ? (
                    <Image
                      source={{ uri: pendingMedia.uri }}
                      style={styles.captionPreviewImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.captionPreviewPlaceholder}>
                      <Text style={styles.captionPreviewEmoji}>
                        {pendingMedia.type?.startsWith('video/')
                          ? '🎬'
                          : pendingMedia.type?.startsWith('audio/')
                          ? '🎵'
                          : pendingMedia.type === 'application/pdf'
                          ? '📄'
                          : '📁'}
                      </Text>
                      <Text style={styles.captionPreviewText}>
                        {pendingMedia.fileName || 'File'}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <TextInput
                style={styles.captionInput}
                placeholder="Add a caption..."
                placeholderTextColor={COLORS.textSecondary}
                value={mediaCaption}
                onChangeText={setMediaCaption}
                multiline
                maxLength={500}
                autoFocus
              />
              <View style={styles.captionModalActions}>
                <TouchableOpacity
                  style={[styles.captionButton, styles.captionCancelButton]}
                  onPress={handleCancelMediaCaption}
                >
                  <Text style={styles.captionCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.captionButton, styles.captionSendButton]}
                  onPress={handleConfirmMediaWithCaption}
                >
                  <Text style={styles.captionSendText}>Send</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </Modal>

      <Modal
        visible={!!forwardTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardTarget(null)}
      >
        <ForwardContactScreen
          message={forwardTarget}
          myPhone={normalizedMyPhone}
          onClose={() => setForwardTarget(null)}
          navigation={navigation}
        />
      </Modal>
    </>
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
  reactionTag: {
    marginTop: STYLES.spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    paddingHorizontal: STYLES.spacing.xs,
    paddingVertical: 2,
    borderRadius: STYLES.borderRadius.sm,
  },
  myReactionTag: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  peerReactionTag: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  reactionTagText: {
    fontSize: 16,
  },
  reactionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: STYLES.spacing.md,
  },
  reactionPicker: {
    backgroundColor: COLORS.surface,
    borderRadius: STYLES.borderRadius.lg,
    paddingVertical: STYLES.spacing.sm,
    paddingHorizontal: STYLES.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reactionEmojiButton: {
    marginHorizontal: 6,
  },
  reactionEmoji: {
    fontSize: 26,
  },
  reactionClearButton: {
    marginLeft: STYLES.spacing.sm,
    paddingHorizontal: STYLES.spacing.sm,
    paddingVertical: 4,
    borderRadius: STYLES.borderRadius.sm,
    backgroundColor: COLORS.border,
  },
  reactionClearText: {
    fontSize: 12,
    color: COLORS.text,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: STYLES.spacing.md,
  },
  previewContainer: {
    width: '100%',
    height: '80%',
    borderRadius: STYLES.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewWeb: {
    flex: 1,
    width: '100%',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  previewAudio: {
    width: '100%',
    height: 100,
    backgroundColor: '#000',
  },
  previewFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: STYLES.spacing.lg,
  },
  previewFallbackEmoji: {
    fontSize: 48,
    marginBottom: STYLES.spacing.md,
  },
  previewFallbackText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
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
  attachmentContainer: {
    width: '100%',
  },
  attachmentMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: STYLES.spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.secondary,
  },
  downloadButton: {
    marginTop: STYLES.spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: STYLES.spacing.sm,
    paddingVertical: 4,
    borderRadius: STYLES.borderRadius.sm,
    backgroundColor: COLORS.primary,
  },
  downloadButtonText: {
    color: COLORS.surface,
    fontWeight: '600',
  },
  downloadButtonDisabled: {
    opacity: 0.6,
  },
  attachmentPreview: {
    width: 180,
    height: 180,
    borderRadius: STYLES.borderRadius.md,
    marginBottom: STYLES.spacing.sm,
  },
  attachmentPreviewPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: STYLES.borderRadius.md,
    marginBottom: STYLES.spacing.sm,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: STYLES.spacing.sm,
  },
  previewPlaceholderText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  genericAttachmentPreview: {
    width: 180,
    height: 180,
    borderRadius: STYLES.borderRadius.md,
    marginBottom: STYLES.spacing.sm,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  genericAttachmentEmoji: {
    fontSize: 48,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: STYLES.spacing.sm,
  },
  attachButtonText: {
    fontSize: 20,
  },
  attachButtonDisabled: {
    opacity: 0.4,
  },
  uploadStatus: {
    color: COLORS.textSecondary,
    fontSize: 12,
    paddingHorizontal: STYLES.spacing.md,
    paddingBottom: STYLES.spacing.sm,
  },
  captionText: {
    marginTop: STYLES.spacing.xs,
  },
  forwardedIndicator: {
    marginTop: STYLES.spacing.xs,
    marginBottom: STYLES.spacing.xs,
  },
  forwardedText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  captionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  captionModalContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: STYLES.spacing.lg,
    maxHeight: '80%',
  },
  captionModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: STYLES.spacing.md,
  },
  captionPreviewContainer: {
    width: '100%',
    height: 200,
    borderRadius: STYLES.borderRadius.md,
    overflow: 'hidden',
    marginBottom: STYLES.spacing.md,
    backgroundColor: COLORS.background,
  },
  captionPreviewImage: {
    width: '100%',
    height: '100%',
  },
  captionPreviewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  captionPreviewEmoji: {
    fontSize: 48,
    marginBottom: STYLES.spacing.sm,
  },
  captionPreviewText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  captionInput: {
    backgroundColor: COLORS.background,
    borderRadius: STYLES.borderRadius.md,
    padding: STYLES.spacing.md,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 100,
    maxHeight: 150,
    marginBottom: STYLES.spacing.md,
    textAlignVertical: 'top',
  },
  captionModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: STYLES.spacing.md,
  },
  captionButton: {
    paddingHorizontal: STYLES.spacing.lg,
    paddingVertical: STYLES.spacing.sm,
    borderRadius: STYLES.borderRadius.md,
    minWidth: 80,
    alignItems: 'center',
  },
  captionCancelButton: {
    backgroundColor: COLORS.background,
  },
  captionSendButton: {
    backgroundColor: COLORS.primary,
  },
  captionCancelText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  captionSendText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  forwardModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  forwardModalContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  forwardModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: STYLES.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  forwardModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  forwardModalClose: {
    fontSize: 24,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
  forwardLoadingContainer: {
    padding: STYLES.spacing.xl,
    alignItems: 'center',
  },
  forwardContactList: {
    maxHeight: 500,
  },
  forwardContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: STYLES.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  forwardContactAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: STYLES.spacing.md,
  },
  forwardContactAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  forwardContactName: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  forwardContactOnline: {
    fontSize: 12,
    color: '#34c759',
    marginLeft: STYLES.spacing.sm,
  },
});

export default ChatScreen;
