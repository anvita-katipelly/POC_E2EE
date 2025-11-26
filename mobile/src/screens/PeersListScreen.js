import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import socketService from '../services/socketService';
import messageStorage from '../services/messageStorage';
import messageHandler from '../services/messageHandler';
import contactsService from '../services/contactsService';
import webrtcService from '../services/webrtcService';
import { COLORS, STYLES } from '../config/config';

const PeersListScreen = ({ navigation, route }) => {
  const { phoneNumber } = route.params || {};
  const normalizedMyPhone = phoneNumber?.replace(/[\s\-()]/g, '') || '';
  const [peers, setPeers] = useState([]);
  const [conversations, setConversations] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [allContacts, setAllContacts] = useState([]);
  const [combinedList, setCombinedList] = useState([]);
  const [activeTab, setActiveTab] = useState('contacts');
  const [callLogs, setCallLogs] = useState([]);
  const [loadingCallLogs, setLoadingCallLogs] = useState(false);
  const [callLogsRefreshing, setCallLogsRefreshing] = useState(false);

  const formatDisplayLabel = useCallback((phone) => {
    if (!phone) {
      return '';
    }
    const name = contactsService.getDisplayName(phone);
    if (!name || name === phone) {
      return phone;
    }
    return `${name} (${phone})`;
  }, []);

  // Initialize global message handler
  useEffect(() => {
    console.log('[PeersListScreen] Initializing global message handler');
    messageHandler.initialize(phoneNumber);

    return () => {
      // Cleanup is handled in logout, not here
      // because we want the handler to persist across screen changes
    };
  }, [phoneNumber]);

  // Listen for incoming calls
  useEffect(() => {
    console.log('[PeersListScreen] Setting up incoming call listener');

    const handleIncomingCall = (data) => {
      console.log('[PeersListScreen] Incoming call from:', data.from);
      
      // Check if we're already in a call
      const currentState = webrtcService.getState();
      if (currentState.callState !== 'idle') {
        console.log('[PeersListScreen] Already in a call, rejecting');
        socketService.rejectCall(data.from);
        return;
      }

      // Navigate to incoming call screen
      navigation.navigate('IncomingCall', {
        from: data.from,
        offer: data.offer,
        isVideo: data.isVideo,
        myPhone: normalizedMyPhone,
      });
    };

    const handleCallRejected = (data) => {
      console.log('[PeersListScreen] Call rejected by:', data.from);
      Alert.alert('Call Rejected', `${data.from} declined your call`);
      webrtcService.endCall();
    };

    socketService.on('call-offer', handleIncomingCall);
    socketService.on('call-rejected', handleCallRejected);

    return () => {
      console.log('[PeersListScreen] Cleaning up call listeners');
      socketService.off('call-offer', handleIncomingCall);
      socketService.off('call-rejected', handleCallRejected);
    };
  }, [navigation]);

  // Load contacts from device
  useEffect(() => {
    const loadContacts = async () => {
      console.log('[PeersListScreen] Loading contacts...');
      const loaded = await contactsService.loadContacts();
      console.log('[PeersListScreen] Contacts service loaded:', loaded);
      setContactsLoaded(loaded);
      
      if (loaded) {
        const contacts = contactsService.getAllContacts();
        console.log('[PeersListScreen] Got contacts from service:', contacts.length);
        
        // Extract unique phone numbers from contacts
        const contactsWithPhones = [];
        contacts.forEach(contact => {
          const displayName = contact.displayName || 
                             contact.givenName || 
                             contact.familyName || 
                             'Unknown';
          
          if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            // Add each phone number as a separate entry
            contact.phoneNumbers.forEach(phoneEntry => {
              if (phoneEntry.number) {
                contactsWithPhones.push({
                  name: displayName,
                  phoneNumber: phoneEntry.number,
                  isContact: true,
                });
              }
            });
          }
        });
        
        console.log('[PeersListScreen] Processed contacts with phones:', contactsWithPhones.length);
        setAllContacts(contactsWithPhones);
      } else {
        console.log('[PeersListScreen] Failed to load contacts or permission denied');
        // Still set contactsLoaded to true so UI doesn't keep loading
        setContactsLoaded(true);
      }
    };

    loadContacts();
  }, []);

  // Load conversations helper function
  const loadConversations = useCallback(async () => {
    console.log('[PeersListScreen] Loading conversations...');
    const allConversations = await messageStorage.getConversations();
    console.log('[PeersListScreen] Loaded conversations:', allConversations.length);
    const conversationsMap = {};
    allConversations.forEach((conv) => {
      conversationsMap[conv.id] = conv;
      console.log('[PeersListScreen] Conversation:', {
        id: conv.id,
        lastMessage: conv.lastMessage?.substring(0, 20),
        from: conv.lastMessageFrom,
        unreadCount: conv.unreadCount || 0
      });
    });
    setConversations(conversationsMap);
  }, []);

  useEffect(() => {
    // Load conversation metadata for all peers
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    loadCallLogs();
  }, [loadCallLogs]);

  // Combine contacts, peers, and existing conversations into a single list
  useEffect(() => {
    const combineContactsAndPeers = () => {
      const combined = [];
      const processedPhones = new Set();

      // First, add all contacts and mark if they're online
      allContacts.forEach(contact => {
        const normalizedPhone = contactsService.normalizePhoneNumber(contact.phoneNumber);
        
        // Check if this contact is online (in peers list)
        const isOnline = peers.some(peer => 
          contactsService.phoneNumbersMatch(peer.phoneNumber, contact.phoneNumber)
        );

        combined.push({
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          isContact: true,
          isOnline: isOnline,
          displayLabel: formatDisplayLabel(contact.phoneNumber),
        });

        processedPhones.add(normalizedPhone);
        // Also add variations
        if (normalizedPhone.length >= 10) {
          processedPhones.add(normalizedPhone.slice(-10));
        }
      });

      // Add peers that are not in contacts
      peers.forEach(peer => {
        const normalizedPeerPhone = contactsService.normalizePhoneNumber(peer.phoneNumber);
        const last10 = normalizedPeerPhone.length >= 10 ? normalizedPeerPhone.slice(-10) : '';
        
        // Check if this peer is already in the combined list
        const alreadyAdded = processedPhones.has(normalizedPeerPhone) || 
                            (last10 && processedPhones.has(last10));

        if (!alreadyAdded) {
          combined.push({
            name: null,
            phoneNumber: peer.phoneNumber,
            isContact: false,
            isOnline: true,
            displayLabel: formatDisplayLabel(peer.phoneNumber),
          });
          processedPhones.add(normalizedPeerPhone);
          if (last10) {
            processedPhones.add(last10);
          }
        }
      });

      // Add people from existing conversations (even if offline and not in contacts)
      Object.keys(conversations).forEach(conversationId => {
        // Extract the other person's phone number from conversation ID
        // conversationId format: "phone1_phone2"
        const [phone1, phone2] = conversationId.split('_');
        const otherPhone = phone1 === normalizedMyPhone ? phone2 : phone1;
        
        // Check if this person is already in the combined list
        const normalizedOtherPhone = contactsService.normalizePhoneNumber(otherPhone);
        const last10 = normalizedOtherPhone.length >= 10 ? normalizedOtherPhone.slice(-10) : '';
        
        const alreadyAdded = processedPhones.has(normalizedOtherPhone) || 
                            (last10 && processedPhones.has(last10));

        if (!alreadyAdded) {
          // Check if they're online
          const isOnline = peers.some(peer => 
            contactsService.phoneNumbersMatch(peer.phoneNumber, otherPhone)
          );

          // Try to get display name from contacts service
          const displayName = contactsService.getDisplayName(otherPhone);
          const hasName = displayName !== otherPhone;

          combined.push({
            name: hasName ? displayName : null,
            phoneNumber: otherPhone,
            isContact: hasName,
            isOnline: isOnline,
            hasConversation: true, // Flag to indicate this is from chat history
            displayLabel: formatDisplayLabel(otherPhone),
          });
          
          processedPhones.add(normalizedOtherPhone);
          if (last10) {
            processedPhones.add(last10);
          }
        }
      });

      const filtered = combined.filter(item => item.isContact || item.isOnline || item.hasConversation);

      // Sort: Conversations with unread first, then online, then by name/phone
      filtered.sort((a, b) => {
        const normalizedMyPhone = phoneNumber.replace(/[\s\-()]/g, '');
        const normalizedPhoneA = a.phoneNumber.replace(/[\s\-()]/g, '');
        const normalizedPhoneB = b.phoneNumber.replace(/[\s\-()]/g, '');
        
        const conversationA = conversations[messageStorage.getConversationId(normalizedMyPhone, normalizedPhoneA)];
        const conversationB = conversations[messageStorage.getConversationId(normalizedMyPhone, normalizedPhoneB)];
        
        const unreadA = conversationA?.unreadCount || 0;
        const unreadB = conversationB?.unreadCount || 0;
        
        // Unread messages first
        if (unreadA !== unreadB) {
          return unreadB - unreadA;
        }
        
        // Then online contacts
        if (a.isOnline !== b.isOnline) {
          return b.isOnline ? 1 : -1;
        }
        
        // Then by most recent conversation
        const timestampA = conversationA?.lastMessageTimestamp || '';
        const timestampB = conversationB?.lastMessageTimestamp || '';
        if (timestampA !== timestampB) {
          return timestampB.localeCompare(timestampA);
        }
        
        // Finally, sort alphabetically by name or phone
        const aDisplay = a.name || a.phoneNumber;
        const bDisplay = b.name || b.phoneNumber;
        return aDisplay.localeCompare(bDisplay);
      });

      console.log(`[PeersListScreen] Combined list: ${filtered.length} items (${peers.length} online, ${allContacts.length} contacts, ${Object.keys(conversations).length} conversations)`);
      setCombinedList(filtered);
    };

    if (allContacts.length > 0 || peers.length > 0 || Object.keys(conversations).length > 0) {
      combineContactsAndPeers();
    }
  }, [allContacts, peers, conversations, phoneNumber]);

  useEffect(() => {
    // Reload data when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('[PeersListScreen] Screen focused, reloading data');
      loadConversations();
      loadCallLogs();
    });

    return unsubscribe;
  }, [navigation, loadConversations, loadCallLogs]);

  // Listen for incoming messages to update conversation list in real-time
  useEffect(() => {
    const handleNewMessage = () => {
      console.log('[PeersListScreen] New message received, reloading conversations');
      // Wait a bit for messageHandler to save to storage
      setTimeout(() => {
        loadConversations();
      }, 300);
    };

    const handleMessageSent = () => {
      console.log('[PeersListScreen] Message sent, reloading conversations');
      // Wait a bit for message to be saved to storage
      setTimeout(() => {
        loadConversations();
      }, 300);
    };

    socketService.on('message', handleNewMessage);
    socketService.on('offline-messages', handleNewMessage);
    socketService.on('message-sent', handleMessageSent);

    return () => {
      socketService.off('message', handleNewMessage);
      socketService.off('offline-messages', handleNewMessage);
      socketService.off('message-sent', handleMessageSent);
    };
  }, [loadConversations]);

  useEffect(() => {
    // Request online peers when screen mounts
    requestPeers();

    // Listen for peer updates
    const handleOnlinePeers = ({ peers: onlinePeers }) => {
      // Filter out current user
      const filteredPeers = onlinePeers.filter(
        (peer) => peer.phoneNumber !== phoneNumber
      );
      setPeers(filteredPeers);
      setIsLoading(false);
      setRefreshing(false);
    };

    const handlePeerOnline = ({ phoneNumber: peerPhone }) => {
      // Peer came online - refresh list
      if (peerPhone !== phoneNumber) {
        requestPeers();
      }
    };

    const handlePeerOffline = ({ phoneNumber: peerPhone }) => {
      // Peer went offline - remove from list
      setPeers((prevPeers) =>
        prevPeers.filter((peer) => peer.phoneNumber !== peerPhone)
      );
    };

    const handleError = ({ message }) => {
      setIsLoading(false);
      setRefreshing(false);
      Alert.alert('Error', message || 'Failed to get peers');
    };

    socketService.on('online-peers', handleOnlinePeers);
    socketService.on('peer-online', handlePeerOnline);
    socketService.on('peer-offline', handlePeerOffline);
    socketService.on('error', handleError);

    return () => {
      socketService.off('online-peers', handleOnlinePeers);
      socketService.off('peer-online', handlePeerOnline);
      socketService.off('peer-offline', handlePeerOffline);
      socketService.off('error', handleError);
    };
  }, [phoneNumber]);

  const requestPeers = () => {
    try {
      socketService.getOnlinePeers();
      setIsLoading(true);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to request peers');
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    requestPeers();
  }, []);

  const loadCallLogs = useCallback(async () => {
    if (!normalizedMyPhone) {
      setCallLogs([]);
      return;
    }
    setLoadingCallLogs(true);
    try {
      const conversationsList = await messageStorage.getConversations();
      const logs = [];
      for (const conversation of conversationsList) {
        const messages = await messageStorage.getMessages(conversation.id);
        const [phone1, phone2] = conversation.id.split('_');
        const otherPhone = phone1 === normalizedMyPhone ? phone2 : phone1;
        messages.forEach((msg) => {
          if (msg.type === 'call') {
            logs.push({
              ...msg,
              conversationId: conversation.id,
              otherPhone,
              displayName: formatDisplayLabel(otherPhone),
            });
          }
        });
      }
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setCallLogs(logs);
    } catch (error) {
      console.error('[PeersListScreen] Failed to load call logs:', error);
    } finally {
      setLoadingCallLogs(false);
      setCallLogsRefreshing(false);
    }
  }, [normalizedMyPhone, formatDisplayLabel]);

  const handleCallLogsRefresh = useCallback(() => {
    setCallLogsRefreshing(true);
    loadCallLogs();
  }, [loadCallLogs]);

  const handleTabChange = useCallback(
    (tab) => {
      setActiveTab(tab);
      if (tab === 'callLogs') {
        loadCallLogs();
      }
    },
    [loadCallLogs]
  );

  const handlePeerPress = (item) => {
    const normalizedPeerPhone = item.phoneNumber?.replace(/[\s\-()]/g, '');
    
    const conversationId = messageStorage.getConversationId(normalizedMyPhone, normalizedPeerPhone);
    const hasConversation = conversations[conversationId] !== undefined;
    
    console.log('[PeersListScreen] Peer pressed:', {
      name: item.name,
      originalPhoneNumber: item.phoneNumber,
      normalizedPhoneNumber: normalizedPeerPhone,
      isOnline: item.isOnline,
      hasConversation: hasConversation,
      myPhone: normalizedMyPhone
    });

    // Allow chat if:
    // 1. User is online, OR
    // 2. There's existing conversation history
    if (!item.isOnline && !hasConversation) {
      Alert.alert(
        'Offline', 
        'This contact is not online and you have no previous conversation. You can only start new chats with online contacts.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log('[PeersListScreen] Navigating to Chat screen');
    navigation.navigate('Chat', {
      peerPhone: normalizedPeerPhone,
      myPhone: normalizedMyPhone,
    });
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to disconnect?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            console.log('[PeersListScreen] Logging out, cleaning up message handler');
            messageHandler.cleanup();
            socketService.disconnect();
            navigation.replace('Register');
          },
        },
      ]
    );
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

      // If yesterday
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      }

      // Otherwise show date
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const renderPeer = ({ item }) => {
    // Normalize phone numbers for conversation ID lookup
        const normalizedPeerPhone = item.phoneNumber?.replace(/[\s\-()]/g, '');
    
    const conversationId = messageStorage.getConversationId(normalizedMyPhone, normalizedPeerPhone);
    const conversation = conversations[conversationId];
    
        // Use formatted label with phone number
        const displayName = item.displayLabel || formatDisplayLabel(item.phoneNumber);

    return (
      <TouchableOpacity
        style={[
          styles.peerItem,
          !item.isOnline && styles.peerItemOffline
        ]}
        onPress={() => handlePeerPress(item)}
      >
        <View style={styles.peerInfo}>
          <View style={styles.peerHeader}>
            <Text 
              style={[
                styles.peerName,
                conversation?.unreadCount > 0 && styles.peerNameUnread
              ]}
            >
              {displayName}
            </Text>
            {item.isOnline && (
              <View style={styles.onlineIndicator} />
            )}
          </View>
          {conversation?.lastMessage ? (
            <Text 
              style={[
                styles.lastMessage, 
                conversation.unreadCount > 0 && styles.lastMessageUnread
              ]} 
              numberOfLines={1}
            >
              {conversation.lastMessageFrom === normalizedMyPhone ? 'You: ' : ''}
              {conversation.lastMessage}
            </Text>
          ) : item.isOnline ? (
            <Text style={styles.peerMeta}>Tap to start chatting</Text>
          ) : conversation ? (
            <Text style={[styles.peerMeta, { color: '#999' }]}>Offline • Tap to view chat</Text>
          ) : (
            <Text style={styles.peerMeta}>Not online</Text>
          )}
        </View>
        <View style={styles.peerRight}>
          {conversation?.lastMessageTimestamp && (
            <Text style={styles.timestamp}>
              {formatTime(conversation.lastMessageTimestamp)}
            </Text>
          )}
          {conversation?.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </Text>
            </View>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const handleCallLogPress = (log) => {
    const normalizedPeerPhone = log.otherPhone?.replace(/[\s\-()]/g, '');
    if (!normalizedPeerPhone) {
      return;
    }
    navigation.navigate('Chat', {
      peerPhone: normalizedPeerPhone,
      myPhone: normalizedMyPhone,
    });
  };

  const renderCallLog = ({ item }) => {
    const isMissed = item.callStatus === 'missed';
    const callTypeIcon = item.callType === 'video' ? '📹' : '📞';
    const directionLabel = item.callDirection === 'outgoing' ? 'Outgoing' : 'Incoming';
    const directionIcon = item.callDirection === 'outgoing' ? '⬆️' : '⬇️';
    const statusLabel =
      item.callStatus === 'completed'
        ? item.durationText
        : item.callStatus === 'missed'
          ? 'Missed'
          : 'Unanswered';

    return (
      <TouchableOpacity style={styles.callLogItem} onPress={() => handleCallLogPress(item)}>
        <View style={styles.callLogIconWrapper}>
          <Text style={styles.callLogIcon}>{callTypeIcon}</Text>
        </View>
        <View style={styles.callLogInfo}>
          <Text style={[styles.callLogName, isMissed && styles.callLogMissed]}>
            {item.displayName}
          </Text>
          <Text style={styles.callLogMeta}>
            {directionIcon} {directionLabel} • {statusLabel}
          </Text>
        </View>
        <Text style={styles.callLogTime}>{formatTime(item.timestamp)}</Text>
      </TouchableOpacity>
    );
  };

  const renderCallLogsEmpty = () => {
    if (loadingCallLogs) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.emptyText}>Loading call history...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No calls yet</Text>
        <Text style={styles.emptySubtext}>Your recent calls will appear here</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.emptyText}>Loading peers...</Text>
        </View>
      );
    }

    if (!contactsLoaded) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.emptyText}>Loading contacts...</Text>
          <Text style={styles.emptySubtext}>Please grant contacts permission</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No contacts found</Text>
        <Text style={styles.emptySubtext}>
          Add contacts to your phone to see them here
        </Text>
      </View>
    );
  };

  const headerTitle = activeTab === 'contacts' ? 'Contacts' : 'Call Logs';
  const headerSubtitle =
    activeTab === 'contacts'
      ? `You: ${phoneNumber || 'N/A'} • ${peers.length} online`
      : `You: ${phoneNumber || 'N/A'} • ${callLogs.length} logs`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <Text style={styles.headerSubtitle}>
          {headerSubtitle}
        </Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {activeTab === 'contacts' ? (
          <FlatList
            data={combinedList}
            renderItem={renderPeer}
            keyExtractor={(item, index) => `${item.phoneNumber}_${index}`}
            contentContainerStyle={
              combinedList.length === 0
                ? styles.emptyList
                : [styles.list, styles.listContentPadding]
            }
            ListEmptyComponent={renderEmpty}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
          />
        ) : (
          <FlatList
            data={callLogs}
            renderItem={renderCallLog}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              callLogs.length === 0
                ? styles.emptyList
                : [styles.list, styles.listContentPadding]
            }
            ListEmptyComponent={renderCallLogsEmpty}
            refreshControl={
              <RefreshControl
                refreshing={callLogsRefreshing}
                onRefresh={handleCallLogsRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
          />
        )}
      </View>

      <View style={styles.bottomTabs}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'contacts' && styles.tabButtonActive]}
          onPress={() => handleTabChange('contacts')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'contacts' && styles.tabButtonTextActive,
            ]}
          >
            Contacts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'callLogs' && styles.tabButtonActive]}
          onPress={() => handleTabChange('callLogs')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'callLogs' && styles.tabButtonTextActive,
            ]}
          >
            Call Logs
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.surface,
    padding: STYLES.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: STYLES.spacing.xs,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: STYLES.spacing.sm,
  },
  logoutButton: {
    alignSelf: 'flex-end',
    paddingVertical: STYLES.spacing.xs,
    paddingHorizontal: STYLES.spacing.sm,
  },
  logoutText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    padding: STYLES.spacing.md,
  },
  listContentPadding: {
    paddingBottom: STYLES.spacing.xl * 4,
  },
  content: {
    flex: 1,
  },
  peerItem: {
    backgroundColor: COLORS.surface,
    borderRadius: STYLES.borderRadius.md,
    padding: STYLES.spacing.md,
    marginBottom: STYLES.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  peerItemOffline: {
    opacity: 0.6,
  },
  peerInfo: {
    flex: 1,
    marginRight: STYLES.spacing.sm,
  },
  peerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: STYLES.spacing.xs,
  },
  peerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: STYLES.spacing.sm,
  },
  peerNameUnread: {
    fontWeight: '700',
  },
  peerPhone: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: STYLES.spacing.xs,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  peerMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  lastMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  lastMessageUnread: {
    fontWeight: '600',
    color: COLORS.text,
  },
  peerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: STYLES.spacing.xs,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.textSecondary,
  },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginVertical: 2,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: STYLES.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: STYLES.spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: STYLES.spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: STYLES.spacing.xs,
  },
  bottomTabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabButton: {
    flex: 1,
    paddingVertical: STYLES.spacing.md,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  callLogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: STYLES.spacing.md,
    borderRadius: STYLES.borderRadius.md,
    marginBottom: STYLES.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  callLogIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: STYLES.spacing.md,
  },
  callLogIcon: {
    fontSize: 20,
  },
  callLogInfo: {
    flex: 1,
  },
  callLogName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  callLogMissed: {
    color: COLORS.danger,
  },
  callLogMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  callLogTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: STYLES.spacing.sm,
  },
});

export default PeersListScreen;
