import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  AlternativeShelterServiceError,
  acceptAlternative,
  getAlternativePreview,
} from '../services/alternativeShelter';

// A distance difference smaller than this is not worth reporting as a real
// change — it shows as "about the same distance" instead of an over-precise
// number the Haversine + 80m/min estimate can't actually back up.
const DISTANCE_NEGLIGIBLE_THRESHOLD_METERS = 20;

function formatAbsoluteDistance(meters: number): string {
  return `כ־${Math.round(Math.abs(meters))} מטר ממך`;
}

function formatAbsoluteWalkTime(minutes: number): string {
  return `כ־${Math.round(Math.abs(minutes))} דקות הליכה`;
}

// Never shows a raw "+" or "-" number: farther, closer, or "about the same".
function formatDistanceDelta(additionalMeters: number): string {
  const rounded = Math.round(additionalMeters);

  if (Math.abs(rounded) < DISTANCE_NEGLIGIBLE_THRESHOLD_METERS) {
    return 'בערך אותו מרחק';
  }

  if (rounded > 0) {
    return `עוד כ־${rounded} מטר`;
  }

  return `כ־${Math.abs(rounded)} מטר פחות`;
}

function formatWalkTimeDelta(additionalMinutes: number): string {
  const rounded = Math.round(additionalMinutes);

  if (rounded === 0) {
    return 'בערך אותו זמן הליכה';
  }

  if (rounded > 0) {
    return `עוד כ־${rounded} דקות הליכה`;
  }

  return `כ־${Math.abs(rounded)} דקות פחות`;
}

export type AlternativeShelterPreviewData = {
  currentShelterName: string;
  currentDistanceMeters: number;
  currentWalkMinutes: number;
  altShelterId: number;
  altShelterSource: string;
  altShelterName: string;
  altLatitude: number;
  altLongitude: number;
  altDistanceMeters: number;
  altWalkMinutes: number;
  additionalDistanceMeters: number;
  additionalWalkMinutes: number;
};

type AlternativeDisplayData = {
  shelterId: number;
  shelterSource: string;
  shelterName: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  walkMinutes: number;
};

type Props = {
  visible: boolean;
  journeyId: number;
  preview: AlternativeShelterPreviewData | null;
  onClose: () => void;
  // Called when accept fails specifically because current location could
  // no longer be verified (backend location_unavailable conflict). The
  // modal closes itself either way; this lets the parent screen show its
  // own calm message in the same place it already shows other
  // alternative-shelter errors, instead of the modal trying to display a
  // message on its own way out.
  onLocationUnavailable: () => void;
  // The authoritative capability value the parent screen already holds
  // (from GET /shelter-journeys/active) — forwarded into /navigation after
  // a successful accept so the destination screen never has to infer
  // whether Alternative is still authorized from journeyId alone. Accepting
  // an alternative doesn't change this value: it depends on the current
  // coordinates/emergency context, not on which shelter is currently
  // active.
  canRequestAlternative: boolean;
};

// Local UI state / modal, not a routed screen: opening or closing this must
// never push or leave an entry in the navigation back stack. Accepting an
// alternative replaces the current navigation destination in place; staying
// only closes the modal.
export default function AlternativeShelterPreviewModal({
  visible,
  journeyId,
  preview,
  onClose,
  onLocationUnavailable,
  canRequestAlternative,
}: Props) {
  const router = useRouter();
  const { token } = useAuth();

  const [alternative, setAlternative] = useState<AlternativeDisplayData | null>(null);
  const [additionalDistanceMeters, setAdditionalDistanceMeters] = useState(0);
  const [additionalWalkMinutes, setAdditionalWalkMinutes] = useState(0);

  // Flips to false only if a refresh after stale_preview/already_attempted
  // comes back with nothing left to offer.
  const [hasAlternative, setHasAlternative] = useState(true);

  const [isAccepting, setIsAccepting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Reset local state every time a fresh preview is handed in (each time the
  // button is pressed again), not just on first mount — the modal instance
  // is reused across repeated opens.
  useEffect(() => {
    if (!preview) {
      return;
    }

    setAlternative({
      shelterId: preview.altShelterId,
      shelterSource: preview.altShelterSource,
      shelterName: preview.altShelterName,
      latitude: preview.altLatitude,
      longitude: preview.altLongitude,
      distanceMeters: preview.altDistanceMeters,
      walkMinutes: preview.altWalkMinutes,
    });
    setAdditionalDistanceMeters(preview.additionalDistanceMeters);
    setAdditionalWalkMinutes(preview.additionalWalkMinutes);
    setHasAlternative(true);
    setStatusMessage('');
  }, [preview]);

  const handleStay = () => {
    // Close only. No API call, no Journey mutation, no Visit Session,
    // no route-stack change.
    onClose();
  };

  // Refreshes the preview once after a stale_preview/already_attempted
  // response, updating the comparison in place. Never calls accept
  // automatically, so this can never loop.
  const refreshPreviewOnce = async (latitude: number, longitude: number) => {
    if (!token) {
      return;
    }

    const refreshed = await getAlternativePreview(token, journeyId, latitude, longitude);

    if (refreshed.status === 'unavailable') {
      setHasAlternative(false);
      setStatusMessage('לא נמצאה כרגע חלופה נוספת באזור');
      return;
    }

    setAlternative({
      shelterId: refreshed.recommendedAlternative.id,
      shelterSource: refreshed.recommendedAlternative.source,
      shelterName: refreshed.recommendedAlternative.name,
      latitude: refreshed.recommendedAlternative.latitude,
      longitude: refreshed.recommendedAlternative.longitude,
      distanceMeters: refreshed.recommendedAlternative.estimatedDistanceMeters,
      walkMinutes: refreshed.recommendedAlternative.estimatedWalkMinutes,
    });
    setAdditionalDistanceMeters(refreshed.comparison.additionalEstimatedDistanceMeters);
    setAdditionalWalkMinutes(refreshed.comparison.additionalEstimatedWalkMinutes);
    setStatusMessage('');
  };

  const handleAccept = async () => {
    if (isAccepting || !token || !alternative) {
      return;
    }

    try {
      setIsAccepting(true);
      setStatusMessage('');

      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();

      if (locationStatus !== 'granted') {
        setStatusMessage('לא הצלחנו לבדוק חלופה כרגע. נסה שוב.');
        return;
      }

      // Accept uses the latest device coordinates, not the (possibly
      // stale) coordinates the preview was originally fetched with.
      const location = await Location.getCurrentPositionAsync({});

      const result = await acceptAlternative(
        token,
        journeyId,
        alternative.shelterId,
        alternative.shelterSource,
        location.coords.latitude,
        location.coords.longitude
      );

      if (result.status === 'accepted') {
        // result.previousVisitSessionId is available here (the backend
        // already tracks it) but intentionally unused today. It is the
        // extension point for a future explicit Journey action such as
        // "חזור ליעד קודם" — that action must be its own Journey operation
        // (e.g. a future revert endpoint), not router.back()/browser Back.
        //
        // Replace the active navigation destination in place. Never push —
        // this keeps navigation stack depth constant no matter how many
        // alternatives are accepted in a row, and never leaves this modal's
        // preview behind in the back stack (it was never a route).
        router.replace({
          pathname: '/navigation',
          params: {
            name: result.shelter.name,
            latitude: String(result.shelter.latitude),
            longitude: String(result.shelter.longitude),
            source: result.shelter.source,
            shelterId: String(result.shelter.id),
            visitSessionId: String(result.visitSessionId),
            journeyId: String(result.journeyId),
            canRequestAlternative: String(canRequestAlternative),
          },
        });
        return;
      }

      if (result.status === 'stale_preview') {
        setStatusMessage('ההצעה השתנתה. בודקים חלופה עדכנית...');
        await refreshPreviewOnce(location.coords.latitude, location.coords.longitude);
        return;
      }

      if (result.status === 'already_attempted') {
        setStatusMessage('המקלט הזה כבר נבדק. בודקים חלופה עדכנית...');
        await refreshPreviewOnce(location.coords.latitude, location.coords.longitude);
        return;
      }

      if (result.status === 'no_alternative_available') {
        setHasAlternative(false);
        setStatusMessage('לא נמצאה כרגע חלופה נוספת באזור');
        return;
      }

      if (result.status === 'location_unavailable') {
        // Current location can no longer be verified -- never show a raw
        // backend error, never navigate, never leave the current
        // destination. Close this pending Preview entirely rather than
        // inviting a retry that will just fail again until location
        // returns; the current destination is untouched either way. The
        // parent screen shows its own calm message in response.
        onLocationUnavailable();
        onClose();
        return;
      }
    } catch (error) {
      const technicalMessage =
        error instanceof AlternativeShelterServiceError ? error.message : String(error);
      console.log('Failed to accept alternative shelter:', technicalMessage, error);
      setStatusMessage('לא הצלחנו לבדוק חלופה כרגע. נסה שוב.');
    } finally {
      setIsAccepting(false);
    }
  };

  if (!preview) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleStay}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>מקלט חלופי</Text>

            {/* Section 1: current destination */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 יעד נוכחי</Text>
              <Text style={styles.shelterName}>{preview.currentShelterName || 'מקלט'}</Text>
              <Text style={styles.shelterLine}>
                {formatAbsoluteDistance(preview.currentDistanceMeters)}
              </Text>
              <Text style={styles.shelterLine}>
                {formatAbsoluteWalkTime(preview.currentWalkMinutes)}
              </Text>
            </View>

            {hasAlternative && alternative ? (
              <>
                {/* Elegant separator signaling that an alternative was found */}
                <View style={styles.separatorRow}>
                  <View style={styles.separatorLine} />
                  <Ionicons name="chevron-down-circle" size={26} color="#93C5FD" />
                  <View style={styles.separatorLine} />
                </View>

                {/* Section 2: recommended alternative — visually distinct */}
                <View style={[styles.section, styles.alternativeSection]}>
                  <Text style={styles.sectionTitle}>✨ חלופה מומלצת</Text>
                  <Text style={styles.shelterName}>{alternative.shelterName}</Text>
                  <Text style={styles.shelterLine}>
                    {formatAbsoluteDistance(alternative.distanceMeters)}
                  </Text>
                  <Text style={styles.shelterLine}>
                    {formatAbsoluteWalkTime(alternative.walkMinutes)}
                  </Text>
                </View>

                {/* Section 3: the cost of switching — its own decision block */}
                <View style={styles.costSection}>
                  <Text style={styles.costSectionTitle}>עלות המעבר</Text>
                  <Text style={styles.costLine}>
                    • {formatDistanceDelta(additionalDistanceMeters)}
                  </Text>
                  <Text style={styles.costLine}>
                    • {formatWalkTimeDelta(additionalWalkMinutes)}
                  </Text>
                </View>

                {statusMessage ? (
                  <Text style={styles.statusMessage}>{statusMessage}</Text>
                ) : null}

                <Text style={styles.decisionQuestion}>האם לעבור לחלופה?</Text>

                <Pressable
                  style={[styles.primaryButton, isAccepting && styles.disabledButton]}
                  onPress={handleAccept}
                  disabled={isAccepting}
                >
                  <Text style={styles.primaryButtonText}>
                    {isAccepting ? 'מעבירים למסלול החלופי...' : 'לעבור למקלט החלופי'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleStay}
                  disabled={isAccepting}
                >
                  <Text style={styles.secondaryButtonText}>להישאר במסלול הנוכחי</Text>
                </Pressable>
              </>
            ) : (
              <>
                {statusMessage ? (
                  <Text style={styles.statusMessage}>{statusMessage}</Text>
                ) : null}

                <Pressable style={styles.secondaryButton} onPress={handleStay}>
                  <Text style={styles.secondaryButtonText}>להישאר במסלול הנוכחי</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F4F7FB',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  alternativeSection: {
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    backgroundColor: '#F0F7FF',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  shelterName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
  },
  shelterLine: {
    fontSize: 14,
    color: '#334155',
  },
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: -2,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DBEAFE',
  },
  costSection: {
    backgroundColor: '#EFF6FF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 6,
  },
  costSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 2,
  },
  costLine: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E3A5F',
  },
  decisionQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 4,
  },
  statusMessage: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
