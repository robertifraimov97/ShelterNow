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
} from 'react-native';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../constants/api';

export default function AddCommunityShelterScreen() {
  const router = useRouter();

  const [shelterName, setShelterName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isAccessible, setIsAccessible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!shelterName.trim() || !city.trim()) {
      console.log('Shelter name and city are required');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/submitted-shelters/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: shelterName.trim(),
          city: city.trim(),
          address: address.trim() || null,
          latitude: null,
          longitude: null,
          notes: notes.trim() || null,
          accessibility_notes: isAccessible
            ? 'Marked as accessible by the submitter'
            : null,
          submitted_by_name: null,
          submitted_by_email: null,
          submission_status: 'pending',
          review_notes: null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.log('Failed to submit community shelter:', errorData);
        return;
      }

      router.back();
    } catch (error) {
      console.log('Network error while submitting community shelter:', error);
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
            Submit a new protected area to the shared database
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
            (loading || !shelterName.trim() || !city.trim()) &&
              styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading || !shelterName.trim() || !city.trim()}>
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
