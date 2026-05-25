import '@/constants/i18n';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  deriveKey,
  getAccountIcon,
  getBiometricCredential,
  getUserById,
  initStorage,
  isBiometricEnabledForUser,
  verifyPassword,
} from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { User } from '@/constants/types';

function roleLabel(role: User['role']): string {
  if (role === 'masterAdmin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  return 'User';
}

// ─── Guard wrapper ─────────────────────────────────────────────────────────────
export default function Login() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const user = getUserById(userId);

  if (!user) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <Text style={[s.errorText, { color: colors.subtext }]}>Account not found.</Text>
        <TouchableOpacity onPress={() => router.replace('/')} style={s.backLink}>
          <Text style={[s.backLinkText, { color: colors.accent }]}>← Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <LoginInner user={user} />;
}

// ─── Inner ─────────────────────────────────────────────────────────────────────
function LoginInner({ user }: { user: User }) {
  const router = useRouter();
  const { colors, loadUserTheme } = useTheme();
  const { t } = useTranslation();

  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled,   setBioEnabled]   = useState(false);
  const [bioType,      setBioType]      = useState<'face' | 'fingerprint' | 'generic'>('generic');
  // Load the persisted icon for this user
  const [userIcon,     setUserIcon]     = useState<string>(() => getAccountIcon(user.id));

  const hasPassword    = !!user.passwordHash;
  const didAutoTrigger = useRef(false);

  // Entrance animations
  const avatarAnim  = useRef(new Animated.Value(0)).current;
  const formAnim    = useRef(new Animated.Value(0)).current;
  const shakeAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(120, [
      Animated.spring(avatarAnim, { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.spring(formAnim,   { toValue: 1, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  function shake() {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue:  8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  0, duration: 40, useNativeDriver: true }),
    ]).start();
  }

  const roleColor =
    user.role === 'masterAdmin' ? colors.accent  :
    user.role === 'admin'       ? '#7EB8C8'      : colors.subtext;

  // ── Biometric detection ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const hasHw    = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHw || !enrolled) return;
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBioType('face');
        else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setBioType('fingerprint');
        const enabled = isBiometricEnabledForUser(user.id);
        setBioAvailable(true);
        setBioEnabled(enabled);
        if (enabled && !didAutoTrigger.current) {
          didAutoTrigger.current = true;
          const cred = getBiometricCredential(user.id);
          if (cred !== undefined) triggerBiometricAuth(cred);
        }
      } catch {}
    })();
  }, []);

  // ── Login logic ────────────────────────────────────────────────────────────
  function performLogin(pwd: string) {
    setLoading(true);
    setTimeout(() => {
      try {
        if (user.role === 'masterAdmin') {
          initStorage(deriveKey(pwd));
          if (!verifyPassword(pwd, user.passwordHash)) {
            setLoading(false); shake();
            Alert.alert(t('wrongPassword'), t('wrongPasswordMsg'));
            return;
          }
        } else {
          if (!verifyPassword(pwd, user.passwordHash)) {
            setLoading(false); shake();
            Alert.alert(t('wrongPassword'), t('wrongPasswordMsg'));
            return;
          }
        }
        setLoading(false);
        loadUserTheme(user.id, user.role === 'masterAdmin');
        router.replace({ pathname: '/Home', params: { userId: user.id } });
      } catch {
        setLoading(false);
        Alert.alert(t('vaultError'), t('vaultErrorMsg'));
      }
    }, 50);
  }

  async function triggerBiometricAuth(storedCred?: string) {
    const cred = storedCred ?? getBiometricCredential(user.id);
    if (cred === undefined) {
      Alert.alert(t('notSetUp'), t('notSetUpMsg'));
      return;
    }
    try {
      const msg = bioType === 'face' ? 'Use Face ID to unlock' : bioType === 'fingerprint' ? 'Use fingerprint to unlock' : 'Authenticate to unlock';
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: msg, fallbackLabel: 'Use password', cancelLabel: 'Cancel', disableDeviceFallback: false });
      if (result.success) performLogin(cred);
    } catch {}
  }

  const bioIcon  = bioType === 'face' ? '🪪' : bioType === 'fingerprint' ? '☝' : '🔓';
  const bioLabel = bioType === 'face' ? t('useFaceId') : bioType === 'fingerprint' ? t('useFingerprint') : t('useBiometrics');
  const showBio  = bioAvailable && bioEnabled;

  return (
    <KeyboardAvoidingView
      style={[s.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <View style={[s.backBtnInner, { backgroundColor: colors.card }]}>
            <Text style={[s.backBtnTxt, { color: colors.text }]}>←</Text>
          </View>
        </TouchableOpacity>

        {/* Avatar + identity */}
        <Animated.View style={[s.identity, {
          opacity: avatarAnim,
          transform: [{ translateY: avatarAnim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }],
        }]}>
          <View style={[s.avatarRing, { borderColor: roleColor + '44' }]}>
            {userIcon.startsWith('/') || userIcon.startsWith('file:') || userIcon.startsWith('content:') || userIcon.startsWith('ph://') || userIcon.startsWith('asset-library:') ? (
              <Image
                source={{ uri: userIcon }}
                style={s.avatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={[s.avatarInner, { backgroundColor: roleColor + '18', borderColor: roleColor + '66' }]}>
                <Text style={[s.avatarLetter, { color: roleColor }]}>
                  {userIcon !== '👤' ? userIcon : user.username.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={[s.username, { color: colors.text }]}>{user.username}</Text>
          <View style={[s.rolePill, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}>
            <Text style={[s.rolePillTxt, { color: roleColor }]}>{roleLabel(user.role)}</Text>
          </View>
        </Animated.View>

        {/* Form */}
        <Animated.View style={[s.form, {
          opacity: formAnim,
          transform: [
            { translateY: formAnim.interpolate({ inputRange:[0,1], outputRange:[24,0] }) },
            { translateX: shakeAnim },
          ],
        }]}>
          {hasPassword ? (
            <View style={s.fieldWrap}>
              <Text style={[s.fieldLabel, { color: colors.subtext }]}>Password</Text>
              <View style={[s.inputRow, { backgroundColor: colors.card, borderColor: colors.card }]}>
                <TextInput
                  style={[s.input, { color: colors.text }]}
                  placeholder={t('enterPassword')}
                  placeholderTextColor={colors.subtext}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={() => performLogin(password)}
                  returnKeyType="go"
                />
                <TouchableOpacity
                  style={[s.eyeBtn, { backgroundColor: colors.background }]}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Text style={[s.eyeTxt, { color: colors.subtext }]}>
                    {showPassword ? '🙈' : '👁'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[s.noPasswordCard, { backgroundColor: colors.card }]}>
              <Text style={s.noPasswordIcon}>🔓</Text>
              <Text style={[s.noPasswordTxt, { color: colors.subtext }]}>
                No password set — tap to enter
              </Text>
            </View>
          )}

          {/* Primary login button */}
          <TouchableOpacity
            style={[s.loginBtn, { backgroundColor: colors.accent }, loading && s.loginBtnLoading]}
            onPress={() => performLogin(password)}
            activeOpacity={0.82}
            disabled={loading}
          >
            <Text style={[s.loginBtnTxt, { color: colors.background }]}>
              {loading ? t('unlocking') : t('unlockVault')}
            </Text>
          </TouchableOpacity>

          {/* Biometric button */}
          {showBio && (
            <TouchableOpacity
              style={[s.bioBtn, { backgroundColor: colors.card, borderColor: colors.accent + '33' }]}
              onPress={() => triggerBiometricAuth()}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={s.bioBtnIcon}>{bioIcon}</Text>
              <Text style={[s.bioBtnLabel, { color: colors.text }]}>{bioLabel}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:           { flex: 1 },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText:      { fontSize: 15 },
  backLink:       { padding: 8 },
  backLinkText:   { fontSize: 15 },
  scroll:         { flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 52 : 64, paddingBottom: 48, gap: 0 },

  backBtn:        { marginBottom: 40 },
  backBtnInner:   { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  backBtnTxt:     { fontSize: 18 },

  identity:       { alignItems: 'center', marginBottom: 48, gap: 12 },
  avatarRing:     { width: 100, height: 100, borderRadius: 50, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarInner:    { width: 86, height: 86, borderRadius: 43, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  avatarImage:    { width: 96, height: 96, borderRadius: 48 },
  avatarLetter:   { fontSize: 36, fontWeight: '700' },
  username:       { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  rolePill:       { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  rolePillTxt:    { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  form:           { gap: 14 },
  fieldWrap:      { gap: 8 },
  fieldLabel:     { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', paddingLeft: 4 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingLeft: 16, paddingRight: 8, paddingVertical: 6, gap: 8 },
  input:          { flex: 1, fontSize: 16, paddingVertical: 10 },
  eyeBtn:         { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  eyeTxt:         { fontSize: 16 },

  noPasswordCard: { borderRadius: 14, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  noPasswordIcon: { fontSize: 24 },
  noPasswordTxt:  { fontSize: 14, flex: 1, lineHeight: 20 },

  loginBtn:        { borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 4 },
  loginBtnLoading: { opacity: 0.6 },
  loginBtnTxt:     { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  bioBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingVertical: 15 },
  bioBtnIcon:   { fontSize: 20 },
  bioBtnLabel:  { fontSize: 15, fontWeight: '600' },
});