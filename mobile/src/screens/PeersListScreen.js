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
import { COLORS, STYLES } from '../config/config';

const PeersListScreen = ({ navigation, route }) => {
  const { phoneNumber } = route.params || {};
  const [peers, setPeers] = useState([]);
  const [conversations, setConversations] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [allContacts, setAllContacts] = useState([]);
  const [combinedList, setCombinedList] = useState([]);

  // Initialize global message handler
  useEffect(() => {
    console.log('[PeersListScreen] Initializing global message handler');
    messageHandler.initialize(phoneNumber);

    return () => {
      // Cleanup is handled in logout, not here
      // because we want the handler to persist across screen changes
    };
  }, [phoneNumber]);

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
        from: conv.lastMessageFrom
      });
    });
    setConversations(conversationsMap);
  }, []);

  useEffect(() => {
    // Load conversation metadata for all peers
    loadConversations();
  }, [loadConversations]);

  // Combine contacts and peers into a single list
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
          });
        }
      });

      // Sort: Online first, then by name/phone
      combined.sort((a, b) => {
        // Online contacts first
        if (a.isOnline !== b.isOnline) {
          return b.isOnline ? 1 : -1;
        }
        
        // Then sort alphabetically by name or phone
        const aDisplay = a.name || a.phoneNumber;
        const bDisplay = b.name || b.phoneNumber;
        return aDisplay.localeCompare(bDisplay);
      });

      console.log(`[PeersListScreen] Combined list: ${combined.length} items (${peers.length} online, ${allContacts.length} contacts)`);
      setCombinedList(combined);
    };

    if (allContacts.length > 0 || peers.length > 0) {
      combineContactsAndPeers();
    }
  }, [allContacts, peers]);

  useEffect(() => {
    // Reload conversations when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadConversations();
    });

    return unsubscribe;
  }, [navigation, loadConversations]);

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

  const handlePeerPress = (item) => {
    // Normalize phone numbers (remove spaces, dashes, parentheses)
    const normalizedPeerPhone = item.phoneNumber?.replace(/[\s\-()]/g, '');
    const normalizedMyPhone = phoneNumber?.replace(/[\s\-()]/g, '');
    
    console.log('[PeersListScreen] Peer pressed:', {
      name: item.name,
      originalPhoneNumber: item.phoneNumber,
      normalizedPhoneNumber: normalizedPeerPhone,
      isOnline: item.isOnline,
      myPhone: normalizedMyPhone
    });

    // Only allow chat if online or has previous conversation
    if (!item.isOnline && !conversations[messageStorage.getConversationId(normalizedMyPhone, normalizedPeerPhone)]) {
      Alert.alert('Offline', 'This contact is not online. You can only chat with online contacts.');
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
    const normalizedMyPhone = phoneNumber?.replace(/[\s\-()]/g, '');
    const normalizedPeerPhone = item.phoneNumber?.replace(/[\s\-()]/g, '');
    
    const conversationId = messageStorage.getConversationId(normalizedMyPhone, normalizedPeerPhone);
    const conversation = conversations[conversationId];
    
    // Use name from combined list or phone number
    const displayName = item.name || item.phoneNumber;
    const hasName = item.name !== null;

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
            <Text style={styles.peerName}>{displayName}</Text>
            {item.isOnline && (
              <View style={styles.onlineIndicator} />
            )}
          </View>
          {hasName && (
            <Text style={styles.peerPhone}>{item.phoneNumber}</Text>
          )}
          {conversation?.lastMessage ? (
            <Text style={styles.lastMessage} numberOfLines={1}>
              {conversation.lastMessageFrom === normalizedMyPhone ? 'You: ' : ''}
              {conversation.lastMessage}
            </Text>
          ) : item.isOnline ? (
            <Text style={styles.peerMeta}>Tap to start chatting</Text>
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
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contacts</Text>
        <Text style={styles.headerSubtitle}>
          You: {phoneNumber} • {peers.length} online
        </Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={combinedList}
        renderItem={renderPeer}
        keyExtractor={(item, index) => `${item.phoneNumber}_${index}`}
        contentContainerStyle={combinedList.length === 0 ? styles.emptyList : styles.list}
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
  emptyList: {
    flex: 1,
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
});

export default PeersListScreen;
