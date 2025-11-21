import React, { useState, useEffect, useRef } from 'react';
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
import { COLORS, STYLES } from '../config/config';

const { width, height } = Dimensions.get('window');

const CallScreen = ({ route, navigation }) => {
  const { peerPhone, isVideo, isOutgoing } = route.params;
  
  // Normalize phone number
  const normalizedPeerPhone = peerPhone?.replace(/[\s\-()]/g, '') || peerPhone;
  
  const [callState, setCallState] = useState(webrtcService.getState());
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef(null);

  useEffect(() => {
    console.log('[CallScreen] Mounted', { peerPhone, isVideo, isOutgoing });

    // Set up WebRTC callbacks
    webrtcService.onStateChange = (state) => {
      console.log('[CallScreen] State changed:', state.callState);
      setCallState(state);
      
      // Navigate back if call ended
      if (state.callState === 'ended' || state.callState === 'idle') {
        if (callTimerRef.current) {
          clearInterval(callTimerRef.current);
          callTimerRef.current = null;
        }
        setTimeout(() => {
          navigation.goBack();
        }, 500);
      }
    };

    webrtcService.onRemoteStream = (stream) => {
      console.log('[CallScreen] Remote stream received');
      setRemoteStream(stream);
      
      // Start call duration timer when connected
      if (!callTimerRef.current) {
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      }
    };

    webrtcService.onIceCandidate = (candidate) => {
      console.log('[CallScreen] Sending ICE candidate to peer');
      socketService.sendIceCandidate(peerPhone, candidate);
    };

    // Set initial local stream
    const currentState = webrtcService.getState();
    setLocalStream(currentState.localStream);
    setCallState(currentState);

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
      
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [normalizedPeerPhone, isVideo, isOutgoing, navigation]);

  const handleEndCall = () => {
    console.log('[CallScreen] End call button pressed');
    socketService.endCall(peerPhone);
    webrtcService.endCall();
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

  const displayName = contactsService.getDisplayName(peerPhone) || peerPhone;

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
          {localStream && callState.isVideoEnabled && (
            <View style={styles.localVideoContainer}>
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.localVideo}
                objectFit="cover"
                mirror={true}
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

