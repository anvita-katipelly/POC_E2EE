// Configuration file for the mobile app
// Update SERVER_URL to your server's IP address and port
// For local development, use your machine's local IP address (not localhost)
// 
// To find your local IP:
// - Mac/Linux: run `ifconfig` or `ip addr show` and look for inet address
// - Windows: run `ipconfig` and look for IPv4 address
// 
// For Android emulator, use: 'http://10.0.2.2:3000'
// For iOS simulator, you can use: 'http://localhost:3000' or your Mac's IP
// For physical devices, use your machine's local IP: 'http://192.168.1.XXX:3000'

export const SERVER_URL = __DEV__
  ? 'http://10.0.2.2:3000' // TODO: Change this to your local IP address
  : 'http://10.0.2.2:3000';

export const COLORS = {
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#000000',
  textSecondary: '#8E8E93',
  border: '#C7C7CC',
};

export const STYLES = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
};

