import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import webrtcService from '../services/webrtcService';
import socketService from '../services/socketService';
import contactsService from '../services/contactsService';
import messageStorage from '../services/messageStorage';
import { COLORS, STYLES } from '../config/config';

const { width, height } = Dimensions.get('window');

const formatContactLabel = (name, phone) => {
  if (!phone) {
    return name || '';
  }
  if (!name || name === phone) {
    return phone;
  }
  return `${name} (${phone})`;
};

const formatCallDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
};

// Helper function to log call to chat
const logCallToChat = async (myPhone, peerPhone, isVideo, durationSeconds, isOutgoing) => {
  try {
    const normalizedMyPhone = myPhone?.replace(/[\s\-()]/g, '') || myPhone;
    const normalizedPeerPhone = peerPhone?.replace(/[\s\-()]/g, '') || peerPhone;

    if (!normalizedMyPhone || !normalizedPeerPhone) {
      console.warn('[CallScreen] Cannot log call - missing phone numbers', {
        myPhone: normalizedMyPhone,
        peerPhone: normalizedPeerPhone,
      });
      return;
    }

    const conversationId = messageStorage.getConversationId(
      normalizedMyPhone,
      normalizedPeerPhone,
    );

    const duration = Math.max(0, Math.floor(durationSeconds || 0));
    const durationText = formatCallDuration(duration);
    const callTypeLabel = isVideo ? 'video' : 'voice';
    const directionLabel = isOutgoing ? 'Outgoing' : 'Incoming';
    const completed = duration > 0;
    const statusLabel = completed
      ? `${directionLabel} ${callTypeLabel} call`
      : isOutgoing
        ? `Unanswered ${callTypeLabel} call`
        : `Missed ${callTypeLabel} call`;
    const icon = completed ? '📞' : '❌';
    const text = completed
      ? `${icon} ${statusLabel} • ${durationText}`
      : `${icon} ${statusLabel}`;

    const isMissedIncoming = !isOutgoing && !completed;
    const callMessage = {
      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'call',
      text,
      callType: callTypeLabel,
      callDirection: isOutgoing ? 'outgoing' : 'incoming',
      callStatus: completed ? 'completed' : (isOutgoing ? 'unanswered' : 'missed'),
      duration,
      durationText,
      isOutgoing,
      from: isMissedIncoming ? normalizedPeerPhone : normalizedMyPhone,
      to: isMissedIncoming ? normalizedMyPhone : normalizedPeerPhone,
      timestamp: new Date().toISOString(),
      isSent: true,
    };

    console.log('[CallScreen] Logging call to chat:', {
      conversationId,
      summary: callMessage.text,
    });

    await messageStorage.addMessage(conversationId, callMessage, normalizedMyPhone);
  } catch (error) {
    console.error('[CallScreen] Error logging call to chat:', error);
  }
};

const CallScreen = ({ route, navigation }) => {
  const { peerPhone, isVideo, isOutgoing, myPhone } = route.params || {};
  
  // Normalize phone number
  const normalizedPeerPhone = peerPhone?.replace(/[\s\-()]/g, '') || peerPhone;
  
  const [callState, setCallState] = useState(webrtcService.getState());
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef(null);
  const callDurationRef = useRef(0);
  const isNavigatingRef = useRef(false);
  const hasLoggedCallRef = useRef(false);

  const startCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      return;
    }
    console.log('[CallScreen] Starting call duration timer');
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);

  useEffect(() => {
    console.log('[CallScreen] Mounted', { peerPhone, isVideo, isOutgoing });
    hasLoggedCallRef.current = false;

    // Set up WebRTC callbacks
    webrtcService.onStateChange = (state) => {
      console.log('[CallScreen] State changed:', {
        callState: state.callState,
        hasLocalStream: !!state.localStream,
        hasRemoteStream: !!state.remoteStream,
        localStreamId: state.localStream?.id,
        remoteStreamId: state.remoteStream?.id,
      });
      setCallState(state);
      
      // Update local stream when state changes
      if (state.localStream) {
        setLocalStream(prevStream => {
          // Update if stream changed or wasn't set
          if (!prevStream || prevStream.id !== state.localStream.id) {
            console.log('[CallScreen] Local stream updated from state change:', state.localStream.id);
            return state.localStream;
          }
          return prevStream;
        });
      } else {
        console.log('[CallScreen] State change without local stream');
      }
      
      // Update remote stream when state changes
      if (state.remoteStream) {
        setRemoteStream(prevStream => {
          if (!prevStream || prevStream.id !== state.remoteStream.id) {
            return state.remoteStream;
          }
          return prevStream;
        });
      }
      
      // Start call duration timer when connected
      if (state.callState === 'connected') {
        startCallTimer();
      }
      
      // Navigate back if call ended
      if (state.callState === 'ended' || state.callState === 'idle') {
        stopCallTimer();
        
        if (!hasLoggedCallRef.current) {
          hasLoggedCallRef.current = true;
          logCallToChat(myPhone, peerPhone, isVideo, callDurationRef.current, isOutgoing).catch(err => {
            console.error('[CallScreen] Error logging call:', err);
          });
        }
        
        // Only navigate once
        if (!isNavigatingRef.current) {
          isNavigatingRef.current = true;
          setTimeout(() => {
            try {
              const canGoBack = navigation?.canGoBack?.();
              if (isOutgoing && canGoBack) {
                navigation.goBack();
              } else if (navigation?.navigate) {
                navigation.navigate('PeersList', { phoneNumber: myPhone });
              } else if (canGoBack) {
                navigation.goBack();
              }
            } catch (error) {
              console.error('[CallScreen] Navigation error:', error);
            }
          }, 500);
        }
      }
    };

    webrtcService.onRemoteStream = (stream) => {
      console.log('[CallScreen] Remote stream received');
      setRemoteStream(stream);
      
      // Start timer as backup if not already started (for receiver who might get stream before state change)
      const currentState = webrtcService.getState();
      if (currentState.callState === 'connected') {
        startCallTimer();
      }
    };

    webrtcService.onIceCandidate = (candidate) => {
      console.log('[CallScreen] Sending ICE candidate to peer');
      socketService.sendIceCandidate(peerPhone, candidate);
    };

    // Set initial local stream and update when state changes
    const updateLocalStream = () => {
      const currentState = webrtcService.getState();
      console.log('[CallScreen] Getting initial state:', {
        hasLocalStream: !!currentState.localStream,
        hasRemoteStream: !!currentState.remoteStream,
        callState: currentState.callState,
        localStreamId: currentState.localStream?.id,
        remoteStreamId: currentState.remoteStream?.id,
      });
      if (currentState.localStream) {
        console.log('[CallScreen] Setting initial local stream:', {
          id: currentState.localStream.id,
          hasVideoTracks: currentState.localStream.getVideoTracks?.()?.length > 0,
          hasAudioTracks: currentState.localStream.getAudioTracks?.()?.length > 0,
          streamURL: currentState.localStream.toURL(),
        });
        setLocalStream(currentState.localStream);
      } else {
        console.log('[CallScreen] No local stream in initial state');
      }
      if (currentState.remoteStream) {
        console.log('[CallScreen] Setting initial remote stream:', currentState.remoteStream.id);
        setRemoteStream(currentState.remoteStream);
      }
      if (currentState.callState === 'connected') {
        startCallTimer();
      }
      setCallState(currentState);
    };
    
    updateLocalStream();
    
    // Poll for local stream updates (in case it's set asynchronously)
    const localStreamCheckInterval = setInterval(() => {
      const currentState = webrtcService.getState();
      if (currentState.localStream) {
        setLocalStream(prevStream => {
          // Update if stream changed or wasn't set
          if (!prevStream || prevStream.id !== currentState.localStream.id) {
            console.log('[CallScreen] Local stream updated via polling:', currentState.localStream.id);
            return currentState.localStream;
          }
          return prevStream;
        });
      }
      if (currentState.remoteStream) {
        setRemoteStream(prevStream => {
          if (!prevStream || prevStream.id !== currentState.remoteStream.id) {
            return currentState.remoteStream;
          }
          return prevStream;
        });
      }
      if (currentState.callState === 'connected') {
        startCallTimer();
      }
      // Also update call state
      setCallState(currentState);
    }, 500);

    // Listen for call end from other peer
    const handleCallEnded = (data) => {
      if (data.from === peerPhone) {
        console.log('[CallScreen] Call ended by remote peer');
        webrtcService.endCall();
      }
    };

    // Handle call answer (for outgoing calls)
    const handleCallAnswer = data => {
      const normalizedDataFrom = data.from?.replace(/[\s\-()]/g, '');
      if (normalizedDataFrom === normalizedPeerPhone && isOutgoing) {
        console.log('[CallScreen] Received call answer from peer');

        // Check current WebRTC state before handling answer
        const webrtcState = webrtcService.getState();
        console.log('[CallScreen] Current WebRTC state:', {
          callState: webrtcState.callState,
          localStreamExists: webrtcState.localStream ? 'yes' : 'no',
        });

        webrtcService.handleAnswer(data.answer).catch(error => {
          console.error('[CallScreen] Error handling answer:', error);
          Alert.alert(
            'Call Error',
            `Failed to establish call connection: ${error.message}`,
          );
          webrtcService.endCall();
        });
      } else {
        console.log('[CallScreen] Ignoring answer - not for this call', {
          from: data.from,
          peerPhone,
          isOutgoing,
        });
      }
    };

    // Handle ICE candidates
    const handleIceCandidate = data => {
      const normalizedDataFrom = data.from?.replace(/[\s\-()]/g, '');
      if (normalizedDataFrom === normalizedPeerPhone) {
        console.log('[CallScreen] Received ICE candidate from peer');
        webrtcService.handleIceCandidate(data.candidate).catch(error => {
          console.error('[CallScreen] Error handling ICE candidate:', error);
        });
      }
    };

    socketService.on('call-ended', handleCallEnded);
    socketService.on('call-answer', handleCallAnswer);
    socketService.on('ice-candidate', handleIceCandidate);

    return () => {
      console.log('[CallScreen] Unmounting');
      socketService.off('call-ended', handleCallEnded);
      socketService.off('call-answer', handleCallAnswer);
      socketService.off('ice-candidate', handleIceCandidate);
      webrtcService.onStateChange = null;
      webrtcService.onRemoteStream = null;
      webrtcService.onIceCandidate = null;
      
      stopCallTimer();
      
      if (localStreamCheckInterval) {
        clearInterval(localStreamCheckInterval);
      }
      
      // Reset navigation flag
      isNavigatingRef.current = false;
      hasLoggedCallRef.current = false;
    };
  }, [normalizedPeerPhone, isVideo, isOutgoing, navigation, startCallTimer, stopCallTimer, myPhone, peerPhone]);

  const handleEndCall = () => {
    console.log('[CallScreen] End call button pressed');
    socketService.endCall(peerPhone);
    webrtcService.endCall();
    stopCallTimer();
  };

  const handleToggleMute = () => {
    webrtcService.toggleMute();
  };

  const handleToggleVideo = () => {
    if (isVideo) {
      webrtcService.toggleVideo();
    }
  };

  const handleToggleSpeaker = () => {
    webrtcService.toggleSpeaker();
  };

  const handleSwitchCamera = () => {
    if (isVideo) {
      webrtcService.switchCamera();
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const displayName = formatContactLabel(contactsService.getDisplayName(peerPhone), peerPhone);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* Video Views */}
      {isVideo && (
        <>
          {/* Remote Video (Full Screen) */}
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.remoteVideo}
              objectFit="cover"
              mirror={false}
            />
          ) : (
            <View style={styles.remoteVideoPlaceholder}>
              <Text style={styles.placeholderText}>Waiting for video...</Text>
            </View>
          )}

          {/* Local Video (Small overlay) */}
          {localStream && (
            <View style={styles.localVideoContainer}>
              <RTCView
                key={`local-${localStream.id}`}
                streamURL={localStream.toURL()}
                style={styles.localVideo}
                objectFit="cover"
                mirror={true}
                zOrder={1}
              />
            </View>
          )}
        </>
      )}

      {/* Audio Call UI */}
      {!isVideo && (
        <View style={styles.audioCallContainer}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Header Info */}
      <View style={styles.header}>
        <Text style={styles.peerName}>{displayName}</Text>
        <Text style={styles.callStatus}>
          {callState.callState === 'outgoing' && 'Calling...'}
          {callState.callState === 'connected' && formatDuration(callDuration)}
          {callState.callState === 'incoming' && 'Incoming Call'}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.controlsRow}>
          {/* Mute Button */}
          <TouchableOpacity
            style={[styles.controlButton, callState.isMuted && styles.controlButtonActive]}
            onPress={handleToggleMute}
          >
            <Text style={styles.controlIcon}>
              {callState.isMuted ? '🔇' : '🎤'}
            </Text>
            <Text style={styles.controlLabel}>
              {callState.isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          {/* Video Toggle (for video calls) */}
          {isVideo && (
            <TouchableOpacity
              style={[styles.controlButton, !callState.isVideoEnabled && styles.controlButtonActive]}
              onPress={handleToggleVideo}
            >
              <Text style={styles.controlIcon}>
                {callState.isVideoEnabled ? '📹' : '🚫'}
              </Text>
              <Text style={styles.controlLabel}>
                {callState.isVideoEnabled ? 'Video' : 'No Video'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Speaker Button */}
          <TouchableOpacity
            style={[styles.controlButton, callState.isSpeakerOn && styles.controlButtonActive]}
            onPress={handleToggleSpeaker}
          >
            <Text style={styles.controlIcon}>
              {callState.isSpeakerOn ? '🔊' : '🔈'}
            </Text>
            <Text style={styles.controlLabel}>
              {callState.isSpeakerOn ? 'Speaker' : 'Earpiece'}
            </Text>
          </TouchableOpacity>

          {/* Switch Camera (for video calls) */}
          {isVideo && (
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleSwitchCamera}
            >
              <Text style={styles.controlIcon}>🔄</Text>
              <Text style={styles.controlLabel}>Flip</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* End Call Button */}
        <TouchableOpacity
          style={styles.endCallButton}
          onPress={handleEndCall}
        >
          <Text style={styles.endCallIcon}>📞</Text>
          <Text style={styles.endCallText}>End Call</Text>
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
  remoteVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
  },
  remoteVideoPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 18,
  },
  localVideoContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  audioCallContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 100,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  peerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  callStatus: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlButtonActive: {
    backgroundColor: COLORS.primary,
  },
  controlIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  controlLabel: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '500',
  },
  endCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff3b30',
    paddingVertical: 16,
    borderRadius: 30,
    marginHorizontal: 40,
  },
  endCallIcon: {
    fontSize: 24,
    marginRight: 8,
    transform: [{ rotate: '135deg' }],
  },
  endCallText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CallScreen;

