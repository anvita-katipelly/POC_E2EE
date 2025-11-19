import { PermissionsAndroid, Platform } from 'react-native';
import Contacts from 'react-native-contacts';

/**
 * Service to handle device contacts
 */
class ContactsService {
  constructor() {
    this.contacts = [];
    this.phoneToNameMap = {};
    this.isPermissionGranted = false;
  }

  /**
   * Normalize phone number for comparison
   * Removes all non-digit characters and handles country codes
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle different formats
    // If it starts with country code, keep it
    // Otherwise, we'll try to match last 10 digits for comparison
    return cleaned;
  }

  /**
   * Check if two phone numbers match
   * Compares last 10 digits to handle different formats
   */
  phoneNumbersMatch(phone1, phone2) {
    const normalized1 = this.normalizePhoneNumber(phone1);
    const normalized2 = this.normalizePhoneNumber(phone2);
    
    if (!normalized1 || !normalized2) return false;
    
    // Exact match
    if (normalized1 === normalized2) return true;
    
    // Compare last 10 digits (handles country code variations)
    const last10_1 = normalized1.slice(-10);
    const last10_2 = normalized2.slice(-10);
    
    if (last10_1.length >= 10 && last10_2.length >= 10) {
      return last10_1 === last10_2;
    }
    
    return false;
  }

  /**
   * Request contacts permission
   */
  async requestPermission() {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: 'Contacts Permission',
            message: 'IMPLI needs access to your contacts to show names',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        this.isPermissionGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        return this.isPermissionGranted;
      } else {
        // iOS
        const permission = await Contacts.requestPermission();
        this.isPermissionGranted = permission === 'authorized';
        return this.isPermissionGranted;
      }
    } catch (error) {
      console.error('[ContactsService] Error requesting permission:', error);
      return false;
    }
  }

  /**
   * Check if permission is already granted
   */
  async checkPermission() {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS
        );
        this.isPermissionGranted = granted;
        return granted;
      } else {
        const permission = await Contacts.checkPermission();
        this.isPermissionGranted = permission === 'authorized';
        return this.isPermissionGranted;
      }
    } catch (error) {
      console.error('[ContactsService] Error checking permission:', error);
      return false;
    }
  }

  /**
   * Load all contacts from device
   */
  async loadContacts() {
    try {
      // Check permission first
      const hasPermission = await this.checkPermission();
      if (!hasPermission) {
        const granted = await this.requestPermission();
        if (!granted) {
          console.log('[ContactsService] Contacts permission not granted');
          return false;
        }
      }

      console.log('[ContactsService] Loading contacts...');
      const contactsList = await Contacts.getAll();
      
      this.contacts = contactsList;
      this.phoneToNameMap = {};

      // Build phone-to-name mapping
      contactsList.forEach(contact => {
        const displayName = contact.displayName || 
                           contact.givenName || 
                           contact.familyName || 
                           'Unknown';
        
        // Map all phone numbers for this contact
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          contact.phoneNumbers.forEach(phoneEntry => {
            const phoneNumber = phoneEntry.number;
            if (phoneNumber) {
              const normalized = this.normalizePhoneNumber(phoneNumber);
              // Store multiple formats for better matching
              this.phoneToNameMap[normalized] = displayName;
              this.phoneToNameMap[phoneNumber] = displayName;
              
              // Also store last 10 digits for easier matching
              if (normalized.length >= 10) {
                const last10 = normalized.slice(-10);
                this.phoneToNameMap[last10] = displayName;
              }
            }
          });
        }
      });

      console.log(`[ContactsService] Loaded ${contactsList.length} contacts`);
      return true;
    } catch (error) {
      console.error('[ContactsService] Error loading contacts:', error);
      return false;
    }
  }

  /**
   * Get contact name for a phone number
   */
  getContactName(phoneNumber) {
    if (!phoneNumber) return null;
    
    // Try exact match first
    if (this.phoneToNameMap[phoneNumber]) {
      return this.phoneToNameMap[phoneNumber];
    }
    
    // Try normalized version
    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (this.phoneToNameMap[normalized]) {
      return this.phoneToNameMap[normalized];
    }
    
    // Try last 10 digits
    if (normalized.length >= 10) {
      const last10 = normalized.slice(-10);
      if (this.phoneToNameMap[last10]) {
        return this.phoneToNameMap[last10];
      }
    }
    
    // Try fuzzy matching with all stored numbers
    for (const [storedPhone, name] of Object.entries(this.phoneToNameMap)) {
      if (this.phoneNumbersMatch(phoneNumber, storedPhone)) {
        return name;
      }
    }
    
    return null;
  }

  /**
   * Get display name for a phone number (name if available, else number)
   */
  getDisplayName(phoneNumber) {
    const contactName = this.getContactName(phoneNumber);
    return contactName || phoneNumber;
  }

  /**
   * Get all contacts
   */
  getAllContacts() {
    return this.contacts;
  }

  /**
   * Clear cached contacts
   */
  clearCache() {
    this.contacts = [];
    this.phoneToNameMap = {};
  }
}

// Export singleton instance
export default new ContactsService();

