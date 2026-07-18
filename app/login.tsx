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

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await login(email.trim(), password);
      router.back();
    } catch (e: any) {
      setError(e.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout
      title="Welcome back"
      subtitle="Sign in to access your followed areas and alerts"
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
          placeholder="Your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {error && <AuthErrorBox message={error} />}
        <AuthPrimaryButton label="Sign In" onPress={handleLogin} loading={loading} />
      </AuthFormCard>

      <AuthFooter
        text="Don't have an account?"
        linkLabel="Create account"
        onPress={() => router.replace('/register')}
      />
    </AuthScreenLayout>
  );
}
