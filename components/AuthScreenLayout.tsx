import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { authStyles as s } from '../styles/auth';

// ─── Outer screen wrapper ────────────────────────────────────────────────────

type AuthScreenLayoutProps = {
  title: string;
  subtitle: string;
  onBack: () => void;
  children: React.ReactNode;
};

export function AuthScreenLayout({ title, subtitle, onBack, children }: AuthScreenLayoutProps) {
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Pressable style={s.backButton} onPress={onBack}>
              <Text style={s.backButtonText}>Back</Text>
            </Pressable>
            <Text style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{subtitle}</Text>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── White card container ────────────────────────────────────────────────────

export function AuthFormCard({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

// ─── Labeled text input ──────────────────────────────────────────────────────

type AuthInputProps = TextInputProps & { label: string };

export function AuthInput({ label, ...props }: AuthInputProps) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#94A3B8" {...props} />
    </View>
  );
}

// ─── Primary action button ───────────────────────────────────────────────────

type AuthPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
};

export function AuthPrimaryButton({ label, onPress, loading }: AuthPrimaryButtonProps) {
  return (
    <Pressable
      style={[s.primaryButton, loading && s.primaryButtonDisabled]}
      onPress={onPress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator color="#FFFFFF" />
        : <Text style={s.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

// ─── Inline error message ────────────────────────────────────────────────────

export function AuthErrorBox({ message }: { message: string }) {
  return (
    <View style={s.errorBox}>
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
}

// ─── Bottom switch link ("Already have an account? Sign in") ─────────────────

type AuthFooterProps = {
  text: string;
  linkLabel: string;
  onPress: () => void;
};

export function AuthFooter({ text, linkLabel, onPress }: AuthFooterProps) {
  return (
    <View style={s.footer}>
      <Text style={s.footerText}>{text}</Text>
      <Pressable onPress={onPress}>
        <Text style={s.footerLink}>{linkLabel}</Text>
      </Pressable>
    </View>
  );
}
