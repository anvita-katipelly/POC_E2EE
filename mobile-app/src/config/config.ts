import { Platform } from 'react-native';

// Get the correct server URL based on platform
const getServerUrl = (): string => {
  if (__DEV__) {
    // For Android emulator, use 10.0.2.2 to access host machine's localhost
    // For Android physical device, use your computer's IP address on the same network
    // For iOS simulator, localhost works fine
    if (Platform.OS === 'android') {
      // Use 10.0.2.2 for Android emulator, or replace with your machine's IP for physical device
      // To find your IP: On Mac/Linux: `ifconfig | grep "inet "`, On Windows: `ipconfig`
      return 'http://10.0.2.2:3000'; // Android emulator
      // For physical Android device, uncomment and replace with your IP:
      // return 'http://YOUR_COMPUTER_IP:3000';
    }
    return 'http://localhost:3000'; // iOS simulator
  }
  // Production URL
  return 'http://localhost:3000';
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

