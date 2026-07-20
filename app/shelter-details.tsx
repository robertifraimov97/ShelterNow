import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  getShelterFeedbackSummary,
  type ShelterFeedbackSummary,
} from '../services/shelterFeedbackSummary';

export default function ShelterDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Read shelter details from route params.
  const shelterId = Number(params.shelterId);
  const shelterName = String(params.name || 'Shelter');
  const shelterAddress = String(params.address || '');
  const shelterSource = String(params.source || 'official');
  const shelterDistance = String(params.distance || '');
  const shelterAccessibility = String(
    params.accessibility || 'No accessibility data'
  );
  const shelterNotes = String(
    params.notes || 'No additional notes available.'
  );

  // Local state for the feedback summary section.
  const [summary, setSummary] = useState<ShelterFeedbackSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      if (!shelterId || Number.isNaN(shelterId)) {
        setLoadingSummary(false);
        return;
      }

      try {
        setLoadingSummary(true);
        setSummaryError(null);

        const data = await getShelterFeedbackSummary(shelterSource, shelterId);
        setSummary(data);
      } catch (error: any) {
        console.log('Failed to load shelter feedback summary:', error);
        setSummaryError('Failed to load community feedback.');
      } finally {
        setLoadingSummary(false);
      }
    };

    loadSummary();
  }, [shelterId, shelterSource]);

  const renderOpenSummary = () => {
    if (!summary || summary.total_feedback_count === 0) {
      return 'No user reports yet';
    }

    return `Reported open by ${summary.open_yes_count} of ${summary.total_feedback_count} users`;
  };

  const renderAccessibilitySummary = () => {
    if (!summary || summary.total_feedback_count === 0) {
      return 'No accessibility reports yet';
    }

    if (summary.accessible_no_count > 0) {
      return 'Accessibility issues reported';
    }

    if (summary.accessible_yes_count > 0) {
      return 'Accessibility reported by users';
    }

    return 'Mixed accessibility feedback';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Shelter Details</Text>
          <Text style={styles.subtitle}>
            Detailed information about the selected protected area
          </Text>
        </View>

        <View style={styles.mainCard}>
          <Text style={styles.shelterName}>{shelterName}</Text>
          <Text style={styles.shelterMeta}>
            {shelterDistance ? `${shelterDistance} • ` : ''}
            {shelterSource} source
          </Text>

          {!!shelterAddress && (
            <Text style={styles.shelterAddress}>{shelterAddress}</Text>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Accessibility</Text>
            <Text style={styles.infoValue}>{shelterAccessibility}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Notes</Text>
            <Text style={styles.infoValue}>{shelterNotes}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Community Feedback</Text>

            {loadingSummary ? (
              <Text style={styles.infoValue}>Loading feedback summary...</Text>
            ) : summaryError ? (
              <Text style={styles.infoValue}>{summaryError}</Text>
            ) : summary ? (
              <>
                <Text style={styles.infoValue}>{summary.summary_label}</Text>
                <Text style={styles.secondaryText}>
                  Reliability score: {summary.reliability_score}
                </Text>
                <Text style={styles.secondaryText}>
                  {summary.total_feedback_count} reports
                </Text>
                <Text style={styles.secondaryText}>{renderOpenSummary()}</Text>
                <Text style={styles.secondaryText}>
                  {renderAccessibilitySummary()}
                </Text>
              </>
            ) : (
              <Text style={styles.infoValue}>No feedback available</Text>
            )}
          </View>
        </View>

        <View style={styles.goButtonWrapper}>
          <View style={styles.emergencyButtonHalo}>
            <Pressable
              style={styles.emergencyButton}
              onPress={() => console.log('Start route pressed')}
            >
              <Text style={styles.emergencyButtonText}>Start</Text>
              <Text style={styles.emergencyButtonText}>Route</Text>
            </Pressable>
          </View>
        </View>
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
  },
  header: {
    marginBottom: 18,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 6,
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  shelterName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  shelterMeta: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 8,
  },
  shelterAddress: {
    fontSize: 15,
    color: '#475569',
    marginTop: 8,
  },
  infoSection: {
    gap: 14,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 24,
  },
  secondaryText: {
    fontSize: 14,
    color: '#475569',
    marginTop: 6,
  },
  goButtonWrapper: {
    marginTop: 28,
    alignItems: 'center',
  },
  emergencyButtonHalo: {
    width: 134,
    height: 134,
    borderRadius: 67,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  emergencyButton: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emergencyButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
});
