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
import { COLORS, STYLES } from '../config/config';

const PeersListScreen = ({ navigation, route }) => {
  const { phoneNumber } = route.params || {};
  const [peers, setPeers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
            socketService.disconnect();
            navigation.replace('Register');
          },
        },
      ]
    );
  };

  const renderPeer = ({ item }) => {
    const connectedDate = new Date(item.connectedAt);
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
          <Text style={styles.peerMeta}>
            Connected: {connectedDate.toLocaleString()}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
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

