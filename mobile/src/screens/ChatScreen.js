import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  PermissionsAndroid,
  Image,
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

const stripFileScheme = (uri = '') => uri.replace(/^file:\/\//, '');
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

  useEffect(() => {
    // Load messages from storage and clear unread count
    const loadMessages = async () => {
      try {
        const storedMessages = await messageStorage.getMessages(conversationId);
        setMessages(storedMessages);
        
        // Clear unread count when opening the chat
        await messageStorage.clearUnreadCount(conversationId);
      } catch (error) {
        console.error('[ChatScreen] Error loading messages:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    // Set navigation header with contact name and call buttons
    const displayName = contactsService.getDisplayName(peerPhone);
    navigation.setOptions({
      title: displayName || 'Chat',
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
          await handleSendMedia(asset);
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

      await handleSendMedia(asset);
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        return;
      }
      console.error('[ChatScreen] Document picker error:', err);
      Alert.alert('File Error', err.message || 'Failed to select file');
    }
  };

  const handleSaveMediaToDevice = async (message) => {
    if (!message?.localUri) {
      Alert.alert('Save failed', 'Download the file before saving to your device.');
      return;
    }

    try {
      const sourcePath = stripFileScheme(message.localUri);
      
      if (Platform.OS === 'ios') {
        // On iOS, save to Photos library for images/videos, or use share sheet for other files
        const isImage = isImageAttachment(message);
        const isVideo = message.mimeType?.startsWith('video/');
        
        if (isImage || isVideo) {
          // For iOS, we'll use Linking to open the file, which allows saving to Photos
          // Or we can copy to a temp location and use share functionality
          const { Linking } = require('react-native');
          const connectionStatus = socketService.getConnectionStatus();
          const serverUrl = connectionStatus.serverUrl || 'http://10.0.2.2:3000';
          const downloadUrl = `${serverUrl}/receive/${message.fileId}`;
          
          // Open the download URL which will trigger iOS share sheet
          const canOpen = await Linking.canOpenURL(downloadUrl);
          if (canOpen) {
            await Linking.openURL(downloadUrl);
            Alert.alert('Open in Browser', 'The file will open in Safari. Use the share button to save to Photos or Files.');
          } else {
            // Fallback: copy to Documents and show path
            const destinationDir = getDownloadDirectory();
            await ensureDirectoryExists(destinationDir);
            const safeName = sanitizeFileName(message.fileName || `${message.id}.bin`);
            const destinationPath = `${destinationDir}/${safeName}`;
            await RNFS.copyFile(sourcePath, destinationPath);
            Alert.alert('Saved', `File saved to app storage.\n\nTo access: Open Files app > On My iPhone > IMPLI > E2EE`);
          }
        } else {
          // For other files, save to Documents directory
          const destinationDir = getDownloadDirectory();
          await ensureDirectoryExists(destinationDir);
          const safeName = sanitizeFileName(message.fileName || `${message.id}.bin`);
          const destinationPath = `${destinationDir}/${safeName}`;
          await RNFS.copyFile(sourcePath, destinationPath);
          Alert.alert('Saved', `File saved to app storage.\n\nTo access: Open Files app > On My iPhone > IMPLI > E2EE`);
        }
      } else {
        // Android: save to Downloads folder
        const destinationDir = getDownloadDirectory();
        await ensureDirectoryExists(destinationDir);
        const safeName = sanitizeFileName(message.fileName || `${message.id}.bin`);
        const destinationPath = `${destinationDir}/${safeName}`;
        await RNFS.copyFile(sourcePath, destinationPath);
        Alert.alert('Saved', `File saved to:\n${destinationPath}`);
      }
    } catch (error) {
      console.error('[ChatScreen] Failed to save media:', error);
      Alert.alert('Save failed', error.message || 'Unable to save file to device.');
    }
  };

  const handleSendMedia = async (asset) => {
    const mediaName = asset.fileName || 'Attachment';
    const mimeType = asset.type || 'application/octet-stream';
    const fileSize = asset.fileSize || 0;

    const tempMessage = {
      id: generateUniqueId(),
      type: 'file',
      text: `[File] ${mediaName}`,
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

  const renderMessage = ({ item }) => {
    const isMyMessage = item.isSent;
    const isFileMessage = item.type === 'file';
    const showImagePreview = isFileMessage && isImageAttachment(item);
    const hasLocalPreview = showImagePreview && !!item.localUri;
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
          {isFileMessage ? (
            <View style={styles.attachmentContainer}>
              {showImagePreview && (
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
                      <Text style={styles.previewPlaceholderText}>Preview available after download</Text>
                    )}
                  </View>
                )
              )}
              <Text
                style={[
                  styles.attachmentName,
                  isMyMessage ? styles.myMessageText : styles.peerMessageText,
                ]}
                numberOfLines={2}
              >
                {item.fileName || 'Attachment'}
              </Text>
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
              {item.localUri && (
                <View style={styles.localFileActions}>
                  <Text style={styles.downloadedTag}>Cached for quick preview</Text>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={() => handleSaveMediaToDevice(item)}
                  >
                    <Text style={styles.saveButtonText}>Save to device</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <Text
              style={[
                styles.messageText,
                isMyMessage ? styles.myMessageText : styles.peerMessageText,
              ]}
            >
              {item.text}
            </Text>
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
  attachmentContainer: {
    width: '100%',
  },
  attachmentName: {
    fontSize: 16,
    fontWeight: '600',
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
  downloadedTag: {
    marginTop: STYLES.spacing.xs,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  localFileActions: {
    marginTop: STYLES.spacing.xs,
  },
  saveButton: {
    marginTop: STYLES.spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: STYLES.spacing.md,
    paddingVertical: 6,
    borderRadius: STYLES.borderRadius.sm,
    backgroundColor: COLORS.secondary,
  },
  saveButtonText: {
    color: COLORS.surface,
    fontWeight: '600',
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
});

export default ChatScreen;
