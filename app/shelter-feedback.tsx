import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { submitShelterFeedback } from '../services/shelterFeedback';

type OpenAnswer = 'yes' | 'partial' | 'no' | null;
type AccessibleAnswer = 'yes' | 'partial' | 'no' | 'unknown' | null;
type ConditionAnswer = 'good' | 'okay' | 'poor' | null;

type QuestionKey = 'was_open' | 'was_accessible' | 'condition_rating';
type Tint = 'blue' | 'green' | 'amber' | 'red' | 'slate';

const TINTS: Record<Tint, { bg: string; color: string }> = {
  blue: { bg: '#EFF6FF', color: '#2563EB' },
  green: { bg: '#DCFCE7', color: '#16A34A' },
  amber: { bg: '#FEF3C7', color: '#B45309' },
  red: { bg: '#FEE2E2', color: '#DC2626' },
  slate: { bg: '#F1F5F9', color: '#475569' },
};

type QuestionOption = {
  label: string;
  value: string;
  iconFamily: 'ionicons' | 'material';
  icon: string;
  tint: Tint;
};

type QuestionConfig = {
  key: QuestionKey;
  question: string;
  helper: string;
  summaryLabel: string;
  options: QuestionOption[];
};

// Order matches the payload sent to submitShelterFeedback — presentation
// order only, the backend reads these by key, not by position.
const QUESTIONS: QuestionConfig[] = [
  {
    key: 'was_open',
    question: 'כשהגעת —\nהמקלט היה פתוח?',
    helper: 'הדיווח שלך עוזר לעדכן מה קורה כאן עכשיו.',
    summaryLabel: 'המקלט היה פתוח?',
    options: [
      { label: 'כן, היה פתוח', value: 'yes', iconFamily: 'material', icon: 'door-open', tint: 'blue' },
      { label: 'פתוח חלקית', value: 'partial', iconFamily: 'material', icon: 'door', tint: 'slate' },
      { label: 'לא, היה סגור', value: 'no', iconFamily: 'material', icon: 'lock', tint: 'slate' },
    ],
  },
  {
    key: 'was_accessible',
    question: 'המקלט היה נגיש?',
    helper: 'כניסה מתאימה לכיסא גלגלים\nוללא מכשולים משמעותיים.',
    summaryLabel: 'המקלט היה נגיש?',
    options: [
      { label: 'כן', value: 'yes', iconFamily: 'material', icon: 'wheelchair-accessibility', tint: 'blue' },
      { label: 'באופן חלקי', value: 'partial', iconFamily: 'material', icon: 'stairs', tint: 'slate' },
      { label: 'לא', value: 'no', iconFamily: 'material', icon: 'cancel', tint: 'slate' },
      { label: 'לא בטוח/ה', value: 'unknown', iconFamily: 'material', icon: 'help-circle-outline', tint: 'slate' },
    ],
  },
  {
    key: 'condition_rating',
    question: 'איך היה מצב המקלט?',
    helper: 'רק לפי ההתרשמות שלך.',
    summaryLabel: 'מצב המקלט?',
    options: [
      { label: 'טוב', value: 'good', iconFamily: 'material', icon: 'emoticon-happy-outline', tint: 'green' },
      { label: 'סביר', value: 'okay', iconFamily: 'material', icon: 'emoticon-neutral-outline', tint: 'amber' },
      { label: 'לא טוב', value: 'poor', iconFamily: 'material', icon: 'emoticon-sad-outline', tint: 'red' },
    ],
  },
];

const STEP_REVIEW = QUESTIONS.length;
const STEP_SUCCESS = QUESTIONS.length + 1;

export default function ShelterFeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token } = useAuth();

  const visitSessionId = Number(params.visitSessionId);

  const [wasOpen, setWasOpen] = useState<OpenAnswer>(null);
  const [wasAccessible, setWasAccessible] = useState<AccessibleAnswer>(null);
  const [conditionRating, setConditionRating] = useState<ConditionAnswer>(null);
  const [loading, setLoading] = useState(false);

  // Local conversational-step state only — no new route, no new screen.
  const [step, setStep] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const shiftAnim = useRef(new Animated.Value(0)).current;
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
      }
    };
  }, []);

  const goToStep = (nextStep: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 130,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      shiftAnim.setValue(10);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(shiftAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  const handleBack = () => {
    if (step === 0) {
      router.back();
      return;
    }
    goToStep(step - 1);
  };

  // Android hardware back should step through the conversation, not exit it.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0 && step < STEP_SUCCESS) {
        goToStep(step - 1);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [step]);

  const answers: Record<QuestionKey, string | null> = {
    was_open: wasOpen,
    was_accessible: wasAccessible,
    condition_rating: conditionRating,
  };

  const setAnswer = (key: QuestionKey, value: string) => {
    if (key === 'was_open') setWasOpen(value as OpenAnswer);
    else if (key === 'was_accessible') setWasAccessible(value as AccessibleAnswer);
    else setConditionRating(value as ConditionAnswer);
  };

  const renderQuestionIcon = (
    option: QuestionOption,
    size: number,
    color: string
  ) => {
    if (option.iconFamily === 'material') {
      return (
        <MaterialCommunityIcons
          name={option.icon as any}
          size={size}
          color={color}
        />
      );
    }

    return (
      <Ionicons
        name={option.icon as keyof typeof Ionicons.glyphMap}
        size={size}
        color={color}
      />
    );
  };

  const handleSelectAnswer = (questionIndex: number, key: QuestionKey, value: string) => {
    if (isAdvancing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAnswer(key, value);
    setIsAdvancing(true);

    advanceTimer.current = setTimeout(() => {
      setIsAdvancing(false);
      goToStep(questionIndex + 1);
    }, 260);
  };

  const handleSubmit = async () => {
    if (loading) return;

    if (!token) {
      Alert.alert('שגיאה', 'עליך להתחבר כדי לשלוח דיווח.');
      return;
    }

    if (!wasOpen || !wasAccessible || !conditionRating) {
      Alert.alert('חסרות תשובות', 'יש לענות על כל השאלות.');
      return;
    }

    try {
      setLoading(true);

      // Same call, same payload shape as before — presentation only.
      await submitShelterFeedback(token, visitSessionId, {
        was_open: wasOpen,
        was_accessible: wasAccessible,
        condition_rating: conditionRating,
      });

      goToStep(STEP_SUCCESS);
    } catch (error: any) {
      Alert.alert('שגיאה', error.message || 'שליחת הדיווח נכשלה. אפשר לנסות שוב.');
    } finally {
      setLoading(false);
    }
  };

  if (step === STEP_SUCCESS) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.centeredContent}>
          <View style={styles.successGroup}>
            <View style={styles.successHalo}>
              <View style={[styles.iconCircle, styles.iconCircleSuccess]}>
                <Ionicons name="checkmark" size={42} color="#FFFFFF" />
              </View>
            </View>

            <Text style={styles.centeredTitle}>תודה שעזרת 💙</Text>
            <Text style={styles.centeredHelperText}>
              הדיווח שלך יכול לעזור{'\n'}למי שיגיע למקלט אחריך.
            </Text>
          </View>

          <Pressable
            style={[styles.fullWidthButton, styles.primaryButton, styles.successButton]}
            onPress={() => router.back()}
          >
            <Text style={styles.filledButtonText}>סיום</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isReviewStep = step === STEP_REVIEW;
  const currentQuestion = isReviewStep ? null : QUESTIONS[step];

  const renderProgress = () => {
    const currentIndex = Math.min(step, QUESTIONS.length - 1);
    const filledCount = step >= STEP_REVIEW ? QUESTIONS.length : currentIndex + 1;
    return (
      <View style={styles.progressTrack}>
        {QUESTIONS.map((_, index) => (
          <View
            key={index}
            style={[styles.progressSegment, index < filledCount && styles.progressSegmentFilled]}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerRow}>
        <Pressable style={styles.backCircle} onPress={handleBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color="#334155" />
        </Pressable>

        {renderProgress()}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={[
            styles.stepContainer,
            { opacity: fadeAnim, transform: [{ translateY: shiftAnim }] },
          ]}
        >
          {isReviewStep ? (
            <View style={styles.reviewContent}>
              <View style={styles.reviewHero}>
                <View style={styles.reviewIconWrap}>
                  <Ionicons name="clipboard-outline" size={28} color="#2563EB" />
                </View>
                <Text style={styles.centeredTitle}>זה הכול!</Text>
                <Text style={styles.centeredHelperText}>
                  שלוש תשובות קטנות שיכולות לעזור{'\n'}למי שיגיע אחריך.
                </Text>
              </View>

              <View style={styles.summaryCard}>
                {QUESTIONS.map((question, index) => {
                  const selectedOption = question.options.find(
                    (option) => option.value === answers[question.key]
                  );
                  if (!selectedOption) return null;
                  const tint = TINTS[selectedOption.tint];
                  const isLast = index === QUESTIONS.length - 1;

                  return (
                    <View
                      key={question.key}
                      style={[styles.summaryRow, !isLast && styles.summaryRowDivider]}
                    >
                      <Text style={styles.summaryRowLabel}>{question.summaryLabel}</Text>
                      <View style={styles.summaryRowValue}>
                        <Text style={styles.summaryRowValueText}>{selectedOption.label}</Text>
                        <View style={[styles.summaryIconChip, { backgroundColor: tint.bg }]}>
                          {renderQuestionIcon(selectedOption, 18, tint.color)}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <Pressable
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>שליחת הדיווח</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.privacyRow}>
                <Ionicons name="lock-closed-outline" size={13} color="#94A3B8" />
                <Text style={styles.privacyText}>הדיווח נשמר באופן אנונימי</Text>
              </View>
            </View>
          ) : (
            currentQuestion && (
              <>
                <View style={styles.questionBlock}>
                  <View style={styles.introBlock}>
                    <Text style={styles.introTitle}>עוד רגע וסיימנו</Text>
                    <Text style={styles.introSubtitle}>
                      3 שאלות קצרות שיעזרו למי שיגיע אחריך.
                    </Text>
                  </View>

                  <Text style={styles.questionText}>{currentQuestion.question}</Text>
                  <Text style={styles.helperText}>{currentQuestion.helper}</Text>
                </View>

                <View style={styles.optionsGroup}>
                  {currentQuestion.options.map((option) => {
                    const isSelected = answers[currentQuestion.key] === option.value;
                    const tint = TINTS[option.tint];
                    return (
                      <Pressable
                        key={option.value}
                        style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                        onPress={() => handleSelectAnswer(step, currentQuestion.key, option.value)}
                        disabled={isAdvancing}
                      >
                        <View style={styles.checkSlot}>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={22} color="#2563EB" />
                          )}
                        </View>

                        <Text
                          style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}
                          numberOfLines={1}
                        >
                          {option.label}
                        </Text>

                        <View style={[styles.optionIconChip, { backgroundColor: tint.bg }]}>
                          {renderQuestionIcon(option, 24, tint.color)}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  /* Compact product header: no native route title, just back + progress. */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 18,
  },
  backCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  progressTrack: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E6EAF0',
  },
  progressSegmentFilled: {
    backgroundColor: '#1769F5',
  },

  /*
   * The mockup is deliberately composed in the upper/middle portion of the
   * phone instead of distributing content across the full viewport.
   */
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
  },
  stepContainer: {
    width: '100%',
  },

  questionBlock: {
    gap: 0,
  },
  introBlock: {
    gap: 4,
    marginBottom: 30,
  },
  introTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  introSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'right',
    lineHeight: 20,
  },
  questionText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0B1741',
    textAlign: 'right',
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  helperText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '500',
    color: '#65749A',
    textAlign: 'right',
    lineHeight: 22,
  },

  optionsGroup: {
    gap: 14,
    marginTop: 44,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    borderWidth: 1.25,
    borderColor: '#DCE3EC',
    borderRadius: 17,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.025,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  optionCardSelected: {
    backgroundColor: '#F5F9FF',
    borderColor: '#1769F5',
    borderWidth: 1.6,
  },
  checkSlot: {
    width: 30,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111D46',
    textAlign: 'right',
    marginHorizontal: 12,
  },
  optionLabelSelected: {
    color: '#111D46',
  },
  optionIconChip: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Review state: compact hero + one clear summary object. */
  reviewContent: {
    paddingTop: 14,
  },
  reviewHero: {
    alignItems: 'center',
    marginBottom: 30,
  },
  reviewIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    marginBottom: 14,
  },
  centeredTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0B1741',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  centeredHelperText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
    color: '#65749A',
    textAlign: 'center',
    lineHeight: 23,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE3EC',
    paddingHorizontal: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 62,
  },
  summaryRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#EDF1F5',
  },
  summaryRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  summaryRowValue: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  summaryRowValueText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111D46',
  },
  summaryIconChip: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    minHeight: 60,
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#1769F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#1769F5',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  privacyRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  privacyText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#94A3B8',
  },

  /* Success is intentionally centered as a single finished composition. */
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  successGroup: {
    alignItems: 'center',
  },
  successHalo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    marginBottom: 28,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSuccess: {
    backgroundColor: '#22B765',
    shadowColor: '#16A34A',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  successButton: {
    marginTop: 42,
  },
  fullWidthButton: {
    width: '100%',
    minHeight: 60,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#1769F5',
  },
  filledButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
});
