import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import socketService from '../services/socketService';
import { SERVER_URL, COLORS, STYLES } from '../config/config';

const OtpScreen = ({ route, navigation }) => {
  const { phoneNumber, country, localNumber } = route.params || {};
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (!phoneNumber) {
      navigation.goBack();
      return;
    }

    const handleConnected = () => {
      setIsConnecting(false);
    };

    const handleDisconnected = () => {
      setIsConnecting(false);
      setIsRegistering(false);
    };

    const handleConnectionError = ({ error }) => {
      setIsConnecting(false);
      Alert.alert('Connection Error', error || 'Failed to connect to server');
    };

    const handleRegistered = ({ phoneNumber: registeredPhone }) => {
      setIsRegistering(false);
      navigation.replace('PeersList', { phoneNumber: registeredPhone });
    };

    const handleError = ({ message }) => {
      setIsRegistering(false);
      Alert.alert('Error', message || 'Registration failed');
    };

    socketService.on('connected', handleConnected);
    socketService.on('disconnected', handleDisconnected);
    socketService.on('connection-error', handleConnectionError);
    socketService.on('registered', handleRegistered);
    socketService.on('error', handleError);

    return () => {
      socketService.off('connected', handleConnected);
      socketService.off('disconnected', handleDisconnected);
      socketService.off('connection-error', handleConnectionError);
      socketService.off('registered', handleRegistered);
      socketService.off('error', handleError);
    };
  }, [navigation, phoneNumber]);

  const registerWithServer = async () => {
    try {
      setIsConnecting(true);
      socketService.initialize(SERVER_URL);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!socketService.isConnected) {
        setIsConnecting(false);
        Alert.alert('Connection Timeout', 'Failed to connect to server. Please try again.');
        return;
      }

      setIsRegistering(true);
      socketService.register(phoneNumber);
    } catch (error) {
      setIsConnecting(false);
      setIsRegistering(false);
      Alert.alert('Error', error.message || 'Failed to connect');
    }
  };

  const handleVerify = () => {
    if (otpValue.trim() !== '123456') {
      setOtpError('Incorrect OTP. Please enter 123456.');
      return;
    }

    setOtpError('');
    registerWithServer();
  };

  const displayPhone =
    country && localNumber ? `${country.dialCode} ${localNumber}` : phoneNumber;

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <View style={styles.content}>
          <Text style={styles.title}>Verify OTP</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to {displayPhone || 'your phone'}.
          </Text>

          <TextInput
            style={styles.otpInput}
            value={otpValue}
            onChangeText={(text) => {
              setOtpValue(text.replace(/\D/g, '').slice(0, 6));
              setOtpError('');
            }}
            placeholder="123456"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />

          {otpError ? <Text style={styles.otpError}>{otpError}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              (isConnecting || isRegistering) && styles.buttonDisabled,
            ]}
            onPress={handleVerify}
            disabled={isConnecting || isRegistering}
          >
            <Text style={styles.buttonText}>
              {isRegistering ? 'Registering...' : isConnecting ? 'Connecting...' : 'Verify & Continue'}
            </Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: STYLES.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: STYLES.spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: STYLES.spacing.lg,
  },
  otpInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: STYLES.borderRadius.lg,
    paddingVertical: STYLES.spacing.md,
    paddingHorizontal: STYLES.spacing.xl,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    color: COLORS.text,
    width: '80%',
  },
  otpError: {
    color: COLORS.error || '#ff3b30',
    fontSize: 14,
  },
  button: {
    width: '80%',
    backgroundColor: COLORS.primary,
    paddingVertical: STYLES.spacing.md,
    borderRadius: STYLES.borderRadius.md,
    alignItems: 'center',
    marginTop: STYLES.spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OtpScreen;

