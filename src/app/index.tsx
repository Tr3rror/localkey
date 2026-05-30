import '@/constants/i18n';
import { Image } from 'expo-image';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
  getBiometricCredential, initStorage,
  isBiometricEnabledForUser, verifyPassword,
} from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { User } from '@/constants/types';

const { width: W, height: H } = Dimensions.get('window');

type AppState = 'loading' | 'no_users' | 'has_users';

function isImageUri(s: string): boolean {
  return s.startsWith('/') || s.startsWith('file:') || s.startsWith('content:')
      || s.startsWith('ph://') || s.startsWith('asset-library:') || s.startsWith('http');
}

function roleLabel(role: User['role']): string {
  if (role === 'masterAdmin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  return 'User';
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({
  user, size, roleColor, isMaster, colors,
}: {
  user: User; size: number; roleColor: string; isMaster: boolean; colors: any;
}) {
  const icon      = getAccountIcon(user.id);
  const showImage = isImageUri(icon);
  const showEmoji = !showImage && icon && icon !== '👤';
  const r         = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer shimmer ring */}
      <View style={[
        StyleSheet.absoluteFill,
        { borderRadius: r, borderWidth: isMaster ? 1.5 : 1,
          borderColor: roleColor + (isMaster ? '66' : '33') },
      ]} />
      {/* Inner ring */}
      <View style={[
        { position: 'absolute', inset: 6, borderRadius: r - 6,
          borderWidth: 1, borderColor: roleColor + '22' },
      ]} />
      {/* Avatar circle */}
      <View style={[
        { width: size - 18, height: size - 18, borderRadius: r - 9,
          backgroundColor: showImage ? 'transparent' : roleColor + '1A',
          overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
      ]}>
        {showImage ? (
          <Image
            source={{ uri: icon }}
            style={{ width: size - 18, height: size - 18, borderRadius: r - 9 }}
            contentFit="cover"
          />
        ) : showEmoji ? (
          <Text style={{ fontSize: size * 0.38 }}>{icon}</Text>
        ) : (
          <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: roleColor }}>
            {user.username.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Master card — horizontal row, visually elevated ─────────────────────────
function MasterCard({
  user, index, bioAvail, bioType, colors, onPress, onBioPress,
}: {
  user: User; index: number; bioAvail: boolean; bioType: string;
  colors: any; onPress: () => void; onBioPress: () => void;
}) {
  const anim       = useRef(new Animated.Value(0)).current;
  const isBioEnabled = bioAvail && isBiometricEnabledForUser(user.id);
  const bioIcon    = bioType === 'face' ? '🪪' : bioType === 'fingerprint' ? '☝' : '🔓';

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, delay: index * 100, tension: 52, friction: 12, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }],
    }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={[
        st.masterCard, { backgroundColor: colors.card, borderColor: colors.accent + '55' },
      ]}>
        {/* Faint accent glow top-right */}
        <View style={[st.masterGlow, { backgroundColor: colors.accent + '0A' }]} pointerEvents="none" />

        {/* Avatar */}
        <Avatar user={user} size={58} roleColor={colors.accent} isMaster colors={colors} />

        {/* Info */}
        <View style={st.masterInfo}>
          <View style={st.masterNameRow}>
            <Text style={[st.masterName, { color: colors.text }]}>{user.username}</Text>
            <View style={[st.masterStarBadge, { backgroundColor: colors.accent }]}>
              <Text style={[st.masterStarTxt, { color: colors.background }]}>★</Text>
            </View>
          </View>
          <Text style={[st.masterRole, { color: colors.accent }]}>Master Admin</Text>
        </View>

        {/* Right side */}
        {isBioEnabled ? (
          <TouchableOpacity
            style={[st.masterBioBtn, { backgroundColor: colors.accent + '14', borderColor: colors.accent + '44' }]}
            onPress={onBioPress}
            hitSlop={{ top:10, bottom:10, left:10, right:10 }}
          >
            <Text style={{ fontSize: 18 }}>{bioIcon}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[st.masterArrow, { backgroundColor: colors.background }]}>
            <Text style={[{ fontSize: 20, color: colors.accent }]}>›</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Sub-account row — compact ─────────────────────────────────────────────────
function SubAccountRow({
  user, index, bioAvail, bioType, colors, onPress, onBioPress,
}: {
  user: User; index: number; bioAvail: boolean; bioType: string;
  colors: any; onPress: () => void; onBioPress: () => void;
}) {
  const anim       = useRef(new Animated.Value(0)).current;
  const isBioEnabled = bioAvail && isBiometricEnabledForUser(user.id);
  const isAdmin    = user.role === 'admin';
  const roleColor  = isAdmin ? '#7EB8C8' : colors.subtext;
  const bioIcon    = bioType === 'face' ? '🪪' : bioType === 'fingerprint' ? '☝' : '🔓';

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, delay: index * 90, tension: 55, friction: 12, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateX: anim.interpolate({ inputRange:[0,1], outputRange:[-20,0] }) }],
    }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}
        style={[st.subRow, { backgroundColor: colors.card, borderColor: colors.subtext + '22' }]}
      >
        <Avatar user={user} size={50} roleColor={roleColor} isMaster={false} colors={colors} />

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.subName, { color: colors.text }]}>{user.username}</Text>
          <Text style={[st.subRole, { color: roleColor }]}>{roleLabel(user.role)}</Text>
        </View>

        {isBioEnabled ? (
          <TouchableOpacity
            style={[st.subBioBtn, { backgroundColor: colors.accent + '14', borderColor: colors.accent + '44' }]}
            onPress={onBioPress}
            hitSlop={{ top:10, bottom:10, left:10, right:10 }}
          >
            <Text style={{ fontSize: 17 }}>{bioIcon}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[st.subArrow, { backgroundColor: colors.background }]}>
            <Text style={[{ fontSize: 20, color: colors.subtext }]}>›</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const router        = useRouter();
  const { colors, loadUserTheme } = useTheme();
  const { t }         = useTranslation();
  // When the user presses back from Login, Login passes this param so we
  // know not to auto-redirect again — they explicitly chose to come back.
  const { noAutoRedirect } = useLocalSearchParams<{ noAutoRedirect?: string }>();

  const [appState, setAppState] = useState<AppState>('loading');
  const [users,    setUsers]    = useState<User[]>([]);
  const [bioAvail, setBioAvail] = useState(false);
  const [bioType,  setBioType]  = useState<'face'|'fingerprint'|'generic'>('generic');

  // Entrance animations
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    try {
      const saved = getAllUsers();
      if (saved.length === 0) { setAppState('no_users'); return; }
      // Single account: auto-redirect to Login — but NOT if the user just
      // pressed back from Login (noAutoRedirect flag prevents the loop).
      if (saved.length === 1 && !noAutoRedirect) {
        router.push({ pathname: '/Login', params: { userId: saved[0].id, fromIndex: '1' } });
        return;
      }
      setUsers(saved);
      setAppState('has_users');
    } catch { setAppState('no_users'); }
  }, []);

  useEffect(() => {
    if (appState === 'no_users') { router.replace('/CreateUser'); return; }
    if (appState === 'has_users') {
      Animated.spring(headerAnim, { toValue:1, tension:50, friction:12, useNativeDriver:true }).start();
    }
  }, [appState]);

  useEffect(() => {
    (async () => {
      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
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

  async function handleBioLogin(user: User) {
    const cred = getBiometricCredential(user.id);
    if (cred === undefined) { router.push({ pathname:'/Login', params:{ userId: user.id } }); return; }
    try {
      const msg = bioType==='face' ? 'Use Face ID' : bioType==='fingerprint' ? 'Use fingerprint' : 'Authenticate';
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: msg, cancelLabel: 'Cancel', disableDeviceFallback: false });
      if (result.success) {
        try {
          if (user.role === 'masterAdmin') { initStorage(deriveKey(cred)); if (!verifyPassword(cred, user.passwordHash)) return; }
          else { if (!verifyPassword(cred, user.passwordHash)) return; }
          loadUserTheme(user.id, user.role === 'masterAdmin');
          router.replace({ pathname:'/Home', params:{ userId: user.id } });
        } catch {}
      }
    } catch {}
  }

  const masterUser = users.find(u => u.role === 'masterAdmin');
  const subUsers   = users.filter(u => u.role !== 'masterAdmin');

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Background decoration ─────────────────────────────────── */}
      {/* Large radial glow behind the whole page */}
      <View style={[st.bgGlow, { backgroundColor: colors.accent + '09' }]} pointerEvents="none" />
      {/* Faint grid lines for depth */}
      <View style={[st.bgGrid, { borderColor: colors.accent + '07' }]} pointerEvents="none" />

      {/* ── Header ───────────────────────────────────────────────── */}
      <Animated.View style={[st.header, {
        opacity: headerAnim,
        transform: [{ translateY: headerAnim.interpolate({ inputRange:[0,1], outputRange:[-12,0] }) }],
      }]}>
        {/* App name with accent dot */}
        <View style={st.appNameRow}>
          <Text style={[st.appName, { color: colors.text }]}>Local</Text>
          <Text style={[st.appNameAccent, { color: colors.accent }]}>Key</Text>
          <View style={[st.appNameDot, { backgroundColor: colors.accent }]} />
        </View>
        <Text style={[st.tagline, { color: colors.subtext }]}>{t('yourVaultTagline')}</Text>
      </Animated.View>

      {/* ── Thin accent rule ─────────────────────────────────────── */}
      <View style={[st.rule, { backgroundColor: colors.accent + '22' }]} />

      {/* ── Content ──────────────────────────────────────────────── */}
      <View style={st.content}>

        {/* Master account — hero card */}
        {masterUser && (
          <MasterCard
            user={masterUser}
            index={0}
            bioAvail={bioAvail}
            bioType={bioType}
            colors={colors}
            onPress={() => router.push({ pathname:'/Login', params:{ userId: masterUser.id } })}
            onBioPress={() => handleBioLogin(masterUser)}
          />
        )}

        {/* Sub-accounts section */}
        {subUsers.length > 0 && (
          <View style={st.subSection}>
            <Text style={[st.subSectionLabel, { color: colors.subtext }]}>
              {subUsers.length === 1 ? '1 account' : `${subUsers.length} accounts`}
            </Text>
            <View style={[st.subDivider, { backgroundColor: colors.card }]} />
            <View style={st.subList}>
              {subUsers.map((u, i) => (
                <SubAccountRow
                  key={u.id}
                  user={u}
                  index={i + 1}
                  bioAvail={bioAvail}
                  bioType={bioType}
                  colors={colors}
                  onPress={() => router.push({ pathname:'/Login', params:{ userId: u.id } })}
                  onBioPress={() => handleBioLogin(u)}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <View style={[st.footer, { borderColor: colors.card }]}>
        <TouchableOpacity
          style={[st.addBtn, { backgroundColor: colors.card }]}
          onPress={() => router.push('/CreateUser')}
          activeOpacity={0.75}
        >
          <View style={[st.addBtnIcon, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '33' }]}>
            <Text style={[{ fontSize: 16, color: colors.accent, lineHeight: 20 }]}>＋</Text>
          </View>
          <Text style={[st.addBtnTxt, { color: colors.subtext }]}>{t('addAccount')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:            { flex: 1, paddingTop: Platform.OS === 'android' ? 44 : 58 },
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Background decoration
  bgGlow:          { position: 'absolute', top: -H * 0.1, left: -W * 0.2, width: W * 1.4, height: H * 0.8, borderRadius: W, pointerEvents: 'none' },
  bgGrid:          { position: 'absolute', inset: 0, borderWidth: 0.5, borderRadius: 0, opacity: 1, pointerEvents: 'none' },

  // Header
  header:          { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 22, gap: 6 },
  appNameRow:      { flexDirection: 'row', alignItems: 'flex-end', gap: 0 },
  appName:         { fontSize: 44, fontWeight: '800', letterSpacing: -2 },
  appNameAccent:   { fontSize: 44, fontWeight: '800', letterSpacing: -2 },
  appNameDot:      { width: 7, height: 7, borderRadius: 3.5, marginBottom: 10, marginLeft: 3 },
  tagline:         { fontSize: 13, letterSpacing: 0.5 },
  rule:            { height: 1, marginHorizontal: 28, marginBottom: 24 },

  // Content
  content:         { flex: 1, paddingHorizontal: 20, gap: 20 },

  // Master card — horizontal, elevated
  masterCard:      { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 14, overflow: 'hidden' },
  masterGlow:      { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70 },
  masterInfo:      { flex: 1, gap: 4 },
  masterNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  masterName:      { fontSize: 16, fontWeight: '700' },
  masterStarBadge: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  masterStarTxt:   { fontSize: 9, fontWeight: '800' },
  masterRole:      { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  masterBioBtn:    { width: 40, height: 40, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  masterArrow:     { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },

  // Sub-account rows
  subSection:      { gap: 12 },
  subSectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', paddingLeft: 4 },
  subDivider:      { height: 1 },
  subList:         { gap: 8 },
  subRow:          { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14, gap: 14 },
  subName:         { fontSize: 15, fontWeight: '600' },
  subRole:         { fontSize: 11, fontWeight: '500', letterSpacing: 0.3 },
  subBioBtn:       { width: 40, height: 40, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  subArrow:        { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },

  // Footer
  footer:          { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: Platform.OS === 'android' ? 24 : 36 },
  addBtn:          { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14 },
  addBtnIcon:      { width: 30, height: 30, borderRadius: 9, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  addBtnTxt:       { fontSize: 14, fontWeight: '500' },
});