#!/bin/bash

# iOS Setup Script for React Native CLI
# This script helps set up the iOS project structure

echo "iOS Setup Script"
echo "================="
echo ""

# Check if we're on Mac
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Error: iOS development requires macOS"
    exit 1
fi

# Check if CocoaPods is installed
if ! command -v pod &> /dev/null; then
    echo "CocoaPods not found. Installing..."
    sudo gem install cocoapods
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "Error: Xcode is not installed. Please install Xcode from the Mac App Store."
    exit 1
fi

echo "If iOS folder doesn't exist, you need to initialize the React Native project:"
echo "  npx react-native@latest init E2EE_Mobile --skip-install"
echo ""
echo "Then copy the iOS folder from that project to this directory."
echo ""
echo "Or run from parent directory:"
echo "  npx react-native@latest init E2EE_Mobile"
echo "  # Then copy src/, App.js, index.js, package.json to the mobile/ folder"
echo ""

if [ -d "ios" ]; then
    echo "iOS folder found. Installing pods..."
    cd ios
    pod install
    cd ..
    echo "iOS setup complete!"
else
    echo "iOS folder not found. Please initialize the project first."
    echo ""
    echo "To create iOS structure, run from mobile/ directory:"
    echo "  npx react-native@latest init TempProject --skip-install"
    echo "  mv TempProject/ios ."
    echo "  rm -rf TempProject"
    echo "  cd ios && pod install && cd .."
fi

