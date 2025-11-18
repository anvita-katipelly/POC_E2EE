# React Native CLI Setup Guide

This guide will help you set up the React Native CLI project from scratch. Since React Native CLI projects require native code initialization, follow these steps:

## Initial Setup

### Option 1: Initialize with React Native CLI (Recommended)

If you haven't already initialized the React Native project, you can do so:

1. **Install React Native CLI globally**:
   ```bash
   npm install -g react-native-cli
   ```

2. **Initialize a new React Native project** (if starting fresh):
   ```bash
   npx react-native@latest init E2EE_Mobile --skip-install
   ```

3. **Navigate to mobile directory and install dependencies**:
   ```bash
   cd mobile
   npm install
   ```

### Option 2: Use Existing Structure

If you're using the existing structure in this repository:

1. **Navigate to mobile directory**:
   ```bash
   cd mobile
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **For iOS (Mac only), install CocoaPods dependencies**:
   ```bash
   cd ios
   pod install
   cd ..
   ```

## Android Setup

1. **Install Android Studio**:
   - Download from https://developer.android.com/studio
   - Install Android SDK, Android SDK Platform, and Android Virtual Device

2. **Set up environment variables** (add to your `~/.bashrc` or `~/.zshrc`):
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```

3. **Create an Android Virtual Device (AVD)**:
   - Open Android Studio
   - Go to Tools > Device Manager
   - Create a new virtual device (recommended: Pixel 5, API 33+)

4. **Generate debug keystore** (if not present):
   ```bash
   cd android/app
   keytool -genkeypair -v -storetype PKCS12 -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000
   cd ../..
   ```

## iOS Setup (Mac only)

1. **Install Xcode**:
   - Download from Mac App Store
   - Install Xcode Command Line Tools: `xcode-select --install`

2. **Install CocoaPods**:
   ```bash
   sudo gem install cocoapods
   ```

3. **Install iOS dependencies**:
   ```bash
   cd ios
   pod install
   cd ..
   ```

## Running the App

### Android

1. **Start Metro bundler**:
   ```bash
   npm start
   ```

2. **In a new terminal, run Android**:
   ```bash
   npm run android
   ```

   Or run on a specific device:
   ```bash
   npm run android -- --deviceId=<device-id>
   ```

### iOS

1. **Start Metro bundler**:
   ```bash
   npm start
   ```

2. **In a new terminal, run iOS**:
   ```bash
   npm run ios
   ```

   Or run on a specific simulator:
   ```bash
   npm run ios -- --simulator="iPhone 15 Pro"
   ```

## Server Configuration

1. **Update server URL** in `src/config/config.js`:
   - For Android emulator: `http://10.0.2.2:3000`
   - For iOS simulator: `http://localhost:3000` or your Mac's IP
   - For physical devices: Your machine's local IP (e.g., `http://192.168.1.100:3000`)

2. **Start your backend server**:
   ```bash
   # From project root
   npm start
   ```

3. **Ensure both devices are on the same network** (for physical devices)

## Troubleshooting

### Metro Bundler Issues

- Clear cache:
  ```bash
  npm start -- --reset-cache
  ```

### Android Build Issues

- Clean build:
  ```bash
  cd android
  ./gradlew clean
  cd ..
  ```

- Invalidate caches in Android Studio:
  File > Invalidate Caches / Restart

### iOS Build Issues

- Clean build folder in Xcode:
  Product > Clean Build Folder (Shift + Cmd + K)

- Reinstall pods:
  ```bash
  cd ios
  rm -rf Pods Podfile.lock
  pod install
  cd ..
  ```

### Connection Issues

- **Cannot connect to server**:
  - Verify server is running (`npm start` from project root)
  - Check firewall settings
  - For Android emulator, ensure using `10.0.2.2` not `localhost`
  - For iOS, check network permissions in Info.plist (already configured)

- **Socket.IO connection errors**:
  - Ensure server URL is correct in config
  - Check if server allows WebSocket connections
  - Verify port 3000 is accessible

## Project Structure

```
mobile/
├── android/          # Android native code
├── ios/              # iOS native code (if initialized)
├── src/
│   ├── screens/      # Screen components
│   ├── services/     # Business logic services
│   └── config/       # Configuration files
├── App.js            # Main app component
├── index.js          # Entry point
└── package.json      # Dependencies
```

## Next Steps

1. Update `src/config/config.js` with your server URL
2. Start the backend server
3. Run the app on your preferred platform
4. Test registration and messaging

