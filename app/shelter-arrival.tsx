import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import AlternativeShelterPreviewModal, {
  type AlternativeShelterPreviewData,
} from '../components/AlternativeShelterPreviewModal';
import { useAuth } from '../context/AuthContext';
import {
  AlternativeShelterServiceError,
  completeJourney,
  getAlternativePreview,
} from '../services/alternativeShelter';

type ArrivalState = 'question' | 'success' | 'failure';

export default function ShelterArrivalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token } = useAuth();

  const visitSessionId = String(params.visitSessionId || '');
  const shelterName = String(params.shelterName || '');
  const shelterId = String(params.shelterId || '');
  const shelterSource = String(params.shelterSource || '');
  const journeyId = Number(params.journeyId);
  const hasValidJourneyId = Number.isFinite(journeyId) && journeyId > 0;

  // The authoritative capability from GET /shelter-journeys/active,
  // forwarded in by Navigation — never inferred from journeyId alone (see
  // navigation.tsx for the same rule).
  const canRequestAlternative = params.canRequestAlternative === 'true';

  const [arrivalState, setArrivalState] = useState<ArrivalState>('question');

  // Tracks the in-progress alternative-shelter search triggered from this screen.
  const [isFindingAlternative, setIsFindingAlternative] = useState(false);
  const [alternativeShelterError, setAlternativeShelterError] = useState('');

  // The alternative-shelter preview is local UI state (a Modal), never a
  // routed screen — opening/closing it must never touch the navigation stack.
  const [alternativePreview, setAlternativePreview] =
    useState<AlternativeShelterPreviewData | null>(null);
  const [isAlternativePreviewVisible, setIsAlternativePreviewVisible] = useState(false);

  const handleConfirmArrival = () => {
    // Update the UI immediately — arrival confirmation must never wait on a
    // network call. Marking the Journey as completed happens in the
    // background; a failure here shouldn't block or confuse the user who
    // has already, correctly, confirmed they're safe.
    setArrivalState('success');

    if (hasValidJourneyId && token) {
      completeJourney(token, journeyId).catch((error) => {
        console.log('Failed to mark journey as completed:', error);
      });
    }
  };

  const handleContinueToFeedback = () => {
    router.replace({
      pathname: '/shelter-feedback',
      params: {
        visitSessionId,
        shelterName,
        shelterId,
        shelterSource,
      },
    });
  };

  const handleFindAlternativeShelter = async () => {
    if (isFindingAlternative) {
      return;
    }

    if (!hasValidJourneyId || !canRequestAlternative) {
      // A missing journeyId or a Journey whose current coordinates don't
      // verify an active Emergency Context are both normal, expected
      // states — not necessarily a bug. This button is already hidden in
      // both cases (see the render conditions below); still guarded here
      // defensively, and logged for diagnosis.
      console.log(
        '[shelter-arrival] Alternative not currently available.',
        { rawJourneyId: params.journeyId, canRequestAlternative }
      );
      setAlternativeShelterError('האפשרות הזו זמינה רק במצב חירום.');
      return;
    }

    if (!token) {
      return;
    }

    try {
      setIsFindingAlternative(true);
      setAlternativeShelterError('');

      const { status: locationStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (locationStatus !== 'granted') {
        setAlternativeShelterError('לא הצלחנו לבדוק חלופה כרגע. נסה שוב.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});

      const preview = await getAlternativePreview(
        token,
        journeyId,
        location.coords.latitude,
        location.coords.longitude
      );

      if (preview.status === 'unavailable') {
        setAlternativeShelterError('לא נמצאה כרגע חלופה נוספת באזור');
        return;
      }

      // Show the comparison in a local Modal and let the user decide — never
      // navigate automatically, and never push a route for this: opening the
      // preview must not affect the navigation stack.
      setAlternativePreview({
        currentShelterName: preview.currentShelter.name,
        currentDistanceMeters: preview.currentShelter.estimatedDistanceMeters,
        currentWalkMinutes: preview.currentShelter.estimatedWalkMinutes,
        altShelterId: preview.recommendedAlternative.id,
        altShelterSource: preview.recommendedAlternative.source,
        altShelterName: preview.recommendedAlternative.name,
        altLatitude: preview.recommendedAlternative.latitude,
        altLongitude: preview.recommendedAlternative.longitude,
        altDistanceMeters: preview.recommendedAlternative.estimatedDistanceMeters,
        altWalkMinutes: preview.recommendedAlternative.estimatedWalkMinutes,
        additionalDistanceMeters: preview.comparison.additionalEstimatedDistanceMeters,
        additionalWalkMinutes: preview.comparison.additionalEstimatedWalkMinutes,
      });
      setIsAlternativePreviewVisible(true);
    } catch (error) {
      const technicalMessage =
        error instanceof AlternativeShelterServiceError
          ? error.message
          : String(error);
      console.log('Failed to load alternative shelter preview:', technicalMessage, error);
      setAlternativeShelterError('לא הצלחנו לבדוק חלופה כרגע. נסה שוב.');
    } finally {
      setIsFindingAlternative(false);
    }
  };

  if (arrivalState === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContent}>
          <View style={[styles.iconCircle, styles.iconCircleSuccess]}>
            <Ionicons name="checkmark-circle" size={54} color="#16A34A" />
          </View>

          <Text style={styles.title}>יופי, נכנסת למקלט</Text>
          <Text style={styles.subtitle}>שמחים שהגעת בשלום</Text>

          <Pressable
            style={[styles.fullWidthButton, styles.continueButton]}
            onPress={handleContinueToFeedback}
          >
            <Text style={styles.filledButtonText}>להמשיך</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (arrivalState === 'failure') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContent}>
          <View style={[styles.iconCircle, styles.iconCircleFailure]}>
            <Ionicons name="alert-circle" size={54} color="#DC2626" />
          </View>

          <Text style={styles.title}>צריך למצוא מקלט אחר</Text>
          <Text style={styles.subtitle}>
            אל תישאר כאן. נעבור מיד לחלופה קרובה.
          </Text>

          {hasValidJourneyId && canRequestAlternative && (
            <>
              <Pressable
                style={[
                  styles.fullWidthButton,
                  styles.alternativePrimaryButton,
                  isFindingAlternative && styles.disabledButton,
                ]}
                onPress={handleFindAlternativeShelter}
                disabled={isFindingAlternative}
              >
                <Ionicons
                  name="swap-horizontal"
                  size={24}
                  color="#FFFFFF"
                  style={styles.buttonIcon}
                />
                <Text style={styles.filledButtonText}>
                  {isFindingAlternative
                    ? 'בודקים חלופה מתאימה...'
                    : 'מצא לי מקלט חלופי'}
                </Text>
              </Pressable>

              {alternativeShelterError ? (
                <Text style={styles.errorText}>{alternativeShelterError}</Text>
              ) : null}
            </>
          )}

          <Pressable
            style={[styles.fullWidthButton, styles.secondaryButton]}
            onPress={() => router.back()}
          >
            <Ionicons
              name="navigate-outline"
              size={22}
              color="#334155"
              style={styles.buttonIcon}
            />
            <Text style={styles.secondaryButtonText}>חזרה לניווט</Text>
          </Pressable>
        </View>

        <AlternativeShelterPreviewModal
          visible={isAlternativePreviewVisible}
          journeyId={journeyId}
          preview={alternativePreview}
          onClose={() => setIsAlternativePreviewVisible(false)}
          onLocationUnavailable={() =>
            setAlternativeShelterError('לא הצלחנו לאמת את המיקום הנוכחי. היעד הנוכחי נשמר.')
          }
          canRequestAlternative={canRequestAlternative}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centeredContent}>
        <View style={[styles.iconCircle, styles.iconCircleQuestion]}>
          <Ionicons name="enter-outline" size={48} color="#2563EB" />
        </View>

        <Text style={styles.title}>הצלחת להיכנס למקלט?</Text>
        <Text style={styles.subtitle}>
          בחר תשובה אחת — ונמשיך מיד לפי המצב
        </Text>

        <Pressable
          style={[styles.fullWidthButton, styles.successButton]}
          onPress={handleConfirmArrival}
        >
          <Ionicons
            name="checkmark-circle"
            size={28}
            color="#FFFFFF"
            style={styles.buttonIcon}
          />
          <Text style={styles.answerButtonText}>כן, נכנסתי</Text>
        </Pressable>

        <Pressable
          style={[styles.fullWidthButton, styles.dangerButton]}
          onPress={() => setArrivalState('failure')}
        >
          <Ionicons
            name="close-circle"
            size={28}
            color="#FFFFFF"
            style={styles.buttonIcon}
          />
          <Text style={styles.answerButtonText}>לא הצלחתי להיכנס</Text>
        </Pressable>

        {hasValidJourneyId && canRequestAlternative && (
          <>
            <Pressable
              style={[
                styles.fullWidthButton,
                styles.alternativeButton,
                isFindingAlternative && styles.disabledButton,
              ]}
              onPress={handleFindAlternativeShelter}
              disabled={isFindingAlternative}
            >
              <Ionicons
                name="swap-horizontal"
                size={23}
                color="#334155"
                style={styles.buttonIcon}
              />
              <View style={styles.alternativeTextGroup}>
                <Text style={styles.alternativeButtonText}>
                  {isFindingAlternative ? 'בודקים חלופה מתאימה...' : 'מצא לי מקלט חלופי'}
                </Text>
                {!isFindingAlternative && (
                  <Text style={styles.alternativeHint}>בלי לענות על השאלה</Text>
                )}
              </View>
            </Pressable>

            {alternativeShelterError ? (
              <Text style={styles.errorText}>{alternativeShelterError}</Text>
            ) : null}
          </>
        )}
      </View>

      <AlternativeShelterPreviewModal
        visible={isAlternativePreviewVisible}
        journeyId={journeyId}
        preview={alternativePreview}
        onClose={() => setIsAlternativePreviewVisible(false)}
        onLocationUnavailable={() =>
          setAlternativeShelterError('לא הצלחנו לאמת את המיקום הנוכחי. היעד הנוכחי נשמר.')
        }
        canRequestAlternative={canRequestAlternative}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  iconCircleQuestion: {
    backgroundColor: '#DBEAFE',
  },
  iconCircleSuccess: {
    backgroundColor: '#DCFCE7',
  },
  iconCircleFailure: {
    backgroundColor: '#FEE2E2',
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  fullWidthButton: {
    width: '100%',
    minHeight: 66,
    borderRadius: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButton: {
    backgroundColor: '#16A34A',
  },
  dangerButton: {
    backgroundColor: '#DC2626',
  },
  continueButton: {
    backgroundColor: '#16A34A',
    marginTop: 8,
  },
  alternativePrimaryButton: {
    backgroundColor: '#2563EB',
    marginTop: 8,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  alternativeButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    marginTop: 4,
  },
  answerButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  filledButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '700',
  },
  alternativeTextGroup: {
    alignItems: 'center',
  },
  alternativeButtonText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '800',
  },
  alternativeHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  buttonIcon: {
    marginStart: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});