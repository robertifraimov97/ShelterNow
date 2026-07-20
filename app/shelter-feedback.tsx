import { useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { submitShelterFeedback } from '../services/shelterFeedback';

type OpenAnswer = 'yes' | 'no' | null;
type AccessibleAnswer = 'yes' | 'no' | 'unknown' | null;
type ConditionAnswer = 'good' | 'okay' | 'poor' | null;

export default function ShelterFeedbackScreen() {
  // Router is used for navigation after feedback submission.
  const router = useRouter();

  // Route params contain the visit session and shelter context.
  const params = useLocalSearchParams();

  // Auth context is used to access the logged-in token.
  const { token } = useAuth();

  const visitSessionId = Number(params.visitSessionId);
  const shelterName = String(params.shelterName || 'Selected Shelter');

  // Local state for the three feedback questions.
  const [wasOpen, setWasOpen] = useState<OpenAnswer>(null);
  const [wasAccessible, setWasAccessible] = useState<AccessibleAnswer>(null);
  const [conditionRating, setConditionRating] = useState<ConditionAnswer>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    // Validate that the user answered all required questions.
    if (!token) {
      Alert.alert('Error', 'You must be logged in to submit feedback.');
      return;
    }

    if (!wasOpen || !wasAccessible || !conditionRating) {
      Alert.alert('Missing answers', 'Please answer all three questions.');
      return;
    }

    try {
      setLoading(true);

      await submitShelterFeedback(token, visitSessionId, {
        was_open: wasOpen,
        was_accessible: wasAccessible,
        condition_rating: conditionRating,
      });

      Alert.alert('Thank you', 'Your feedback was submitted successfully.');

      // Return to the previous screen after a successful submission.
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit feedback.');
    } finally {
      setLoading(false);
    }
  };

  const renderOption = (
    label: string,
    value: string,
    selectedValue: string | null,
    onPress: (value: any) => void
  ) => {
    const isSelected = selectedValue === value;

    return (
      <Pressable
        style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
        onPress={() => onPress(value)}
      >
        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Shelter Feedback</Text>
          <Text style={styles.subtitle}>
            Help us improve shelter data for {shelterName}
          </Text>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionTitle}>1. Was the shelter open?</Text>
          {renderOption('Yes', 'yes', wasOpen, setWasOpen)}
          {renderOption('Partially', 'partial', wasOpen, setWasOpen)}
          {renderOption('No', 'no', wasOpen, setWasOpen)}
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionTitle}>2. Was the shelter accessible?</Text>
          {renderOption('Yes', 'yes', wasAccessible, setWasAccessible)}
          {renderOption('Partially', 'partial', wasAccessible, setWasAccessible)}
          {renderOption('No', 'no', wasAccessible, setWasAccessible)}
          {renderOption('Not sure', 'unknown', wasAccessible, setWasAccessible)}
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.questionTitle}>3. What was the shelter condition?</Text>
          {renderOption('Good', 'good', conditionRating, setConditionRating)}
          {renderOption('Okay', 'okay', conditionRating, setConditionRating)}
          {renderOption('Poor', 'poor', conditionRating, setConditionRating)}
        </View>

        <Pressable
          style={[
            styles.submitButton,
            (loading || !wasOpen || !wasAccessible || !conditionRating) &&
              styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading || !wasOpen || !wasAccessible || !conditionRating}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Submitting...' : 'Submit Feedback'}
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
    gap: 16,
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
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  questionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
  },
  optionButtonSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  optionText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#1D4ED8',
  },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
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
