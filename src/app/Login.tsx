import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import { deriveKey, getUserById, initStorage, verifyPassword } from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { User } from '@/constants/types';


function roleLabel(role: User['role']): string {
  if (role === 'masterAdmin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  return 'User';
}

// ─── Guard wrapper ────────────────────────────────────────────────────────────
// Splitting into two components ensures TypeScript knows `user` is non-null
// inside LoginInner, fixing the "possibly undefined" errors inside setTimeout.
export default function Login() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const user = getUserById(userId);

  if (!user) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <Text style={[s.errorText, { color: colors.subtext }]}>User not found.</Text>
        <TouchableOpacity onPress={() => router.replace('/')} style={s.backLink}>
          <Text style={[s.backLinkText, { color: colors.accent }]}>← Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <LoginInner user={user} />;
}

// ─── Inner ────────────────────────────────────────────────────────────────────
function LoginInner({ user }: { user: User }) {
  const router = useRouter();
  const { colors, loadUserTheme } = useTheme();
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);

  // user is guaranteed User (not undefined) here
  const hasPassword = !!user.passwordHash;

  function roleColor(role: User['role']): string {
    if (role === 'masterAdmin') return colors.accent;
    if (role === 'admin') return '#7EB8C8';
    return colors.subtext;
  }

  function handleLogin() {
    setLoading(true);
    setTimeout(() => {
      try {
        if (user.role === 'masterAdmin') {
          initStorage(deriveKey(password));
          if (!verifyPassword(password, user.passwordHash)) {
            setLoading(false);
            Alert.alert('Wrong password', 'The password you entered is incorrect.');
            return;
          }
        } else {
          if (!verifyPassword(password, user.passwordHash)) {
            setLoading(false);
            Alert.alert('Wrong password', 'The password you entered is incorrect.');
            return;
          }
        }
        setLoading(false);
        // Load the correct theme for this user before navigating
        loadUserTheme(user.id, user.role === 'masterAdmin');
        router.replace({ pathname: '/Home', params: { userId: user.id } });
      } catch {
        setLoading(false);
        Alert.alert('Error', 'Could not open the vault. Please try again.');
      }
    }, 50);
  }

  return (
    <KeyboardAvoidingView
      style={[s.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.container}>
        <TouchableOpacity onPress={() => router.back()} style={s.backButton}>
          <Text style={[s.backText, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>

        <View style={s.profileSection}>
          <View style={[s.avatar, { borderColor: roleColor(user.role), backgroundColor: colors.card }]}>
            <Text style={[s.avatarText, { color: roleColor(user.role) }]}>
              {user.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[s.username, { color: colors.text }]}>{user.username}</Text>
          <Text style={[s.role, { color: roleColor(user.role) }]}>{roleLabel(user.role)}</Text>
        </View>

        <View style={s.form}>
          {hasPassword ? (
            <>
              <Text style={[s.label, { color: colors.subtext }]}>Password</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, s.inputFlex, {
                    backgroundColor: colors.card,
                    borderColor: colors.card,
                    color: colors.text,
                  }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.subtext}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleLogin}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[s.showToggle, { backgroundColor: colors.card, borderColor: colors.card }]}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Text style={[s.showToggleText, { color: colors.accent }]}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={[s.noPasswordBox, { backgroundColor: colors.card, borderColor: colors.card }]}>
              <Text style={[s.noPasswordText, { color: colors.subtext }]}>
                This account has no password. Tap below to enter.
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[s.loginButton, { backgroundColor: colors.accent }, loading && s.loginButtonDisabled]}
          onPress={handleLogin}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Text style={[s.loginButtonText, { color: colors.background }]}>
            {loading ? 'Opening vault…' : 'Log in'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:                { flex: 1 },
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText:           { fontSize: 15 },
  backLink:            { padding: 8 },
  backLinkText:        { fontSize: 15 },
  container:           { flex: 1, paddingHorizontal: 28, paddingTop: 70, paddingBottom: 48 },
  backButton:          { marginBottom: 48 },
  backText:            { fontSize: 15 },
  profileSection:      { alignItems: 'center', marginBottom: 52, gap: 10 },
  avatar:              { width: 80, height: 80, borderRadius: 40, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarText:          { fontSize: 32, fontWeight: '600' },
  username:            { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  role:                { fontSize: 13, fontWeight: '500', letterSpacing: 0.4 },
  form:                { marginBottom: 32, gap: 10 },
  label:               { fontSize: 13, fontWeight: '500', letterSpacing: 0.3, marginBottom: 2 },
  inputRow:            { flexDirection: 'row', gap: 10, alignItems: 'center' },
  inputFlex:           { flex: 1 },
  input:               { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  showToggle:          { paddingHorizontal: 12, paddingVertical: 14, borderWidth: 1, borderRadius: 12 },
  showToggleText:      { fontSize: 13, fontWeight: '600' },
  noPasswordBox:       { borderWidth: 1, borderRadius: 12, padding: 16 },
  noPasswordText:      { fontSize: 14, lineHeight: 20 },
  loginButton:         { borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  loginButtonDisabled: { opacity: 0.5 },
  loginButtonText:     { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});