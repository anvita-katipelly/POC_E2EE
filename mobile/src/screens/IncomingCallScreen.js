import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Vibration,
} from 'react-native';
import webrtcService from '../services/webrtcService';
import socketService from '../services/socketService';
import contactsService from '../services/contactsService';
import { COLORS, STYLES } from '../config/config';

const formatContactLabel = (name, phone) => {
  if (!phone) {
    return name || '';
  }
  if (!name || name === phone) {
    return phone;
  }
  return `${name} (${phone})`;
};

const IncomingCallScreen = ({ route, navigation }) => {
  const { from, offer, isVideo, myPhone } = route.params;
  
  // Normalize phone number
  const normalizedFrom = from?.replace(/[\s\-()]/g, '') || from;
  
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    console.log('[IncomingCallScreen] Mounted', { from, isVideo });

    // Start vibration pattern
    const vibrationPattern = [0, 500, 200, 500];
    Vibration.vibrate(vibrationPattern, true);

    // Pulse animation for incoming call
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Listen for call rejection/end from caller
    const handleCallEnded = (data) => {
      if (data.from === from) {
        console.log('[IncomingCallScreen] Call cancelled by caller');
        Vibration.cancel();
        navigation.goBack();
      }
    };

    // Handle ICE candidates while waiting to accept
    const handleIceCandidate = data => {
      const normalizedDataFrom = data.from?.replace(/[\s\-()]/g, '');
      if (normalizedDataFrom === normalizedFrom) {
        console.log('[IncomingCallScreen] Received ICE candidate, queueing');
        webrtcService.handleIceCandidate(data.candidate).catch(error => {
          console.error(
            '[IncomingCallScreen] Error handling ICE candidate:',
            error,
          );
        });
      }
    };

    socketService.on('call-ended', handleCallEnded);
    socketService.on('ice-candidate', handleIceCandidate);

    return () => {
      console.log('[IncomingCallScreen] Unmounting');
      Vibration.cancel();
      socketService.off('call-ended', handleCallEnded);
      socketService.off('ice-candidate', handleIceCandidate);
    };
  }, [from, isVideo, navigation, pulseAnim]);

  const handleAccept = async () => {
    try {
      console.log('[IncomingCallScreen] Accepting call');
      Vibration.cancel();

      // Accept the call through WebRTC service
      const answer = await webrtcService.acceptCall({
        from,
        offer,
        isVideo,
      });

      // Send answer back to caller
      socketService.sendCallAnswer(from, answer);

      // Set up ICE candidate callback
      webrtcService.onIceCandidate = (candidate) => {
        socketService.sendIceCandidate(from, candidate);
      };

      // Navigate to call screen
      navigation.replace('Call', {
        peerPhone: from,
        isVideo,
        isOutgoing: false,
        myPhone,
      });
    } catch (error) {
      console.error('[IncomingCallScreen] Error accepting call:', error);
      alert('Failed to accept call: ' + error.message);
      handleReject();
    }
  };

  const handleReject = () => {
    console.log('[IncomingCallScreen] Rejecting call');
    Vibration.cancel();
    
    // Send rejection to caller
    socketService.rejectCall(from);
    
    // Navigate back
    navigation.goBack();
  };

  const displayName = formatContactLabel(contactsService.getDisplayName(from), from);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <View style={styles.content}>
        {/* Call Type Indicator */}
        <Text style={styles.callType}>
          {isVideo ? '📹 Video Call' : '📞 Voice Call'}
        </Text>

        {/* Caller Avatar */}
        <Animated.View
          style={[
            styles.avatarContainer,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        </Animated.View>

        {/* Caller Name */}
        <Text style={styles.callerName}>{displayName}</Text>
        <Text style={styles.callerNumber}>{from}</Text>
        <Text style={styles.incomingText}>Incoming Call...</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {/* Reject Button */}
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={handleReject}
        >
          <Text style={styles.actionIcon}>📞</Text>
          <Text style={styles.actionText}>Decline</Text>
        </TouchableOpacity>

        {/* Accept Button */}
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={handleAccept}
        >
          <Text style={styles.actionIcon}>📞</Text>
          <Text style={styles.actionText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  callType: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 40,
  },
  avatarContainer: {
    marginBottom: 30,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarText: {
    fontSize: 56,
    color: '#fff',
    fontWeight: 'bold',
  },
  callerName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  callerNumber: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 20,
  },
  incomingText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    paddingVertical: 20,
    borderRadius: 60,
  },
  rejectButton: {
    backgroundColor: '#ff3b30',
  },
  acceptButton: {
    backgroundColor: '#34c759',
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
    transform: [{ rotate: '135deg' }],
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default IncomingCallScreen;

