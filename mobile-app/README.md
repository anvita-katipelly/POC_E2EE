# E2EE Mobile App - Expo TypeScript

A React Native mobile application built with Expo and TypeScript that connects to the E2EE server for encrypted messaging and file sharing.

## Features

- ✅ **Phone Number Registration**: Register with your phone number to connect to the server
- ✅ **Real-time Messaging**: Send and receive encrypted text messages via WebSocket
- ✅ **File Sharing**: Send and receive encrypted files (with automatic download)
- ✅ **Peer Management**: View online peers and their status
- ✅ **Offline Message Queue**: Receive messages when you come back online
- ✅ **TypeScript**: Fully typed for better development experience
- ✅ **Expo**: Easy development and deployment

## Setup

### Prerequisites

- Node.js 16+
- Expo CLI (installed globally or via npx)
- iOS Simulator / Android Emulator or Expo Go app on physical device

### Installation

```bash
cd mobile-app
npm install
```

### Configuration

Edit `src/config/config.ts` to set your server URL:

```typescript
BASE_URL: 'http://YOUR_SERVER_IP:3000'
```

**Important URLs:**
- **iOS Simulator**: `http://localhost:3000`
- **Android Emulator**: `http://10.0.2.2:3000`
- **Physical Device (same network)**: `http://YOUR_COMPUTER_IP:3000`

To find your computer's IP:
- Mac/Linux: `ifconfig | grep "inet "`
- Windows: `ipconfig`

### Running the App

**Start Expo:**
```bash
npm start
```

Then:
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan QR code with Expo Go app on your phone

**Or run directly:**
```bash
npm run ios      # iOS Simulator
npm run android  # Android Emulator
npm run web      # Web browser
```

## Usage

1. **Start the Server**: Make sure your E2EE server is running (`npm start` in the main project)

2. **Register**: Enter your phone number in the format `+1234567890` and tap "Register & Connect"

3. **Send Messages**: 
   - Enter recipient's phone number
   - Type your message
   - Tap "Send"

4. **Receive Messages**: Messages appear in real-time in the chat interface

5. **File Sharing**: Files are automatically downloaded when received

## Project Structure

```
mobile-app/
├── src/
│   ├── config/
│   │   └── config.ts          # Server configuration
│   ├── services/
│   │   ├── socketService.ts   # WebSocket connection management
│   │   └── fileService.ts     # File upload/download with encryption
│   ├── screens/
│   │   ├── RegistrationScreen.tsx  # Phone number registration
│   │   └── ChatScreen.tsx          # Main messaging interface
│   └── types/
│       └── index.ts            # TypeScript type definitions
├── App.tsx                     # Navigation setup
└── package.json                # Dependencies
```

## Socket Events

The app listens for:
- `registered`: Confirmation of successful registration
- `message`: Incoming text or file messages
- `offline-messages`: Queued messages when coming online
- `peer-online` / `peer-offline`: Peer presence updates
- `error`: Error notifications

The app emits:
- `register`: Register with phone number
- `send-message`: Send text message
- `send-file`: Send file notification
- `get-online-peers`: Request list of online peers
- `get-peer-status`: Check if a peer is online

## Notes

- The server must be running and accessible from your device
- Phone numbers must be in E.164 format (e.g., +1234567890)
- Files are automatically encrypted/decrypted using AES-256-CBC
- Messages are queued if recipient is offline
- Uses Expo's built-in crypto and file system modules

## Troubleshooting

### Connection Issues

- **"Connection error"**: Check that server is running and URL is correct
- **"Network request failed"**: Verify server IP and port
- **iOS Simulator**: Use `localhost` or `127.0.0.1`
- **Android Emulator**: Use `10.0.2.2` instead of `localhost`

### Registration Issues

- Phone number must be in E.164 format: `+1234567890`
- Server must be accessible from device
- Check server logs for registration errors

### Expo Issues

- Clear cache: `npx expo start -c`
- Reinstall: `rm -rf node_modules && npm install`

