import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  TouchableWithoutFeedback,
  SafeAreaView,
  Keyboard,
} from 'react-native';
import { COLORS, STYLES } from '../config/config';

const COUNTRY_OPTIONS = [
  { code: 'IN', dialCode: '+91', name: 'India' },
  { code: 'US', dialCode: '+1', name: 'United States' },
  { code: 'GB', dialCode: '+44', name: 'United Kingdom' },
  { code: 'CA', dialCode: '+1', name: 'Canada' },
  { code: 'AU', dialCode: '+61', name: 'Australia' },
  { code: 'SG', dialCode: '+65', name: 'Singapore' },
  { code: 'AE', dialCode: '+971', name: 'United Arab Emirates' },
];

const RegisterScreen = ({ navigation }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_OPTIONS[0]);
  const handleContinue = () => {
    // Validate phone number
    const numericPhone = phoneNumber.replace(/\D/g, '');
    if (numericPhone.length !== 10) {
      Alert.alert('Invalid Phone Number', 'Phone number must be exactly 10 digits.');
      return;
    }

    if (numericPhone.startsWith('0')) {
      Alert.alert('Invalid Phone Number', 'Phone number cannot start with 0.');
      return;
    }

    const cleanedPhone = `${selectedCountry.dialCode}${numericPhone}`;

    // Validate phone number format (E.164 format)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(cleanedPhone)) {
      Alert.alert(
        'Invalid Phone Number',
        'Please enter a valid phone number (e.g., +1234567890 or 1234567890)'
      );
      return;
    }

    navigation.navigate('OtpVerification', {
      phoneNumber: cleanedPhone,
      localNumber: numericPhone,
      country: selectedCountry,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        >
          <View style={styles.content}>
            <Text style={styles.title}>IMPLI</Text>
            <Text style={styles.subtitle}>Enter your phone number to get started</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={styles.countrySelector}
                  onPress={() => setCountryModalVisible(true)}
                >
                  <Text style={styles.countryDialCode}>{selectedCountry.dialCode}</Text>
                  <Text style={styles.countryName}>{selectedCountry.name}</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  placeholder="9876543210"
                  placeholderTextColor={COLORS.textSecondary}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.button}
              onPress={handleContinue}
            >
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <Modal
        visible={countryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCountryModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Country</Text>
                <FlatList
                  data={COUNTRY_OPTIONS}
                  keyExtractor={(item) => item.code}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.countryOption,
                        item.code === selectedCountry.code && styles.countryOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedCountry(item);
                        setCountryModalVisible(false);
                      }}
                    >
                      <Text style={styles.countryOptionLabel}>
                        {item.name} ({item.dialCode})
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: STYLES.spacing.sm,
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
  phoneInput: {
    flex: 1,
  },
  countrySelector: {
    flexDirection: 'column',
    minWidth: 110,
    paddingVertical: STYLES.spacing.sm,
    paddingHorizontal: STYLES.spacing.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: STYLES.borderRadius.md,
  },
  countryDialCode: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  countryName: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: STYLES.borderRadius.xl,
    borderTopRightRadius: STYLES.borderRadius.xl,
    maxHeight: '70%',
    paddingBottom: STYLES.spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    padding: STYLES.spacing.lg,
    paddingBottom: STYLES.spacing.sm,
  },
  countryOption: {
    paddingHorizontal: STYLES.spacing.lg,
    paddingVertical: STYLES.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countryOptionSelected: {
    backgroundColor: COLORS.background,
  },
  countryOptionLabel: {
    fontSize: 16,
    color: COLORS.text,
  },
});

export default RegisterScreen;

