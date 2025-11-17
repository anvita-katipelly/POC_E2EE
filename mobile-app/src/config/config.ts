import { Platform } from 'react-native';

const LOCAL_NETWORK_URL = 'http://192.168.61.42:3000';
const LOCALHOST_URL = 'http://localhost:3000';

const getEnvUrl = () => {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SERVER_URL) {
    return process.env.EXPO_PUBLIC_SERVER_URL;
  }
  return null;
};

// Get the correct server URL based on platform
const getServerUrl = (): string => {
  const envUrl = getEnvUrl();
  if (envUrl) {
    return envUrl;
  }

  // During development prefer the local network IP so physical devices can connect.
  if (__DEV__) {
    return LOCAL_NETWORK_URL;
  }

  // Production default - update when deploying the backend.
  if (Platform.OS === 'ios') {
    return LOCAL_NETWORK_URL;
  }
  return LOCALHOST_URL;
};

// Server configuration
export const SERVER_CONFIG = {
  BASE_URL: getServerUrl(),

  // WebSocket connection options
  WS_OPTIONS: {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 20000, // 20 second timeout
  },
};

// Phone number validation regex
export const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

