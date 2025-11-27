// Polyfills for crypto
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Add btoa and atob polyfills for base64 encoding
if (typeof global.btoa === 'undefined') {
  global.btoa = (str) => {
    return Buffer.from(str, 'binary').toString('base64');
  };
}

if (typeof global.atob === 'undefined') {
  global.atob = (str) => {
    return Buffer.from(str, 'base64').toString('binary');
  };
}

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import RegisterScreen from './src/screens/RegisterScreen';
import OtpScreen from './src/screens/OtpScreen';
import PeersListScreen from './src/screens/PeersListScreen';
import ChatScreen from './src/screens/ChatScreen';
import CallScreen from './src/screens/CallScreen';
import IncomingCallScreen from './src/screens/IncomingCallScreen';
import { COLORS } from './src/config/config';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Register"
          screenOptions={{
            headerStyle: {
              backgroundColor: COLORS.surface,
            },
            headerTintColor: COLORS.text,
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: COLORS.background,
            },
          }}
        >
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="OtpVerification"
            component={OtpScreen}
            options={{ title: 'Verify OTP' }}
          />
          <Stack.Screen
            name="PeersList"
            component={PeersListScreen}
            options={{ title: 'Online Peers' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({ route }) => ({
              title: route.params?.peerPhone || 'Chat',
            })}
          />
          <Stack.Screen
            name="Call"
            component={CallScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="IncomingCall"
            component={IncomingCallScreen}
            options={{ 
              headerShown: false,
              presentation: 'fullScreenModal'
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
};

export default App;

