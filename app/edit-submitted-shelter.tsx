import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_BASE_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

export default function EditSubmittedShelterScreen() {
  // Router instance used for navigation.
  const router = useRouter();
    
  const { token, isAuthenticated } = useAuth();

  // Read the shelter data passed from the previous screen.
  const params = useLocalSearchParams();

  const shelterId = String(params.id || '');
  const initialName = String(params.name || '');
  const initialCity = String(params.city || '');
  const initialAddress = String(params.address || '');
  const initialNotes = String(params.notes || '');
  const initialAccessibilityNotes = String(params.accessibility_notes || '');

  // Initialize local form state from route params.
  const [shelterName, setShelterName] = useState(initialName);
  const [city, setCity] = useState(initialCity);
  const [address, setAddress] = useState(initialAddress);
  const [notes, setNotes] = useState(initialNotes);
  const [isAccessible, setIsAccessible] = useState(
    initialAccessibilityNotes.toLowerCase().includes('accessible')
  );
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    // Validate required fields before sending the update.
    if (!shelterName.trim() || !city.trim() || !address.trim()) {
      Alert.alert(
        'Missing information',
        'Please fill in shelter name, city, and address.'
      );
      return;
    }
      
      if (!token || !isAuthenticated) {
        Alert.alert(
          'Sign in required',
          'You must be signed in to edit a submitted shelter.'
        );
        return;
      }

    try {
      setLoading(true);

      // Send an update request for the selected submitted shelter.
      const response = await fetch(
        `${API_BASE_URL}/submitted-shelters/${shelterId}`,
        {
          method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          body: JSON.stringify({
            name: shelterName.trim(),
            city: city.trim(),
            address: address.trim(),
            notes: notes.trim() || null,
            accessibility_notes: isAccessible ? 'Accessible shelter' : null,
          }),
        }
      );

      // Show an error if the backend rejects the update.
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Failed to update submitted shelter:', errorText);
        Alert.alert('Error', 'Failed to update shelter.');
        return;
      }

      Alert.alert('Success', 'Shelter updated successfully.');
      router.back();
    } catch (error) {
      console.log('Network error while updating shelter:', error);
      Alert.alert('Error', 'Something went wrong while updating the shelter.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Edit Submitted Shelter</Text>
          <Text style={styles.subtitle}>
            Update the details of a shelter you previously submitted
          </Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Shelter Name</Text>
            <TextInput
              style={styles.input}
              value={shelterName}
              onChangeText={setShelterName}
              placeholder="Enter shelter name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>City</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Enter city"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={styles.textArea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add useful details"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.switchCard}>
            <View style={styles.switchTextContainer}>
              <Text style={styles.switchTitle}>Accessible shelter</Text>
              <Text style={styles.switchSubtitle}>
                Mark if the protected area is suitable for accessibility needs
              </Text>
            </View>

            <Switch value={isAccessible} onValueChange={setIsAccessible} />
          </View>
        </View>

        <Pressable
          style={[
            styles.saveButton,
            (loading ||
              !shelterName.trim() ||
              !city.trim() ||
              !address.trim()) &&
              styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={
            loading ||
            !shelterName.trim() ||
            !city.trim() ||
            !address.trim()
          }
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 20,
  },
  header: {
    gap: 6,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
  },
  formSection: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 120,
    fontSize: 16,
    color: '#0F172A',
  },
  switchCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  switchTextContainer: {
    flex: 1,
    gap: 6,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
