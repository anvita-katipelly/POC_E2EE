# E2EE Mobile App

React Native CLI mobile application for the E2EE (End-to-End Encrypted) messaging system.

## Features

- **Register Screen**: Connect to the server and register with your phone number
- **Peers List**: View all online peers and their connection status
- **Chat Screen**: Send and receive encrypted messages in real-time

## Prerequisites

Before setting up the mobile app, ensure you have:

1. **Node.js** (v18 or higher)
2. **React Native CLI** installed globally:
   ```bash
   npm install -g react-native-cli
   ```
3. **iOS Development** (for Mac only):
   - Xcode (latest version)
   - CocoaPods: `sudo gem install cocoapods`
4. **Android Development**:
   - Android Studio
   - Android SDK
   - Java Development Kit (JDK)

## Installation

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. For iOS (Mac only):
   ```bash
   # If iOS folder doesn't exist, initialize it first:
   # Option 1: Create a temp project and copy iOS folder
   npx react-native@latest init TempProject --skip-install
   mv TempProject/ios .
   rm -rf TempProject
   
   # Then install pods:
   cd ios
   pod install
   cd ..
   ```
   
   **Note**: The iOS folder structure is not included in this repository. You'll need to initialize it using React Native CLI as shown above.

## Configuration

1. **Update Server URL**:
   - Open `src/config/config.js`
   - Update `SERVER_URL` with your server's IP address
   - For local development, use your machine's local IP (not `localhost` or `127.0.0.1`)
   - Example: `http://192.168.1.100:3000`

   To find your local IP:
   - **Mac/Linux**: Run `ifconfig` or `ip addr show`
   - **Windows**: Run `ipconfig`
   - Look for your WiFi adapter's IPv4 address

2. **Make sure your server is running**:
   ```bash
   # From the project root
   npm start
   ```

## Running the App

### iOS

```bash
npm run ios
```

Or specify a device:
```bash
npm run ios -- --simulator="iPhone 15 Pro"
```

### Android

```bash
npm run android
```

Make sure you have:
- An Android emulator running, OR
- A physical device connected via USB with USB debugging enabled

## App Flow

1. **Register Screen**:
   - Enter server URL (defaults to configured value)
   - Enter your phone number (E.164 format, e.g., `+1234567890`)
   - Tap "Connect & Register"

2. **Peers List Screen**:
   - View all online peers (excluding yourself)
   - Pull down to refresh the list
   - Tap a peer to start chatting
   - Tap "Logout" to disconnect and return to register screen

3. **Chat Screen**:
   - Send messages to the selected peer
   - Receive real-time messages
   - Messages are encrypted end-to-end
   - Offline messages are delivered when you come back online

## Phone Number Format

Phone numbers should follow E.164 format:
- Starts with `+` followed by country code
- Example: `+1234567890`, `+919876543210`
- Or without `+`: `1234567890` (if it starts with a digit 1-9)

## Troubleshooting

### Connection Issues

- **Cannot connect to server**:
  - Verify server URL is correct
  - Ensure server is running (`npm start` from project root)
  - Check if your phone/emulator can reach the server IP
  - For Android emulator, use `10.0.2.2` instead of `localhost`
  - For iOS simulator, you can use `localhost` or your Mac's IP

- **Socket connection errors**:
  - Check firewall settings on your server machine
  - Ensure port 3000 is accessible
  - Verify both devices are on the same network

### iOS Issues

- **Pod installation fails**:
  ```bash
   cd ios
   pod deintegrate
   pod install
   ```

- **Build errors**:
  - Clean build folder: Product → Clean Build Folder in Xcode
  - Delete `DerivedData` folder

### Android Issues

- **Metro bundler issues**:
  ```bash
   npm start -- --reset-cache
   ```

- **Build errors**:
  ```bash
   cd android
   ./gradlew clean
   cd ..
   ```

## Project Structure

```
mobile/
├── src/
│   ├── screens/
│   │   ├── RegisterScreen.js      # Initial registration screen
│   │   ├── PeersListScreen.js     # List of online peers
│   │   └── ChatScreen.js          # Chat interface
│   ├── services/
│   │   └── socketService.js       # Socket.IO client service
│   └── config/
│       └── config.js              # App configuration
├── App.js                         # Main app component with navigation
├── index.js                       # App entry point
└── package.json                   # Dependencies
```

## Notes

- This app uses React Native CLI (not Expo)
- Socket.IO client is used for WebSocket communication
- React Navigation is used for screen navigation
- Messages are encrypted on the server side (the mobile app receives encrypted payloads)

## Development

To modify the server URL without editing code:
- The Register screen allows you to change the server URL before connecting
- You can also modify `src/config/config.js` for the default URL

