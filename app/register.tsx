import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import {
  AuthScreenLayout,
  AuthFormCard,
  AuthInput,
  AuthPrimaryButton,
  AuthErrorBox,
  AuthFooter,
} from '../components/AuthScreenLayout';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await register(email.trim(), password);
      router.back();
    } catch (e: any) {
      setError(e.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout
      title="Create account"
      subtitle="Join ShelterNow to track alerts in your followed areas"
      onBack={() => router.back()}
    >
      <AuthFormCard>
        <AuthInput
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <AuthInput
          label="Password"
          placeholder="At least 6 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {error && <AuthErrorBox message={error} />}
        <AuthPrimaryButton label="Create Account" onPress={handleRegister} loading={loading} />
      </AuthFormCard>

      <AuthFooter
        text="Already have an account?"
        linkLabel="Sign in"
        onPress={() => router.replace('/login')}
      />
    </AuthScreenLayout>
  );
}
