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
import { COLORS, STYLES } from '../config/config';

const PeersListScreen = ({ navigation, route }) => {
  const { phoneNumber } = route.params || {};
  const [peers, setPeers] = useState([]);
  const [conversations, setConversations] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Initialize global message handler
  useEffect(() => {
    console.log('[PeersListScreen] Initializing global message handler');
    messageHandler.initialize(phoneNumber);

    return () => {
      // Cleanup is handled in logout, not here
      // because we want the handler to persist across screen changes
    };
  }, [phoneNumber]);

  // Load conversations helper function
  const loadConversations = useCallback(async () => {
    const allConversations = await messageStorage.getConversations();
    const conversationsMap = {};
    allConversations.forEach((conv) => {
      conversationsMap[conv.id] = conv;
    });
    setConversations(conversationsMap);
  }, []);

  useEffect(() => {
    // Load conversation metadata for all peers
    loadConversations();
  }, [loadConversations]);

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

    socketService.on('message', handleNewMessage);
    socketService.on('offline-messages', handleNewMessage);

    return () => {
      socketService.off('message', handleNewMessage);
      socketService.off('offline-messages', handleNewMessage);
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

  const handlePeerPress = (peer) => {
    navigation.navigate('Chat', {
      peerPhone: peer.phoneNumber,
      myPhone: phoneNumber,
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
    const conversationId = messageStorage.getConversationId(phoneNumber, item.phoneNumber);
    const conversation = conversations[conversationId];
    
    return (
      <TouchableOpacity
        style={styles.peerItem}
        onPress={() => handlePeerPress(item)}
      >
        <View style={styles.peerInfo}>
          <View style={styles.peerHeader}>
            <Text style={styles.peerPhone}>{item.phoneNumber}</Text>
            <View style={styles.onlineIndicator} />
          </View>
          {conversation?.lastMessage ? (
            <Text style={styles.lastMessage} numberOfLines={1}>
              {conversation.lastMessageFrom === phoneNumber ? 'You: ' : ''}
              {conversation.lastMessage}
            </Text>
          ) : (
            <Text style={styles.peerMeta}>Tap to start chatting</Text>
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

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No peers online</Text>
        <Text style={styles.emptySubtext}>Pull to refresh</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Online Peers</Text>
        <Text style={styles.headerSubtitle}>You: {phoneNumber}</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={peers}
        renderItem={renderPeer}
        keyExtractor={(item) => item.phoneNumber}
        contentContainerStyle={peers.length === 0 ? styles.emptyList : styles.list}
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
  peerInfo: {
    flex: 1,
    marginRight: STYLES.spacing.sm,
  },
  peerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: STYLES.spacing.xs,
  },
  peerPhone: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: STYLES.spacing.sm,
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
