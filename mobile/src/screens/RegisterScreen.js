import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import socketService from '../services/socketService';
import { SERVER_URL, COLORS, STYLES } from '../config/config';

const RegisterScreen = ({ navigation }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [serverUrl, setServerUrl] = useState(SERVER_URL);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    console.log('[RegisterScreen] Setting up event listeners');
    // Listen for connection events
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
      console.log('[RegisterScreen] handleRegistered called with:', registeredPhone);
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
  }, [navigation]);

  const handleConnectAndRegister = async () => {
    // Validate phone number
    const cleanedPhone = phoneNumber.replace(/\s/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid phone number');
      return;
    }

    // Validate phone number format (E.164 format)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(cleanedPhone)) {
      Alert.alert(
        'Invalid Phone Number',
        'Please enter a valid phone number (e.g., +1234567890 or 1234567890)'
      );
      return;
    }

    // Validate server URL
    if (!serverUrl || !serverUrl.startsWith('http')) {
      Alert.alert('Invalid Server URL', 'Please enter a valid server URL');
      return;
    }

    try {
      console.log('[RegisterScreen] Initializing socket connection to:', serverUrl);
      setIsConnecting(true);
      socketService.initialize(serverUrl);

      // Wait a bit for connection
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!socketService.isConnected) {
        setIsConnecting(false);
        Alert.alert('Connection Timeout', 'Failed to connect to server. Please check the URL.');
        return;
      }

      console.log('[RegisterScreen] Socket connected, registering with phone:', cleanedPhone);
      setIsRegistering(true);
      socketService.register(cleanedPhone);
    } catch (error) {
      setIsConnecting(false);
      setIsRegistering(false);
      Alert.alert('Error', error.message || 'Failed to connect');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>IMPLI</Text>
        <Text style={styles.subtitle}>Enter your phone number to get started</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            placeholder="http://192.168.1.100:3000"
            placeholderTextColor={COLORS.textSecondary}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isConnecting && !isRegistering}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+1234567890"
            placeholderTextColor={COLORS.textSecondary}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            editable={!isConnecting && !isRegistering}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, (isConnecting || isRegistering) && styles.buttonDisabled]}
          onPress={handleConnectAndRegister}
          disabled={isConnecting || isRegistering}
        >
          {isConnecting || isRegistering ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.buttonText}>Connect & Register</Text>
          )}
        </TouchableOpacity>

        {(isConnecting || isRegistering) && (
          <Text style={styles.statusText}>
            {isConnecting ? 'Connecting...' : 'Registering...'}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: STYLES.spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: STYLES.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: STYLES.spacing.xl,
  },
  inputContainer: {
    marginBottom: STYLES.spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: STYLES.spacing.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: STYLES.borderRadius.md,
    padding: STYLES.spacing.md,
    fontSize: 16,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: STYLES.spacing.md,
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
  statusText: {
    textAlign: 'center',
    marginTop: STYLES.spacing.md,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});

export default RegisterScreen;

