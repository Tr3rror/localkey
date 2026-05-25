import i18n from '@/constants/i18n';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ColorPickerModal } from '@/components/ColorPickerModal';
import {
  addPasswordToUser,
  deleteBiometricCredential,
  deleteUser,
  getAccountIcon,
  getAllUsers,
  getStoredLanguage,
  getUserById,
  hashPassword,
  isBiometricEnabledForUser,
  setAccountIcon as saveAccountIcon,
  saveBiometricCredential,
  saveUser,
  setStoredLanguage,
  toggleBiometricForUser,
  verifyPassword
} from '@/components/Encrypt';
import {
  exportCsv, exportExcel,
  importCsv, importExcel,
  type ImportResult,
} from '@/components/FileManipulation';
import { useTheme } from '@/components/ThemeContext';
import { PRESET_THEMES, ThemeColors, User } from '@/constants/types';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Luminance helper ─────────────────────────────────────────────────────────
function isDarkColor(hex: string): boolean {
  try {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return L < 0.35;
  } catch {
    return true;
  }
}
function contrastColor(bgHex: string): string {
  return isDarkColor(bgHex) ? '#FFFFFF' : '#000000';
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const I_BACK    = '←';
const I_TRASH   = '🗑';
const I_EDIT    = '✏';
const I_LOCK    = '🔒';
const I_EYE     = '👁';
const I_FINGER  = '☞';
const I_STATS   = '◈';
const I_IMPORT  = '↓';
const I_EXPORT  = '↑';
const I_CHEVRON = '›';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function roleLabel(role: User['role']) {
  if (role === 'masterAdmin') return 'Master Admin';
  if (role === 'admin')       return 'Admin';
  return 'User';
}
function roleColor(role: User['role'], accent: string) {
  if (role === 'masterAdmin') return accent;
  if (role === 'admin')       return '#7EB8C8';
  return '#555';
}

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ title, children, colors }: {
  title: string; children: React.ReactNode; colors: ThemeColors;
}) {
  return (
    <View style={sec.wrap}>
      <Text style={[sec.title, { color: colors.accent }]}>{title}</Text>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  wrap:  { marginBottom: 28 },
  title: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
});

// ─── Row ─────────────────────────────────────────────────────────────────────
function Row({ label, sub, right, onPress, colors }: {
  label: string; sub?: string; right?: React.ReactNode;
  onPress?: () => void; colors: ThemeColors;
}) {
  const inner = (
    <View style={[r.wrap, { backgroundColor: colors.card }]}>
      <View style={{ flex: 1 }}>
        <Text style={[r.label, { color: colors.text }]}>{label}</Text>
        {!!sub && <Text style={[r.sub, { color: colors.subtext }]}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <Text style={[r.chevron, { color: colors.subtext }]}>{I_CHEVRON}</Text> : null)}
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  return inner;
}
const r = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, marginBottom: 8, gap: 12 },
  label:   { fontSize: 15, fontWeight: '600' },
  sub:     { fontSize: 12, marginTop: 3 },
  chevron: { fontSize: 20 },
});

// ─── Shared bottom sheet styles ───────────────────────────────────────────────
const bs = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000085' },
  card:     { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  title:    { fontSize: 16, fontWeight: '700' },
  input:    { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  btnRow:   { flexDirection: 'row', gap: 10 },
  btn:      { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
});

// ─── User edit drawer ─────────────────────────────────────────────────────────
function UserEditDrawer({ user, currentUser, onClose, onSaved, colors }: {
  user: User; currentUser: User;
  onClose: () => void; onSaved: () => void; colors: ThemeColors;
}) {
  const [username,    setUsername]    = useState(user.username);
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [clearPwd,    setClearPwd]    = useState(false);
  const [role,        setRole]        = useState(user.role);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 12 }).start();
  }, []);

  function close() {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(onClose);
  }

  const translateY    = anim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });
  const isSelf        = user.id === currentUser.id;
  const canChangeRole = currentUser.role === 'masterAdmin' && user.role !== 'masterAdmin' && !isSelf;
  const canDelete     = currentUser.role === 'masterAdmin' && user.role !== 'masterAdmin' && !isSelf;

  function handleSave() {
    if (!username.trim()) { Alert.alert('Required', 'Username cannot be empty.'); return; }
    let newHash: string;
    if (clearPwd) {
      newHash = ''; // explicitly set to empty password
    } else if (password) {
      newHash = hashPassword(password);
    } else {
      newHash = user.passwordHash; // keep existing
    }
    saveUser({
      ...user,
      username: username.trim(),
      passwordHash: newHash,
      role: canChangeRole ? role : user.role,
    });
    onSaved(); close();
  }

  function handleDelete() {
    Alert.alert('Delete user', `Delete "${user.username}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteUser(user.id); onSaved(); close(); } },
    ]);
  }

  
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View style={[ud.drawer, { backgroundColor: colors.card, transform: [{ translateY }] }]}>
        <View style={[ud.handle, { backgroundColor: colors.subtext + '44' }]} />

        <View style={[ud.header, { borderColor: colors.background }]}>
          <View>
            <Text style={[ud.name, { color: colors.text }]}>
              {user.username}{isSelf ? ' (you)' : ''}
            </Text>
            <Text style={[ud.roleText, { color: roleColor(user.role, colors.accent) }]}>
              {roleLabel(user.role)}
            </Text>
          </View>
          {canDelete && (
            <TouchableOpacity style={ud.delBtn} onPress={handleDelete}>
              <Text style={{ fontSize: 18 }}>{I_TRASH}</Text>
            </TouchableOpacity>
          )}
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={ud.body} keyboardShouldPersistTaps="handled">

            <Text style={[ud.fieldLabel, { color: colors.subtext }]}>USERNAME</Text>
            <TextInput
              style={[ud.input, { color: colors.text, borderColor: colors.background, backgroundColor: colors.background }]}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[ud.fieldLabel, { color: colors.subtext }]}>
              {isSelf ? 'CHANGE PASSWORD' : 'NEW PASSWORD'}
            </Text>
            <View style={ud.pwdRow}>
              <TextInput
                style={[ud.input, { flex: 1, color: colors.text, borderColor: colors.background, backgroundColor: colors.background }]}
                value={password}
                onChangeText={t => { setPassword(t); if (t) setClearPwd(false); }}
                placeholder={clearPwd ? 'Will be cleared' : 'Leave empty to keep current'}
                placeholderTextColor={colors.subtext}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!clearPwd}
              />
              <TouchableOpacity
                style={[ud.showBtn, { backgroundColor: colors.background }]}
                onPress={() => setShowPwd(v => !v)}
              >
                <Text style={[ud.showBtnTxt, { color: colors.accent }]}>
                  {showPwd ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[ud.clearPwdRow, { backgroundColor: colors.background, borderColor: clearPwd ? colors.accent : colors.background }]}
              onPress={() => { setClearPwd(v => !v); if (!clearPwd) setPassword(''); }}
              activeOpacity={0.7}
            >
              <View style={[ud.checkbox, {
                borderColor: clearPwd ? colors.accent : colors.subtext,
                backgroundColor: clearPwd ? colors.accent : 'transparent',
              }]}>
                {clearPwd && <Text style={{ color: colors.background, fontSize: 11, fontWeight: '700' }}>✓</Text>}
              </View>
              <Text style={[ud.clearPwdLabel, { color: clearPwd ? colors.accent : colors.subtext }]}>
                Set to empty password (no password)
              </Text>
            </TouchableOpacity>

            {canChangeRole && (
              <>
                <Text style={[ud.fieldLabel, { color: colors.subtext }]}>ROLE</Text>
                <View style={ud.roleRow}>
                  {(['user', 'admin'] as const).map(ro => (
                    <TouchableOpacity key={ro}
                      style={[ud.roleChip, {
                        borderColor: role === ro ? colors.accent : colors.background,
                        backgroundColor: role === ro ? colors.accent + '22' : colors.background,
                      }]}
                      onPress={() => setRole(ro)}
                    >
                      <Text style={{
                        color: role === ro ? colors.accent : colors.subtext,
                        fontWeight: '600', fontSize: 13,
                      }}>
                        {roleLabel(ro)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={[ud.footer, { borderColor: colors.background }]}>
          <TouchableOpacity style={[ud.btn, { borderColor: colors.subtext + '44' }]} onPress={close}>
            <Text style={{ color: colors.subtext }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ud.btn, { backgroundColor: colors.accent, borderColor: colors.accent, flex: 2 }]}
            onPress={handleSave}
          >
            <Text style={{ color: colors.background, fontWeight: '700' }}>Save changes</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}
const ud = StyleSheet.create({
  drawer:       { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  handle:       { width: 36, height: 3, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  name:         { fontSize: 18, fontWeight: '700' },
  roleText:     { fontSize: 12, marginTop: 2, fontWeight: '600' },
  delBtn:       { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: '#2A1515' },
  body:         { padding: 20, gap: 4, paddingBottom: 8 },
  fieldLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  input:        { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  pwdRow:       { flexDirection: 'row', gap: 8, alignItems: 'center' },
  showBtn:      { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  showBtnTxt:   { fontSize: 13, fontWeight: '600' },
  clearPwdRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  checkbox:     { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  clearPwdLabel:{ fontSize: 13, flex: 1 },
  roleRow:      { flexDirection: 'row', gap: 10, marginBottom: 8 },
  roleChip:     { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  footer:       { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  btn:          { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
});

// ─── Guard wrapper ────────────────────────────────────────────────────────────
export default function Settings() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const user = getUserById(userId);

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.subtext }}>User not found.</Text>
      </View>
    );
  }
  return <SettingsInner user={user} />;
}

// ─── Inner ────────────────────────────────────────────────────────────────────
function SettingsInner({ user }: { user: User }) {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { t } = useTranslation();
  const {
    colors, slots, activeSlotIdx,
    setColor, applyPreset, applySlot,
    saveToSlot, deleteSlot, resetToDefault,
  } = useTheme();

  const isMasterAdmin = user.role === 'masterAdmin';
  const isAdmin       = user.role === 'admin' || isMasterAdmin;
  const iconColor     = contrastColor(colors.background);

  const [allUsers,          setAllUsers]          = useState<User[]>([]);
  const [accountDrawerUser, setAccountDrawerUser] = useState<User | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [slotNameInput,     setSlotNameInput]     = useState('');
  const [slotSaveIdx,       setSlotSaveIdx]       = useState<number | null>(null);
  const [hiddenAuthVisible, setHiddenAuthVisible] = useState(false);
  const [hiddenPwd,         setHiddenPwd]         = useState('');
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  // Load icon from persistent storage; '' means no custom icon (use emoji picker)
  const [accountIcon, setAccountIconState] = useState<string>(() => getAccountIcon(user.id));
  // Current language
  const [currentLang, setCurrentLang] = useState<string>(getStoredLanguage);

  // ── Biometric state ───────────────────────────────────────────────────────
  const [bioSheetVisible,   setBioSheetVisible]   = useState(false);
  const [bioHardwareAvail,  setBioHardwareAvail]  = useState(false);
  const [bioType,           setBioType]           = useState<'face' | 'fingerprint' | 'generic'>('generic');
  // Map of userId → whether biometric is enabled
  const [bioUserMap,        setBioUserMap]        = useState<Record<string, boolean>>({});
  // For password confirmation when enabling biometric for an account
  const [bioPwdTarget,      setBioPwdTarget]      = useState<User | null>(null);
  const [bioPwdInput,       setBioPwdInput]       = useState('');
  const [bioPwdVisible,     setBioPwdVisible]     = useState(false);

  // ── Import / Export state ─────────────────────────────────────────────────
  const [transferring, setTransferring] = useState(false);

  const reloadUsers = useCallback(() => setAllUsers(getAllUsers()), []);
  useEffect(() => { reloadUsers(); }, [reloadUsers]);

  // Detect biometric hardware
  useEffect(() => {
    (async () => {
      try {
        const hasHw    = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHw || !enrolled) return;
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBioType('face');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBioType('fingerprint');
        }
        setBioHardwareAvail(true);
      } catch { /* not available */ }
    })();
  }, []);

  // Load current biometric state into map whenever sheet opens or users change
  useEffect(() => {
    if (!bioSheetVisible) return;
    const map: Record<string, boolean> = {};
    getAllUsers().forEach(u => { map[u.id] = isBiometricEnabledForUser(u.id); });
    setBioUserMap(map);
  }, [bioSheetVisible, allUsers]);

  function openAccountDrawer(u: User) {
    setAccountDrawerUser(u);
    setAccountDrawerOpen(true);
  }

  // ── Icon helpers ──────────────────────────────────────────────────────────
  function persistIcon(icon: string) {
    saveAccountIcon(user.id, icon);
    setAccountIconState(icon);
    setIconPickerVisible(false);
  }

  async function pickIconFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('chooseFromGallery'), 'Gallery permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      persistIcon(result.assets[0].uri);
    }
  }

  // ── Language switch ────────────────────────────────────────────────────────
  function changeLanguage(lang: string) {
    i18n.changeLanguage(lang);
    setStoredLanguage(lang);
    setCurrentLang(lang);
  }

  // ── Biometric toggle handler ───────────────────────────────────────────────
  function handleBioToggle(targetUser: User, newValue: boolean) {
    if (!newValue) {
      // Disabling: remove credential + mark disabled
      toggleBiometricForUser(targetUser.id, false);
      deleteBiometricCredential(targetUser.id);
      setBioUserMap(m => ({ ...m, [targetUser.id]: false }));
      return;
    }
    // Enabling: need password to store as credential
    // For no-password accounts, credential is empty string
    if (!targetUser.passwordHash) {
      saveBiometricCredential(targetUser.id, '');
      toggleBiometricForUser(targetUser.id, true);
      setBioUserMap(m => ({ ...m, [targetUser.id]: true }));
      return;
    }
    // Has password — prompt for it
    setBioPwdTarget(targetUser);
    setBioPwdInput('');
  }

  function confirmBioPwd() {
    if (!bioPwdTarget) return;
    if (!verifyPassword(bioPwdInput, bioPwdTarget.passwordHash)) {
      Alert.alert('Wrong password', 'Please enter the correct account password.');
      return;
    }
    saveBiometricCredential(bioPwdTarget.id, bioPwdInput);
    toggleBiometricForUser(bioPwdTarget.id, true);
    setBioUserMap(m => ({ ...m, [bioPwdTarget!.id]: true }));
    setBioPwdTarget(null);
    setBioPwdInput('');
  }

  // ── Hidden vault ──────────────────────────────────────────────────────────
  function handleHiddenAccess() {
    if (!user.passwordHash) {
      router.push({ pathname: '/Home', params: { userId, hiddenMode: '1' } });
      return;
    }
    setHiddenAuthVisible(true);
  }

  function confirmHiddenAccess() {
    if (!verifyPassword(hiddenPwd, user.passwordHash)) {
      Alert.alert('Wrong password', 'Please try again.');
      return;
    }
    setHiddenAuthVisible(false);
    setHiddenPwd('');
    router.push({ pathname: '/Home', params: { userId, hiddenMode: '1' } });
  }

  function promptSaveSlot(index: number, e: any) {
    e?.stopPropagation?.();
    setSlotSaveIdx(index);
    setSlotNameInput(slots[index]?.name ?? `Slot ${index + 1}`);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport(format: 'csv' | 'excel') {
    setTransferring(true);
    try {
      const pwds = getUserById(userId)?.passwords ?? [];
      if (pwds.length === 0) {
        Alert.alert('Nothing to export', 'You have no passwords saved yet.');
        return;
      }
      const ok = format === 'csv'
        ? await exportCsv(pwds)
        : await exportExcel(pwds);
      if (!ok) {
        Alert.alert('Sharing unavailable', 'Your device does not support the share sheet.');
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Unknown error.');
    } finally {
      setTransferring(false);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function handleImport(format: 'csv' | 'excel') {
    setTransferring(true);
    try {
      const result: ImportResult | null = format === 'csv'
        ? await importCsv()
        : await importExcel();

      if (!result) return; // user cancelled the picker

      if (result.imported.length === 0) {
        Alert.alert(
          'Nothing imported',
          result.total === 0
            ? 'The file is empty or has no recognisable header row.'
            : `All ${result.skipped} row(s) were blank and skipped.`,
        );
        return;
      }

      Alert.alert(
        'Confirm import',
        `Import ${result.imported.length} password(s) into your vault?` +
          (result.skipped > 0 ? `\n(${result.skipped} blank row(s) will be skipped)` : ''),
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () => {
              result.imported.forEach(entry => addPasswordToUser(userId, entry));
              Alert.alert(
                'Done',
                `${result.imported.length} password(s) imported successfully.`,
              );
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Unknown error.');
    } finally {
      setTransferring(false);
    }
  }

  // ── Preset chip size: 3 per row with gap ──────────────────────────────────
  const cardPadding = 16;
  const chipGap     = 8;
  const chipsPerRow = 3;
  const cardWidth   = SCREEN_W - 40 - 2;
  const chipWidth   = (cardWidth - cardPadding * 2 - chipGap * (chipsPerRow - 1)) / chipsPerRow;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[s.header, { borderColor: colors.card }]}>
        <TouchableOpacity style={[s.headerBtn, { backgroundColor: colors.card }]} onPress={() => router.back()}>
          <Text style={[s.headerBtnTxt, { color: colors.text }]}>{I_BACK}</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ACCOUNT CARD ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => openAccountDrawer(user)}
          style={[s.accountCard, { backgroundColor: colors.card }]}
        >
          {/* Icon — tap only the icon to change it */}
          <TouchableOpacity
            onPress={e => { e.stopPropagation(); setIconPickerVisible(true); }}
            activeOpacity={0.7}
            style={[s.accountIconWrap, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '55' }]}
          >
            {accountIcon.startsWith('/') || accountIcon.startsWith('file:') || accountIcon.startsWith('content:') || accountIcon.startsWith('ph://') || accountIcon.startsWith('asset-library:') ? (
              <Image
                source={{ uri: accountIcon }}
                style={s.accountIconImage}
                contentFit="cover"
              />
            ) : (
              <Text style={s.accountIconEmoji}>{accountIcon || '👤'}</Text>
            )}
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[s.accountName, { color: colors.text }]}>{user.username}</Text>
            <Text style={[s.accountMeta, { color: colors.subtext }]}>
              {roleLabel(user.role)}  ·  {t('joined')} {new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </Text>
          </View>

          <Text style={[{ fontSize: 18, color: colors.subtext }]}>{I_EDIT}</Text>
        </TouchableOpacity>

        {/* ── APPEARANCE ── */}
        <Section title="Appearance" colors={colors}>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardLabel, { color: colors.subtext }]}>Custom colors</Text>
            <ColorPickerModal label="Accent"     currentColor={colors.accent}     onSelect={v => setColor('accent', v)}     labelColor={colors.accent}  containerColor={colors.card} />
            <ColorPickerModal label="Background" currentColor={colors.background} onSelect={v => setColor('background', v)} labelColor={colors.text}    containerColor={colors.card} />
            <ColorPickerModal label="Card"       currentColor={colors.card}       onSelect={v => setColor('card', v)}       labelColor={colors.text}    containerColor={colors.card} />
            <ColorPickerModal label="Text"       currentColor={colors.text}       onSelect={v => setColor('text', v)}       labelColor={colors.text}    containerColor={colors.card} />
            <ColorPickerModal label="Subtext"    currentColor={colors.subtext}    onSelect={v => setColor('subtext', v)}    labelColor={colors.subtext} containerColor={colors.card} />
            <TouchableOpacity style={[s.resetBtn, { borderColor: colors.subtext }]} onPress={resetToDefault}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>Reset to default</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardLabel, { color: colors.subtext }]}>Preset themes</Text>
            <View style={s.presetGrid}>
              {PRESET_THEMES.map(preset => (
                <TouchableOpacity
                  key={preset.name}
                  style={[s.presetChip, {
                    width: chipWidth,
                    backgroundColor: preset.colors.card,
                    borderColor: preset.colors.accent,
                  }]}
                  onPress={() => applyPreset(preset)}
                  activeOpacity={0.8}
                >
                  <View style={[s.presetDot, { backgroundColor: preset.colors.accent }]} />
                  <Text style={[s.presetName, { color: preset.colors.text }]} numberOfLines={1}>
                    {preset.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardLabel, { color: colors.subtext }]}>Saved slots</Text>
            <View style={s.slotsGrid}>
              {Array.from({ length: 5 }).map((_, i) => {
                const slot     = slots[i];
                const isActive = activeSlotIdx === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.slotCard, {
                      backgroundColor: colors.background,
                      borderColor: isActive ? colors.accent : colors.card,
                      ...(isActive && { backgroundColor: colors.accent + '0D' }),
                    }]}
                    onPress={() => slot && applySlot(i)}
                    activeOpacity={slot ? 0.7 : 1}
                  >
                    <View style={[s.slotDot, { backgroundColor: slot?.colors.accent ?? colors.subtext + '44' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.slotName, { color: slot ? colors.text : colors.subtext }]} numberOfLines={1}>
                        {slot?.name ?? 'Empty'}
                      </Text>
                      {isActive && (
                        <Text style={[s.slotActive, { color: colors.accent }]}>Active</Text>
                      )}
                    </View>
                    <View style={s.slotBtns}>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={e => promptSaveSlot(i, e)}
                      >
                        <Text style={[s.slotAction, { color: colors.subtext }]}>
                          {slot ? I_EDIT : '+'}
                        </Text>
                      </TouchableOpacity>
                      {slot && (
                        <TouchableOpacity
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={e => {
                            e?.stopPropagation?.();
                            Alert.alert('Delete slot', `Delete "${slot.name}"?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteSlot(i) },
                            ]);
                          }}
                        >
                          <Text style={[s.slotAction, { color: '#8B3030' }]}>{I_TRASH}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Section>

        {/* ── VAULT ── */}
        <Section title="Vault" colors={colors}>
          <Row label="Hidden passwords" sub="Access passwords marked as hidden"
            onPress={handleHiddenAccess} colors={colors}
            right={<Text style={{ fontSize: 18, color: iconColor }}>{I_EYE}</Text>} />
        </Section>

        {/* ── BIOMETRIC ACCESS ── (MasterAdmin only) */}
        {isMasterAdmin && (
          <Section title="Biometric access" colors={colors}>
            {!bioHardwareAvail ? (
              <View style={[r.wrap, { backgroundColor: colors.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[r.label, { color: colors.subtext }]}>Not available</Text>
                  <Text style={[r.sub, { color: colors.subtext }]}>
                    No biometric hardware or enrollment found on this device.
                  </Text>
                </View>
              </View>
            ) : (
              <Row
                label={
                  bioType === 'face'        ? 'Face ID / Face unlock'        :
                  bioType === 'fingerprint' ? 'Fingerprint unlock'           :
                                              'Biometric unlock'
                }
                sub="Choose which accounts can log in with biometrics"
                onPress={() => setBioSheetVisible(true)}
                colors={colors}
                right={
                  <View style={bio.iconWrap}>
                    <Text style={bio.iconTxt}>
                      {bioType === 'face' ? '🪪' : bioType === 'fingerprint' ? '☝' : '🔓'}
                    </Text>
                  </View>
                }
              />
            )}
          </Section>
        )}

        {/* ── DATA ── */}
        <Section title="Data" colors={colors}>

          <Text style={[s.subSection, { color: colors.subtext }]}>Import</Text>
          <Text style={[s.dataHint, { color: colors.subtext }]}>
            Expected columns: Site / App · Username · Email · Password · URL · Phone · Notes · Hidden (0/1)
          </Text>
          <View style={s.dataRow}>
            <TouchableOpacity
              style={[s.dataBtn, { backgroundColor: colors.card, opacity: transferring ? 0.45 : 1 }]}
              disabled={transferring}
              onPress={() => handleImport('csv')}
            >
              <Text style={{ fontSize: 20, color: contrastColor(colors.card) }}>{I_IMPORT}</Text>
              <Text style={[s.dataBtnTxt, { color: colors.text }]}>CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.dataBtn, { backgroundColor: colors.card, opacity: transferring ? 0.45 : 1 }]}
              disabled={transferring}
              onPress={() => handleImport('excel')}
            >
              <Text style={{ fontSize: 20, color: contrastColor(colors.card) }}>{I_IMPORT}</Text>
              <Text style={[s.dataBtnTxt, { color: colors.text }]}>Excel</Text>
            </TouchableOpacity>
          </View>

          <Text style={[s.subSection, { color: colors.subtext, marginTop: 16 }]}>Export</Text>
          <View style={s.dataRow}>
            <TouchableOpacity
              style={[s.dataBtn, { backgroundColor: colors.card, opacity: transferring ? 0.45 : 1 }]}
              disabled={transferring}
              onPress={() => handleExport('csv')}
            >
              <Text style={{ fontSize: 20, color: contrastColor(colors.card) }}>{I_EXPORT}</Text>
              <Text style={[s.dataBtnTxt, { color: colors.text }]}>CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.dataBtn, { backgroundColor: colors.card, opacity: transferring ? 0.45 : 1 }]}
              disabled={transferring}
              onPress={() => handleExport('excel')}
            >
              <Text style={{ fontSize: 20, color: contrastColor(colors.card) }}>{I_EXPORT}</Text>
              <Text style={[s.dataBtnTxt, { color: colors.text }]}>Excel</Text>
            </TouchableOpacity>
          </View>

          {transferring && (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 10 }} />
          )}
        </Section>

        {/* ── ACCOUNT MANAGER ── */}
        <Section title="Account manager" colors={colors}>
          {allUsers.map(u => {
            const isSelf  = u.id === userId;
            if (isSelf) return null; // current user is shown in the top account card

            const canSee  = isMasterAdmin || u.role !== 'masterAdmin';
            const canEdit = (isMasterAdmin && u.role !== 'masterAdmin')
              || (isAdmin && u.role === 'user');

            if (!canSee) return null;

            return (
              <TouchableOpacity
                key={u.id}
                style={[s.userRow, { backgroundColor: colors.card }]}
                onPress={() => { if (canEdit) openAccountDrawer(u); }}
                activeOpacity={canEdit ? 0.7 : 1}
              >
                <View style={[s.userAvatar, {
                  borderColor: roleColor(u.role, colors.accent),
                  backgroundColor: colors.background,
                }]}>
                  <Text style={[s.userAvatarTxt, { color: roleColor(u.role, colors.accent) }]}>
                    {u.username.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.userName, { color: colors.text }]}>{u.username}</Text>
                  <Text style={[s.userRole, { color: roleColor(u.role, colors.accent) }]}>
                    {roleLabel(u.role)}
                  </Text>
                </View>
                {canEdit && (
                  <Text style={{ color: contrastColor(colors.card), fontSize: 16 }}>{I_EDIT}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </Section>

        {/* ── STATS ── */}
        <Section title={t('statistics')} colors={colors}>
          <Row label={t('viewStats')} sub={t('viewStatsSub')}
            onPress={() => router.push({ pathname: '/stats', params: { userId } })}
            colors={colors}
            right={<Text style={{ fontSize: 20, color: contrastColor(colors.card) }}>{I_STATS}</Text>} />
        </Section>

        {/* ── LANGUAGE ── */}
        <Section title={t('language')} colors={colors}>
          <View style={[r.wrap, { backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[r.label, { color: colors.text }]}>{t('language')}</Text>
              <Text style={[r.sub, { color: colors.subtext }]}>{t('languageSub')}</Text>
            </View>
            <View style={s.langRow}>
              <TouchableOpacity
                style={[s.langBtn, { backgroundColor: currentLang === 'it' ? colors.accent : colors.background }]}
                onPress={() => changeLanguage('it')}
              >
                <Text style={[s.langBtnTxt, { color: currentLang === 'it' ? colors.background : colors.subtext }]}>ITA</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.langBtn, { backgroundColor: currentLang === 'en' ? colors.accent : colors.background }]}
                onPress={() => changeLanguage('en')}
              >
                <Text style={[s.langBtnTxt, { color: currentLang === 'en' ? colors.background : colors.subtext }]}>ENG</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

      </ScrollView>

      {/* ── Slot save sheet ── */}
      <Modal visible={slotSaveIdx !== null} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => setSlotSaveIdx(null)} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>
            {slots[slotSaveIdx ?? 0] ? 'Update slot' : 'Save current theme'}
          </Text>
          <TextInput
            style={[bs.input, { color: colors.text, borderColor: colors.accent, backgroundColor: colors.background }]}
            value={slotNameInput}
            onChangeText={setSlotNameInput}
            placeholder="Slot name"
            placeholderTextColor={colors.subtext}
            autoFocus
          />
          <View style={bs.btnRow}>
            <TouchableOpacity style={[bs.btn, { borderColor: colors.subtext }]} onPress={() => setSlotSaveIdx(null)}>
              <Text style={{ color: colors.subtext }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bs.btn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => {
                if (slotSaveIdx !== null) {
                  saveToSlot(slotSaveIdx, slotNameInput || `Slot ${slotSaveIdx + 1}`);
                  setSlotSaveIdx(null);
                }
              }}
            >
              <Text style={{ color: colors.background, fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Hidden vault auth sheet ── */}
      <Modal visible={hiddenAuthVisible} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => { setHiddenAuthVisible(false); setHiddenPwd(''); }} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>{I_LOCK}  Hidden vault</Text>
          <Text style={{ color: colors.subtext, fontSize: 13 }}>Enter your password to access hidden passwords.</Text>
          <TextInput
            style={[bs.input, { color: colors.text, borderColor: colors.accent, backgroundColor: colors.background }]}
            value={hiddenPwd}
            onChangeText={setHiddenPwd}
            placeholder="Your password"
            placeholderTextColor={colors.subtext}
            secureTextEntry autoFocus
            onSubmitEditing={confirmHiddenAccess}
          />
          <View style={bs.btnRow}>
            <TouchableOpacity style={[bs.btn, { borderColor: colors.subtext }]} onPress={() => { setHiddenAuthVisible(false); setHiddenPwd(''); }}>
              <Text style={{ color: colors.subtext }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[bs.btn, { backgroundColor: colors.accent, borderColor: colors.accent }]} onPress={confirmHiddenAccess}>
              <Text style={{ color: colors.background, fontWeight: '700' }}>Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Icon picker modal ── */}
      <Modal visible={iconPickerVisible} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => setIconPickerVisible(false)} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>{t('chooseIcon')}</Text>

          {/* Gallery button */}
          <TouchableOpacity
            style={[s.galleryBtn, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '44' }]}
            onPress={pickIconFromGallery}
            activeOpacity={0.8}
          >
            <Text style={s.galleryBtnIcon}>🖼</Text>
            <Text style={[s.galleryBtnTxt, { color: colors.accent }]}>{t('chooseFromGallery')}</Text>
          </TouchableOpacity>

          {/* Emoji grid */}
          <View style={s.iconGrid}>
            {['👤','🔐','🛡','⚡','🌟','🎯','🦁','🐺','🦊','🐻','🌙','☀️','🌈','💎','🔥','❄️','🎮','🚀','🎵','🌿'].map(em => (
              <TouchableOpacity
                key={em}
                style={[s.iconOption, accountIcon === em && { backgroundColor: colors.accent + '33', borderColor: colors.accent }]}
                onPress={() => persistIcon(em)}
              >
                <Text style={{ fontSize: 26 }}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Biometric access sheet ── */}
      <Modal visible={bioSheetVisible} transparent animationType="slide">
        <Pressable style={bs.backdrop} onPress={() => setBioSheetVisible(false)} />
        <View style={[bio.sheet, { backgroundColor: colors.card }]}>
          {/* Handle */}
          <View style={[bio.handle, { backgroundColor: colors.subtext + '44' }]} />

          <Text style={[bio.title, { color: colors.text }]}>
            {bioType === 'face'        ? '🪪  Face ID Access'       :
             bioType === 'fingerprint' ? '☝  Fingerprint Access'   :
                                         '🔓  Biometric Access'}
          </Text>
          <Text style={[bio.subtitle, { color: colors.subtext }]}>
            Toggle which accounts can sign in using biometric authentication.
            Enabling requires the account password to be stored securely on this device.
          </Text>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={bio.list}>
            {getAllUsers().map(u => {
              const isOn = bioUserMap[u.id] ?? false;
              return (
                <View key={u.id} style={[bio.row, { backgroundColor: colors.background }]}>
                  {/* Avatar */}
                  <View style={[bio.avatar, {
                    borderColor: roleColor(u.role, colors.accent),
                    backgroundColor: colors.card,
                  }]}>
                    <Text style={[bio.avatarTxt, { color: roleColor(u.role, colors.accent) }]}>
                      {u.username.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={[bio.rowName, { color: colors.text }]}>
                      {u.username}{u.id === userId ? '  (you)' : ''}
                    </Text>
                    <Text style={[bio.rowRole, { color: roleColor(u.role, colors.accent) }]}>
                      {roleLabel(u.role)}
                    </Text>
                    {!u.passwordHash && (
                      <Text style={[bio.rowHint, { color: colors.subtext }]}>No password — always allowed</Text>
                    )}
                  </View>

                  {/* Toggle */}
                  <Switch
                    value={isOn}
                    onValueChange={val => handleBioToggle(u, val)}
                    trackColor={{ false: colors.subtext + '44', true: colors.accent }}
                    thumbColor={isOn ? colors.background : colors.subtext}
                  />
                </View>
              );
            })}
          </ScrollView>

          <View style={bio.footer}>
            <TouchableOpacity
              style={[bio.doneBtn, { backgroundColor: colors.accent }]}
              onPress={() => setBioSheetVisible(false)}
            >
              <Text style={[bio.doneTxt, { color: colors.background }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Biometric password confirmation ── */}
      <Modal visible={bioPwdTarget !== null} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => { setBioPwdTarget(null); setBioPwdInput(''); }} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>Confirm password</Text>
          <Text style={{ color: colors.subtext, fontSize: 13 }}>
            Enter the password for "{bioPwdTarget?.username}" to enable biometric login for this account.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              style={[bs.input, { flex: 1, color: colors.text, borderColor: colors.accent, backgroundColor: colors.background }]}
              value={bioPwdInput}
              onChangeText={setBioPwdInput}
              placeholder="Account password"
              placeholderTextColor={colors.subtext}
              secureTextEntry={!bioPwdVisible}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={confirmBioPwd}
            />
            <TouchableOpacity
              style={[bio.showBtn, { backgroundColor: colors.background }]}
              onPress={() => setBioPwdVisible(v => !v)}
            >
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
                {bioPwdVisible ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={bs.btnRow}>
            <TouchableOpacity
              style={[bs.btn, { borderColor: colors.subtext }]}
              onPress={() => { setBioPwdTarget(null); setBioPwdInput(''); }}
            >
              <Text style={{ color: colors.subtext }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bs.btn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={confirmBioPwd}
            >
              <Text style={{ color: colors.background, fontWeight: '700' }}>Enable</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Account edit drawer ── */}
      <Modal visible={accountDrawerOpen && accountDrawerUser !== null} transparent animationType="none">
        {accountDrawerUser && (
          <UserEditDrawer
            user={accountDrawerUser}
            currentUser={user}
            colors={colors}
            onClose={() => { setAccountDrawerOpen(false); setAccountDrawerUser(null); }}
            onSaved={reloadUsers}
          />
        )}
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'android' ? 44 : 56, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 4 },
  headerBtn:     { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerBtnTxt:  { fontSize: 18 },
  headerTitle:   { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  scroll:        { padding: 20, paddingBottom: 60 },
  card:          { borderRadius: 16, padding: 16, marginBottom: 10, gap: 10 },
  cardLabel:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  resetBtn:      { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },

  accountCard:   { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 18, marginBottom: 24, gap: 14 },
  accountIconWrap:{ width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  accountIconEmoji:{ fontSize: 28 },
  accountName:   { fontSize: 18, fontWeight: '700' },
  accountMeta:   { fontSize: 12, marginTop: 4 },

  iconGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingTop: 4 },
  iconOption:    { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center' },

  presetGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip:   { borderWidth: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 6 },
  presetDot:    { width: 24, height: 24, borderRadius: 12 },
  presetName:   { fontSize: 11, fontWeight: '700' },

  slotsGrid:    { gap: 8 },
  slotCard:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  slotDot:      { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  slotName:     { fontSize: 13, fontWeight: '600' },
  slotActive:   { fontSize: 10, fontWeight: '600', marginTop: 2 },
  slotBtns:     { flexDirection: 'row', gap: 16, alignItems: 'center' },
  slotAction:   { fontSize: 18 },

  subSection:   { fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.8, textTransform: 'uppercase' },
  dataHint:     { fontSize: 12, lineHeight: 17, marginBottom: 10, fontStyle: 'italic' },
  dataRow:      { flexDirection: 'row', gap: 10 },
  dataBtn:      { flex: 1, borderRadius: 14, padding: 18, alignItems: 'center', gap: 7 },
  dataBtnTxt:   { fontSize: 13, fontWeight: '600' },

  userRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  userAvatar:   { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  userAvatarTxt:{ fontSize: 17, fontWeight: '700' },
  userName:     { fontSize: 15, fontWeight: '600' },
  userRole:     { fontSize: 11, fontWeight: '500', marginTop: 2 },
  youBadge:     { fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },

  langRow:      { flexDirection: 'row', gap: 8 },
  langBtn:      { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  langBtnTxt:   { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  galleryBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12 },
  galleryBtnIcon:{ fontSize: 20 },
  galleryBtnTxt: { fontSize: 14, fontWeight: '600' },

  accountIconImage: { width: 56, height: 56, borderRadius: 28 },
});

// ─── Biometric sheet styles ────────────────────────────────────────────────────
const bio = StyleSheet.create({
  iconWrap:   { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  iconTxt:    { fontSize: 22 },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: 32 },
  handle:     { width: 36, height: 3, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  title:      { fontSize: 18, fontWeight: '700', paddingHorizontal: 24, marginBottom: 6 },
  subtitle:   { fontSize: 13, lineHeight: 19, paddingHorizontal: 24, marginBottom: 16 },
  list:       { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  row:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, gap: 12 },
  avatar:     { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:  { fontSize: 16, fontWeight: '700' },
  rowName:    { fontSize: 15, fontWeight: '600' },
  rowRole:    { fontSize: 11, fontWeight: '500', marginTop: 1 },
  rowHint:    { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  footer:     { paddingHorizontal: 20, paddingTop: 14 },
  doneBtn:    { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  doneTxt:    { fontSize: 15, fontWeight: '700' },
  showBtn:    { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
});