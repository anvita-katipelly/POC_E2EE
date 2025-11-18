#!/bin/bash

# iOS Setup Script for React Native CLI
# This script generates the iOS project structure

set -e

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

echo "Creating iOS structure from React Native template..."
echo ""

# Create a temporary React Native project to copy iOS structure
TEMP_PROJECT="TempIOSProject"
TEMP_DIR="/tmp/${TEMP_PROJECT}"

# Clean up any existing temp project
rm -rf "$TEMP_DIR"

# Initialize temp project with same React Native version
echo "Initializing temporary React Native project..."
npx react-native@0.73.2 init "$TEMP_PROJECT" --skip-install --directory "$TEMP_DIR" --version 0.73.2

# Check if iOS folder exists in temp project
IOS_PATH="$TEMP_DIR/ios"
if [ ! -d "$IOS_PATH" ]; then
    IOS_PATH="$TEMP_DIR/$TEMP_PROJECT/ios"
fi

if [ -d "$IOS_PATH" ]; then
    echo "Copying iOS structure from $IOS_PATH..."
    
    # Remove existing iOS folder if it exists
    if [ -d "ios" ]; then
        echo "Backing up existing iOS folder..."
        mv ios ios_backup_$(date +%Y%m%d_%H%M%S)
    fi
    
    # Copy iOS folder
    cp -r "$IOS_PATH" .
    
    # Rename project files to match our app name
    cd ios
    if [ -d "${TEMP_PROJECT}.xcodeproj" ]; then
        mv "${TEMP_PROJECT}.xcodeproj" "E2EE_Mobile.xcodeproj"
    fi
    if [ -d "${TEMP_PROJECT}.xcworkspace" ]; then
        mv "${TEMP_PROJECT}.xcworkspace" "E2EE_Mobile.xcworkspace"
    fi
    
    # Update project name in Podfile and other files
    if [ -f "Podfile" ]; then
        sed -i '' "s/${TEMP_PROJECT}/E2EE_Mobile/g" Podfile
    fi
    
    # Update Info.plist if it exists
    find . -name "Info.plist" -exec sed -i '' "s/${TEMP_PROJECT}/E2EE_Mobile/g" {} \;
    
    # Update AppDelegate if it exists
    find . -name "AppDelegate.*" -exec sed -i '' "s/${TEMP_PROJECT}/E2EE_Mobile/g" {} \;
    
    # Update main.m if it exists
    find . -name "main.m" -exec sed -i '' "s/${TEMP_PROJECT}/E2EE_Mobile/g" {} \;
    
    cd ..
    
    echo "iOS structure created successfully!"
    echo ""
    echo "Installing CocoaPods dependencies..."
    cd ios
    export LANG=en_US.UTF-8
    export LC_ALL=en_US.UTF-8
    pod install
    cd ..
    
    echo ""
    echo "✅ iOS setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Open ios/E2EE_Mobile.xcworkspace in Xcode"
    echo "  2. Or run: npm run ios"
    
else
    echo "Error: Could not find iOS folder in temp project"
    exit 1
fi

# Clean up temp project
echo ""
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "Done!"

