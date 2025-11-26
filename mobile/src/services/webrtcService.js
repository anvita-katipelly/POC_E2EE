/**
 * WebRTC Service for Voice and Video Calls
 * Handles P2P connections, media streams, and call state management
 */

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';

// STUN/TURN servers for NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callState = 'idle'; // idle, outgoing, incoming, connected, ended
    this.isVideoCall = false;
    this.isMuted = false;
    this.isVideoEnabled = true;
    this.isSpeakerOn = false;
    this.currentCallPeer = null;
    this.onStateChange = null;
    this.onRemoteStream = null;
    this.iceCandidatesQueue = [];
    this.pendingAnswer = null;
  }

  /**
   * Initialize a call (outgoing)
   */
  async initiateCall(peerPhone, isVideo = false) {
    try {
      console.log(`[WebRTC] Initiating ${isVideo ? 'video' : 'audio'} call to ${peerPhone}`);
      
      this.isVideoCall = isVideo;
      this.currentCallPeer = peerPhone;
      this.callState = 'outgoing';
      this._notifyStateChange();

      // Start InCall Manager
      InCallManager.start({ media: isVideo ? 'video' : 'audio' });
      InCallManager.setForceSpeakerphoneOn(isVideo); // Video calls default to speaker

      // Get local media stream
      await this._getLocalStream(isVideo);
      this._notifyStateChange(); // Notify that local stream is ready

      // Create peer connection
      this._createPeerConnection();

      // Create and return offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log('[WebRTC] Created offer:', offer.type);
      console.log('[WebRTC] Local description set, ICE gathering state:', this.peerConnection.iceGatheringState);

      // Apply any pending answer that might have arrived early
      await this._applyPendingAnswerIfReady();

      return {
        type: offer.type,
        sdp: offer.sdp,
        isVideo,
      };
    } catch (error) {
      console.error('[WebRTC] Error initiating call:', error);
      this.endCall();
      throw error;
    }
  }

  /**
   * Accept an incoming call
   */
  async acceptCall(callData) {
    try {
      console.log('[WebRTC] Accepting call from', callData.from);
      
      this.isVideoCall = callData.isVideo;
      this.currentCallPeer = callData.from;
      this.callState = 'connected';
      this._notifyStateChange();

      // Start InCall Manager
      InCallManager.start({ media: callData.isVideo ? 'video' : 'audio' });
      InCallManager.setForceSpeakerphoneOn(callData.isVideo);

      // Get local media stream
      await this._getLocalStream(callData.isVideo);
      this._notifyStateChange(); // Notify that local stream is ready

      // Create peer connection
      this._createPeerConnection();

      // Set remote description (offer)
      const remoteDesc = new RTCSessionDescription({
        type: callData.offer.type,
        sdp: callData.offer.sdp,
      });
      await this.peerConnection.setRemoteDescription(remoteDesc);
      console.log('[WebRTC] Set remote description');

      // Process queued ICE candidates
      await this._processIceCandidatesQueue();

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTC] Created answer:', answer.type);
      console.log('[WebRTC] Local description set, ICE gathering state:', this.peerConnection.iceGatheringState);

      return {
        type: answer.type,
        sdp: answer.sdp,
      };
    } catch (error) {
      console.error('[WebRTC] Error accepting call:', error);
      this.endCall();
      throw error;
    }
  }

  /**
   * Handle call answer (for outgoing calls)
   */
  async handleAnswer(answer) {
    try {
      // Avoid storing duplicate answers (same SDP)
      if (this.pendingAnswer && this.pendingAnswer.sdp === answer.sdp) {
        console.log('[WebRTC] Duplicate answer received, ignoring');
        return;
      }

      // Save answer in case we can't apply it immediately
      this.pendingAnswer = answer;

      if (!this.peerConnection) {
        console.log('[WebRTC] No peer connection yet, answer stored for later');
        return;
      }

      await this._applyPendingAnswerIfReady();
    } catch (error) {
      console.error('[WebRTC] Error handling answer:', error);
      throw error;
    }
  }

  async _applyPendingAnswerIfReady() {
    if (!this.pendingAnswer) {
      return;
    }

    if (!this.peerConnection) {
      console.log('[WebRTC] Cannot apply pending answer - no peer connection');
      return;
    }

    const signalingState = this.peerConnection.signalingState;
    console.log('[WebRTC] Checking if pending answer can be applied. State:', signalingState);

    if (signalingState === 'stable') {
      console.log('[WebRTC] Already connected, clearing pending answer');
      this.pendingAnswer = null;
      return;
    }

    if (signalingState !== 'have-local-offer') {
      console.log('[WebRTC] Still waiting for local offer to be set. Keeping answer pending.');
      return;
    }

    const answer = this.pendingAnswer;
    this.pendingAnswer = null;
    await this._setRemoteAnswer(answer);
  }

  async _setRemoteAnswer(answer) {
    const remoteDesc = new RTCSessionDescription({
      type: answer.type,
      sdp: answer.sdp,
    });

    try {
      // Log current local/remote descriptions sizes for debugging
      const localSDPLen = this.peerConnection.localDescription?.sdp?.length || 0;
      const remoteSDPLen = this.peerConnection.remoteDescription?.sdp?.length || 0;
      console.log('[WebRTC] Applying remote answer - localSDP len:', localSDPLen, 'remoteSDP len:', remoteSDPLen);

      await this.peerConnection.setRemoteDescription(remoteDesc);
      console.log('[WebRTC] Set remote description (answer), new state:', this.peerConnection.signalingState);
    } catch (error) {
      const state = this.peerConnection?.signalingState;
      const isStableError =
        state === 'stable' || /wrong state: stable/i.test(error.message || '');

      // If the current remoteDescription SDP matches the incoming answer, it's a duplicate/late answer — ignore
      try {
        const existingRemote = this.peerConnection?.remoteDescription?.sdp;
        if (existingRemote && existingRemote === answer.sdp) {
          console.log('[WebRTC] Remote description already matches incoming answer - ignoring duplicate answer');
          return;
        }
      } catch (e) {
        // ignore any error in checking
      }

      // Ignore duplicate/late answers once we're already stable, but don't log as an error
      if (isStableError) {
        console.log('[WebRTC] Ignoring duplicate/late answer (already in stable state)');
        return;
      }

      // For unexpected errors, log as real error and rethrow
      console.error('[WebRTC] setRemoteDescription failed:', error.message, 'state:', state);
      throw error;
    }

    // Process queued ICE candidates
    await this._processIceCandidatesQueue();

    this.callState = 'connected';
    this._notifyStateChange();
  }

  /**
   * Handle ICE candidate
   */
  async handleIceCandidate(candidate) {
    try {
      if (!candidate) {
        console.log('[WebRTC] Received empty ICE candidate, ignoring');
        return;
      }

      if (!this.peerConnection) {
        console.log('[WebRTC] Queueing ICE candidate (no peer connection yet)');
        this.iceCandidatesQueue.push(candidate);
        return;
      }

      if (!this.peerConnection.remoteDescription) {
        console.log('[WebRTC] Queueing ICE candidate (no remote description yet)');
        this.iceCandidatesQueue.push(candidate);
        return;
      }

      const iceCandidate = new RTCIceCandidate(candidate);
      
      // Double-check peer connection still exists before adding candidate
      if (!this.peerConnection) {
        console.log('[WebRTC] Peer connection was closed, queueing candidate instead');
        this.iceCandidatesQueue.push(candidate);
        return;
      }
      
      await this.peerConnection.addIceCandidate(iceCandidate);
      console.log('[WebRTC] Added ICE candidate immediately');
    } catch (error) {
      console.error('[WebRTC] Error handling ICE candidate:', error);
      // On error, try to queue the candidate for later
      if (error.message && error.message.includes('null')) {
        console.log('[WebRTC] Queueing candidate due to null peer connection');
        this.iceCandidatesQueue.push(candidate);
      }
    }
  }

  /**
   * End the current call
   */
  endCall() {
    console.log('[WebRTC] Ending call');

    // Stop InCall Manager
    try {
      InCallManager.stop();
    } catch (error) {
      console.error('[WebRTC] Error stopping InCallManager:', error);
    }

    // Close peer connection
    if (this.peerConnection) {
      try {
        // Remove event handlers to prevent null reference errors
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onicegatheringstatechange = null;
        
        this.peerConnection.close();
        this.peerConnection = null;
      } catch (error) {
        console.error('[WebRTC] Error closing peer connection:', error);
        this.peerConnection = null;
      }
    }

    // Stop local stream
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('[WebRTC] Error stopping local stream:', error);
      }
      this.localStream = null;
    }

    // Clear remote stream
    this.remoteStream = null;

    // Reset state
    this.callState = 'ended';
    this.currentCallPeer = null;
    this.iceCandidatesQueue = [];
    this.pendingAnswer = null;
    this._notifyStateChange();

    // Reset to idle after a moment
    setTimeout(() => {
      this.callState = 'idle';
      this._notifyStateChange();
    }, 1000);
  }

  /**
   * Toggle mute
   */
  toggleMute() {
    if (!this.localStream) return;

    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    console.log('[WebRTC] Mute toggled:', this.isMuted);
    this._notifyStateChange();
  }

  /**
   * Toggle video
   */
  toggleVideo() {
    if (!this.localStream || !this.isVideoCall) return;

    this.isVideoEnabled = !this.isVideoEnabled;
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = this.isVideoEnabled;
    });

    console.log('[WebRTC] Video toggled:', this.isVideoEnabled);
    this._notifyStateChange();
  }

  /**
   * Toggle speaker
   */
  toggleSpeaker() {
    this.isSpeakerOn = !this.isSpeakerOn;
    InCallManager.setForceSpeakerphoneOn(this.isSpeakerOn);
    console.log('[WebRTC] Speaker toggled:', this.isSpeakerOn);
    this._notifyStateChange();
  }

  /**
   * Switch camera (front/back)
   */
  switchCamera() {
    if (!this.localStream || !this.isVideoCall) return;

    this.localStream.getVideoTracks().forEach(track => {
      track._switchCamera();
    });

    console.log('[WebRTC] Camera switched');
  }

  /**
   * Get local media stream
   */
  async _getLocalStream(isVideo) {
    try {
      const constraints = {
        audio: true,
        video: isVideo ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        } : false,
      };

      this.localStream = await mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC] Got local stream:', this.localStream.toURL());
      return this.localStream;
    } catch (error) {
      console.error('[WebRTC] Error getting local stream:', error);
      throw new Error('Failed to access camera/microphone. Please check permissions.');
    }
  }

  /**
   * Create peer connection
   */
  _createPeerConnection() {
    console.log('[WebRTC] Creating peer connection');

    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    // Add local stream tracks
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      console.log('[WebRTC] Adding local stream tracks:', tracks.length);
      tracks.forEach(track => {
        console.log('[WebRTC] Adding track:', track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState);
        // Ensure track is enabled
        track.enabled = true;
        this.peerConnection.addTrack(track, this.localStream);
      });
      console.log('[WebRTC] Local stream tracks added to peer connection');
    } else {
      console.warn('[WebRTC] No local stream available when creating peer connection');
    }

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate generated');
        if (this.onIceCandidate) {
          this.onIceCandidate(event.candidate);
        }
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote track');
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.onRemoteStream) {
          this.onRemoteStream(this.remoteStream);
        }
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      const state = this.peerConnection.connectionState;
      console.log('[WebRTC] Connection state:', state);
      
      if (state === 'connected') {
        console.log('[WebRTC] ✓ Peer connection established successfully');
      } else if (state === 'failed') {
        console.error('[WebRTC] ✗ Connection failed');
        this.endCall();
      } else if (state === 'disconnected') {
        console.log('[WebRTC] Connection disconnected');
        this.endCall();
      }
    };

    // Handle ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return;
      console.log('[WebRTC] ICE connection state:', this.peerConnection.iceConnectionState);
      
      // Log when connection is established
      if (this.peerConnection.iceConnectionState === 'connected' || 
          this.peerConnection.iceConnectionState === 'completed') {
        console.log('[WebRTC] ICE connection established successfully');
      } else if (this.peerConnection.iceConnectionState === 'failed') {
        console.error('[WebRTC] ICE connection failed');
        this.endCall();
      }
    };

    // Handle ICE gathering state
    this.peerConnection.onicegatheringstatechange = () => {
      if (!this.peerConnection) return;
      console.log('[WebRTC] ICE gathering state:', this.peerConnection.iceGatheringState);
    };

    // In case answer arrived before connection was ready
    this._applyPendingAnswerIfReady();
  }

  /**
   * Process queued ICE candidates
   */
  async _processIceCandidatesQueue() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      console.log('[WebRTC] Cannot process ICE candidates - no peer connection or remote description');
      return;
    }

    console.log(`[WebRTC] Processing ${this.iceCandidatesQueue.length} queued ICE candidates`);
    
    for (const candidate of this.iceCandidatesQueue) {
      try {
        // Check again in case peer connection was closed while processing
        if (!this.peerConnection) {
          console.log('[WebRTC] Peer connection closed while processing queued ICE candidates');
          break;
        }

        const iceCandidate = new RTCIceCandidate(candidate);
        await this.peerConnection.addIceCandidate(iceCandidate);
        console.log('[WebRTC] Added queued ICE candidate');
      } catch (error) {
        console.error('[WebRTC] Error adding queued ICE candidate:', error);
        // Continue processing other candidates even if one fails
      }
    }
    
    this.iceCandidatesQueue = [];
  }

  /**
   * Notify state change
   */
  _notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange({
        callState: this.callState,
        isVideoCall: this.isVideoCall,
        isMuted: this.isMuted,
        isVideoEnabled: this.isVideoEnabled,
        isSpeakerOn: this.isSpeakerOn,
        currentCallPeer: this.currentCallPeer,
        localStream: this.localStream,
        remoteStream: this.remoteStream,
      });
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      callState: this.callState,
      isVideoCall: this.isVideoCall,
      isMuted: this.isMuted,
      isVideoEnabled: this.isVideoEnabled,
      isSpeakerOn: this.isSpeakerOn,
      currentCallPeer: this.currentCallPeer,
      localStream: this.localStream,
      remoteStream: this.remoteStream,
    };
  }
}

// Export singleton instance
export default new WebRTCService();

