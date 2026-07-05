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
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../constants/api';

export default function AddCommunityShelterScreen() {
  // Router instance used for navigation after successful submission.
  const router = useRouter();

  // Local form state for the shelter submission form.
  const [shelterName, setShelterName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isAccessible, setIsAccessible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    // Validate required fields before sending the request.
    if (!shelterName.trim() || !city.trim() || !address.trim()) {
      Alert.alert(
        'Missing information',
        'Please fill in shelter name, city, and address.'
      );
      return;
    }

    try {
      setLoading(true);

      // Send the shelter as a submitted shelter for review,
      // not directly as an active community shelter.
      const response = await fetch(`${API_BASE_URL}/submitted-shelters/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: shelterName.trim(),
          city: city.trim(),
          address: address.trim(),
          notes: notes.trim() || null,

          // Store accessibility as notes for now.
          accessibility_notes: isAccessible ? 'Accessible shelter' : null,

          // Optional submitter information can be added later.
          submitted_by_name: null,
          submitted_by_email: null,

          // New submissions should always start as pending review.
          submission_status: 'pending',
          review_notes: null,
        }),
      });

      // Handle backend errors.
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Failed to submit shelter for review:', errorText);
        Alert.alert('Error', 'Failed to submit shelter.');
        return;
      }

      // Show success message after successful submission.
      Alert.alert('Success', 'Shelter submitted for review successfully.');

      // Reset the form fields.
      setShelterName('');
      setCity('');
      setAddress('');
      setNotes('');
      setIsAccessible(false);

      // Navigate back after successful submission.
      router.back();
    } catch (error) {
      console.log('Network error while submitting shelter:', error);
      Alert.alert(
        'Error',
        'Something went wrong while submitting the shelter.'
      );
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

          <Text style={styles.title}>Add Community Shelter</Text>
          <Text style={styles.subtitle}>
            Submit a new protected area for review
          </Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Shelter Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter shelter name"
              value={shelterName}
              onChangeText={setShelterName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>City</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter city"
              value={city}
              onChangeText={setCity}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter address"
              value={address}
              onChangeText={setAddress}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Add useful details"
              value={notes}
              onChangeText={setNotes}
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
            styles.submitButton,
            (loading ||
              !shelterName.trim() ||
              !city.trim() ||
              !address.trim()) &&
              styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={
            loading ||
            !shelterName.trim() ||
            !city.trim() ||
            !address.trim()
          }
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Submitting...' : 'Submit Shelter'}
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
    paddingBottom: 24,
    gap: 20,
  },
  header: {
    gap: 8,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D9E6',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D9E6',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
    minHeight: 110,
  },
  switchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  switchTextContainer: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  switchSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  submitButton: {
    marginTop: 4,
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
