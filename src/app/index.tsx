import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  deriveKey,
  getAccountIcon,
  getAllUsers,
  getBiometricCredential,
  initStorage,
  isBiometricEnabledForUser,
  verifyPassword,
} from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { User } from '@/constants/types';

type AppState = 'loading' | 'no_users' | 'has_users';

function roleLabel(role: User['role']): string {
  if (role === 'masterAdmin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  return 'User';
}

function isImageUri(s: string): boolean {
  return s.startsWith('/') || s.startsWith('file:') || s.startsWith('content:')
      || s.startsWith('ph://') || s.startsWith('asset-library:') || s.startsWith('http');
}

// ─── Animated user card ───────────────────────────────────────────────────────
function UserCard({
  user, index, bioAvail, bioType, colors,
  onPress, onBioPress,
}: {
  user: User; index: number; bioAvail: boolean; bioType: string; colors: any;
  onPress: () => void; onBioPress: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  // Read icon once on mount — no need for live refresh on the selection screen
  const icon = getAccountIcon(user.id);
  const showImage = isImageUri(icon);
  const showEmoji = !showImage && icon && icon !== '👤';

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      delay: index * 80,
      tension: 60,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, []);

  const isMaster = user.role === 'masterAdmin';
  const isAdmin  = user.role === 'admin';
  const isBioEnabled = bioAvail && isBiometricEnabledForUser(user.id);

  const roleColor =
    isMaster ? colors.accent :
    isAdmin  ? '#7EB8C8'     :
               colors.subtext;

  const bioIcon =
    bioType === 'face'        ? '🪪' :
    bioType === 'fingerprint' ? '☝'  : '🔓';

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [24,0] }) }],
    }}>
      <TouchableOpacity
        style={[
          st.card,
          { backgroundColor: colors.card },
          isMaster && { borderColor: colors.accent + '55', borderWidth: 1 },
        ]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {/* Avatar — image, emoji, or initial letter */}
        <View style={[st.avatarWrap, {
          backgroundColor: showImage ? 'transparent' : roleColor + '18',
          borderColor: showImage ? 'transparent' : roleColor + '55',
        }]}>
          {showImage ? (
            <Image
              source={{ uri: icon }}
              style={st.avatarImage}
              contentFit="cover"
            />
          ) : showEmoji ? (
            <Text style={st.avatarEmoji}>{icon}</Text>
          ) : (
            <Text style={[st.avatarLetter, { color: roleColor }]}>
              {user.username.charAt(0).toUpperCase()}
            </Text>
          )}
          {isMaster && (
            <View style={[st.crownBadge, { backgroundColor: colors.accent }]}>
              <Text style={st.crownTxt}>★</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={st.cardInfo}>
          <Text style={[st.cardName, { color: colors.text }]}>{user.username}</Text>
          <Text style={[st.cardRole, { color: roleColor }]}>{roleLabel(user.role)}</Text>
        </View>

        {/* Right: biometric button or arrow */}
        {isBioEnabled ? (
          <TouchableOpacity
            style={[st.bioBtn, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '55' }]}
            onPress={onBioPress}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={st.bioBtnTxt}>{bioIcon}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[st.arrowWrap, { backgroundColor: colors.background }]}>
            <Text style={[st.arrow, { color: colors.subtext }]}>›</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const router = useRouter();
  const { colors, loadUserTheme } = useTheme();
  const [appState, setAppState] = useState<AppState>('loading');
  const [users,    setUsers]    = useState<User[]>([]);
  const [bioAvail, setBioAvail] = useState(false);
  const [bioType,  setBioType]  = useState<'face' | 'fingerprint' | 'generic'>('generic');

  const titleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(titleAnim, { toValue: 1, tension: 50, friction: 12, useNativeDriver: true }).start();
    try {
      const saved = getAllUsers();
      if (saved.length === 0) setAppState('no_users');
      else { setUsers(saved); setAppState('has_users'); }
    } catch { setAppState('no_users'); }
  }, []);

  useEffect(() => {
    if (appState === 'no_users') router.replace('/CreateUser');
  }, [appState]);

  useEffect(() => {
    (async () => {
      try {
        const hasHw    = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHw || !enrolled) return;
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBioType('face');
        else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setBioType('fingerprint');
        setBioAvail(true);
      } catch {}
    })();
  }, []);

  if (appState === 'loading' || appState === 'no_users') {
    return (
      <View style={[st.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  async function handleBiometricLogin(user: User) {
    const cred = getBiometricCredential(user.id);
    if (cred === undefined) { router.push({ pathname: '/Login', params: { userId: user.id } }); return; }
    try {
      const msg = bioType === 'face' ? 'Use Face ID to unlock' : bioType === 'fingerprint' ? 'Use fingerprint to unlock' : 'Authenticate to unlock';
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: msg, fallbackLabel: 'Use password', cancelLabel: 'Cancel', disableDeviceFallback: false });
      if (result.success) {
        try {
          if (user.role === 'masterAdmin') { initStorage(deriveKey(cred)); if (!verifyPassword(cred, user.passwordHash)) return; }
          else { if (!verifyPassword(cred, user.passwordHash)) return; }
          loadUserTheme(user.id, user.role === 'masterAdmin');
          router.replace({ pathname: '/Home', params: { userId: user.id } });
        } catch {}
      }
    } catch {}
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Decorative top glow */}
      <View style={[st.topGlow, { backgroundColor: colors.accent + '18' }]} />

      {/* Header */}
      <Animated.View style={[st.header, {
        opacity: titleAnim,
        transform: [{ translateY: titleAnim.interpolate({ inputRange: [0,1], outputRange: [-16,0] }) }],
      }]}>
        <Text style={[st.appName, { color: colors.accent }]}>LocalKey</Text>
        <Text style={[st.tagline, { color: colors.subtext }]}>Your vault, your keys</Text>
      </Animated.View>

      {/* Divider */}
      <View style={[st.divider, { backgroundColor: colors.card }]} />

      {/* User list */}
      <FlatList
        data={users}
        keyExtractor={u => u.id}
        contentContainerStyle={st.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <Text style={[st.listLabel, { color: colors.subtext }]}>
            {users.length === 1 ? '1 account' : `${users.length} accounts`}
          </Text>
        }
        renderItem={({ item, index }) => (
          <UserCard
            user={item}
            index={index}
            bioAvail={bioAvail}
            bioType={bioType}
            colors={colors}
            onPress={() => router.push({ pathname: '/Login', params: { userId: item.id } })}
            onBioPress={() => handleBiometricLogin(item)}
          />
        )}
      />

      {/* Add account button */}
      <View style={st.footer}>
        <TouchableOpacity
          style={[st.addBtn, { borderColor: colors.card, backgroundColor: colors.card }]}
          onPress={() => router.push('/CreateUser')}
          activeOpacity={0.75}
        >
          <Text style={[st.addBtnPlus, { color: colors.accent }]}>＋</Text>
          <Text style={[st.addBtnTxt, { color: colors.text }]}>Add account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root:        { flex: 1, paddingTop: Platform.OS === 'android' ? 48 : 60 },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topGlow:     { position: 'absolute', top: 0, left: 0, right: 0, height: 260, borderBottomLeftRadius: 80, borderBottomRightRadius: 80 },
  header:      { paddingHorizontal: 28, paddingBottom: 24, gap: 6 },
  appName:     { fontSize: 46, fontWeight: '800', letterSpacing: -1.5 },
  tagline:     { fontSize: 14, letterSpacing: 0.4 },
  divider:     { height: 1, marginHorizontal: 20, marginBottom: 20 },
  listLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, paddingHorizontal: 4 },
  list:        { paddingHorizontal: 20, paddingBottom: 20 },

  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, gap: 14 },
  avatarWrap:  { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage:  { width: 52, height: 52, borderRadius: 16 },
  avatarEmoji:  { fontSize: 26 },
  avatarLetter:{ fontSize: 22, fontWeight: '700' },
  crownBadge:  { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  crownTxt:    { fontSize: 9, color: '#000' },
  cardInfo:    { flex: 1, gap: 3 },
  cardName:    { fontSize: 16, fontWeight: '700' },
  cardRole:    { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
  arrowWrap:   { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  arrow:       { fontSize: 22, lineHeight: 26 },
  bioBtn:      { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  bioBtnTxt:   { fontSize: 20 },

  footer:      { paddingHorizontal: 20, paddingBottom: Platform.OS === 'android' ? 28 : 40, paddingTop: 10 },
  addBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, paddingVertical: 16 },
  addBtnPlus:  { fontSize: 20, lineHeight: 22 },
  addBtnTxt:   { fontSize: 15, fontWeight: '600' },
});