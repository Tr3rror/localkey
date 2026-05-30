/**
 * Settings.tsx — tabbed settings page for LocalKey
 * Tabs: Appearance · Vault · Data · Accounts · About
 */

import i18n from '@/constants/i18n';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Animated, Dimensions, KeyboardAvoidingView,
  Linking, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
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
  verifyPassword,
} from '@/components/Encrypt';
import {
  exportCsv, exportExcel, importCsv, importExcel, type ImportResult,
} from '@/components/FileManipulation';
import { useTheme } from '@/components/ThemeContext';
import { OLED_THEME, PRESET_THEMES, ThemeColors, User } from '@/constants/types';

const { width: SCREEN_W } = Dimensions.get('window');
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScGIJE8Iem3RmMhwAqptlLjwiYNJldu6h4hjdzob1zogWdyvQ/viewform?usp=publish-editor';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isDark(hex: string): boolean {
  try {
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    const lin = (c: number) => c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4;
    return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b) < 0.35;
  } catch { return true; }
}
function contrast(hex: string) { return isDark(hex) ? '#FFFFFF' : '#000000'; }
function isUri(s: string) {
  return s.startsWith('/') || s.startsWith('file:') || s.startsWith('content:')
      || s.startsWith('ph://') || s.startsWith('asset-library:') || s.startsWith('http');
}
function roleLabel(role: User['role']) {
  if (role === 'masterAdmin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  return 'User';
}
function roleColor(role: User['role'], accent: string) {
  if (role === 'masterAdmin') return accent;
  if (role === 'admin') return '#7EB8C8';
  return '#888';
}

// ─── Shared bottom-sheet styles ───────────────────────────────────────────────
const bs = StyleSheet.create({
  backdrop: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'#00000088' },
  card:     { position:'absolute', bottom:0, left:0, right:0, borderTopLeftRadius:22, borderTopRightRadius:22, padding:24, gap:14 },
  title:    { fontSize:17, fontWeight:'700' },
  input:    { borderWidth:1, borderRadius:12, padding:13, fontSize:15 },
  btnRow:   { flexDirection:'row', gap:10 },
  btn:      { flex:1, borderRadius:12, paddingVertical:14, alignItems:'center', borderWidth:1 },
});

// ─── Row component ────────────────────────────────────────────────────────────
function Row({ label, sub, right, onPress, colors }: {
  label: string; sub?: string; right?: React.ReactNode;
  onPress?: () => void; colors: ThemeColors;
}) {
  const inner = (
    <View style={[row.wrap, { backgroundColor: colors.card }]}>
      <View style={{ flex:1 }}>
        <Text style={[row.label, { color: colors.text }]}>{label}</Text>
        {!!sub && <Text style={[row.sub, { color: colors.subtext }]}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <Text style={[row.chevron, { color: colors.subtext }]}>›</Text> : null)}
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.75}>{inner}</TouchableOpacity>;
  return inner;
}
const row = StyleSheet.create({
  wrap:    { flexDirection:'row', alignItems:'center', padding:16, borderRadius:14, marginBottom:10, gap:12 },
  label:   { fontSize:15, fontWeight:'600' },
  sub:     { fontSize:12, marginTop:3, lineHeight:17 },
  chevron: { fontSize:22 },
});

// ─── SectionLabel ─────────────────────────────────────────────────────────────
function SL({ label, color }: { label: string; color: string }) {
  return <Text style={[sl.t, { color }]}>{label}</Text>;
}
const sl = StyleSheet.create({
  t: { fontSize:10, fontWeight:'800', letterSpacing:1.2, textTransform:'uppercase', marginBottom:10, marginTop:6 },
});

// ─── UserEditDrawer ───────────────────────────────────────────────────────────
function UserEditDrawer({ user, currentUser, onClose, onSaved, colors }: {
  user: User; currentUser: User; onClose: () => void; onSaved: () => void; colors: ThemeColors;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [clearPwd, setClearPwd] = useState(false);
  const [role,     setRole]     = useState(user.role);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue:1, useNativeDriver:true, tension:70, friction:12 }).start();
  }, []);

  function close() {
    Animated.timing(anim, { toValue:0, duration:180, useNativeDriver:true }).start(onClose);
  }

  const translateY = anim.interpolate({ inputRange:[0,1], outputRange:[600,0] });
  const isSelf        = user.id === currentUser.id;
  const canChangeRole = currentUser.role === 'masterAdmin' && user.role !== 'masterAdmin' && !isSelf;
  const canDelete     = currentUser.role === 'masterAdmin' && user.role !== 'masterAdmin' && !isSelf;

  function handleSave() {
    if (!username.trim()) { Alert.alert(t('required'), t('usernameRequired')); return; }
    const newHash = clearPwd ? '' : password ? hashPassword(password) : user.passwordHash;
    saveUser({ ...user, username: username.trim(), passwordHash: newHash, role: canChangeRole ? role : user.role });
    onSaved(); close();
  }

  function handleDelete() {
    Alert.alert(t('deleteUser'), t('deleteUserMsg'), [
      { text: t('cancel'), style:'cancel' },
      { text: t('delete'), style:'destructive', onPress: () => { deleteUser(user.id); onSaved(); close(); } },
    ]);
  }

  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View style={[ud.drawer, { backgroundColor: colors.card, transform:[{ translateY }] }]}>
        <View style={[ud.handle, { backgroundColor: colors.subtext+'44' }]} />

        <View style={[ud.head, { borderColor: colors.background }]}>
          <View style={{ flex:1 }}>
            <Text style={[ud.name, { color: colors.text }]}>{user.username}{isSelf ? ' (you)' : ''}</Text>
            <Text style={[ud.roleT, { color: roleColor(user.role, colors.accent) }]}>{roleLabel(user.role)}</Text>
          </View>
          {canDelete && (
            <TouchableOpacity style={ud.delBtn} onPress={handleDelete}>
              <Text style={{ fontSize:18 }}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>

        <KeyboardAvoidingView behavior="padding" style={{ flex:1 }}>
          <ScrollView contentContainerStyle={ud.body} keyboardShouldPersistTaps="handled">
            <Text style={[ud.fLabel, { color: colors.subtext }]}>{t('username').toUpperCase()}</Text>
            <TextInput
              style={[ud.inp, { color: colors.text, borderColor: colors.background, backgroundColor: colors.background }]}
              value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
            />

            <Text style={[ud.fLabel, { color: colors.subtext }]}>
              {(isSelf ? t('changePassword') : t('newPassword')).toUpperCase()}
            </Text>
            <View style={ud.pwdRow}>
              <TextInput
                style={[ud.inp, { flex:1, color: colors.text, borderColor: colors.background, backgroundColor: colors.background }]}
                value={password}
                onChangeText={v => { setPassword(v); if(v) setClearPwd(false); }}
                placeholder={clearPwd ? t('willBeCleared') : t('leaveEmptyKeep')}
                placeholderTextColor={colors.subtext}
                secureTextEntry={!showPwd} autoCapitalize="none" autoCorrect={false} editable={!clearPwd}
              />
              <TouchableOpacity style={[ud.showBtn, { backgroundColor: colors.background }]} onPress={() => setShowPwd(v=>!v)}>
                <Text style={[ud.showT, { color: colors.accent }]}>{showPwd ? t('hide') : t('show')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[ud.clearRow, { backgroundColor: colors.background, borderColor: clearPwd ? colors.accent : colors.background }]}
              onPress={() => { setClearPwd(v=>!v); if(!clearPwd) setPassword(''); }}
            >
              <View style={[ud.checkbox, { borderColor: clearPwd ? colors.accent : colors.subtext, backgroundColor: clearPwd ? colors.accent : 'transparent' }]}>
                {clearPwd && <Text style={{ color: colors.background, fontSize:11, fontWeight:'700' }}>✓</Text>}
              </View>
              <Text style={[ud.clearL, { color: clearPwd ? colors.accent : colors.subtext }]}>{t('setEmptyPassword')}</Text>
            </TouchableOpacity>

            {canChangeRole && (
              <>
                <Text style={[ud.fLabel, { color: colors.subtext }]}>{t('role').toUpperCase()}</Text>
                <View style={ud.roleRow}>
                  {(['user','admin'] as const).map(ro => (
                    <TouchableOpacity key={ro}
                      style={[ud.roleChip, {
                        borderColor: role===ro ? colors.accent : colors.background,
                        backgroundColor: role===ro ? colors.accent+'22' : colors.background,
                      }]}
                      onPress={() => setRole(ro)}
                    >
                      <Text style={{ color: role===ro ? colors.accent : colors.subtext, fontWeight:'600', fontSize:13 }}>
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
          <TouchableOpacity style={[ud.btn, { borderColor: colors.subtext+'44' }]} onPress={close}>
            <Text style={{ color: colors.subtext }}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ud.btn, { backgroundColor: colors.accent, borderColor: colors.accent, flex:2 }]} onPress={handleSave}>
            <Text style={{ color: colors.background, fontWeight:'700' }}>{t('saveChanges')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}
const ud = StyleSheet.create({
  drawer:   { position:'absolute', bottom:0, left:0, right:0, borderTopLeftRadius:22, borderTopRightRadius:22, maxHeight:'90%' },
  handle:   { width:36, height:3, borderRadius:2, alignSelf:'center', marginTop:12, marginBottom:8 },
  head:     { flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingBottom:16, borderBottomWidth:1 },
  name:     { fontSize:18, fontWeight:'700' },
  roleT:    { fontSize:12, marginTop:2, fontWeight:'600' },
  delBtn:   { width:36, height:36, justifyContent:'center', alignItems:'center', borderRadius:8, backgroundColor:'#2A1515' },
  body:     { padding:20, gap:4, paddingBottom:20 },
  fLabel:   { fontSize:10, fontWeight:'700', letterSpacing:0.8, marginBottom:6, marginTop:14 },
  inp:      { borderRadius:12, borderWidth:1, paddingHorizontal:14, paddingVertical:13, fontSize:15 },
  pwdRow:   { flexDirection:'row', gap:8, alignItems:'center' },
  showBtn:  { borderRadius:10, paddingHorizontal:12, paddingVertical:13 },
  showT:    { fontSize:13, fontWeight:'600' },
  clearRow: { flexDirection:'row', alignItems:'center', gap:10, marginTop:8, borderRadius:10, borderWidth:1, paddingHorizontal:12, paddingVertical:11 },
  checkbox: { width:18, height:18, borderRadius:4, borderWidth:1.5, justifyContent:'center', alignItems:'center' },
  clearL:   { fontSize:13, flex:1 },
  roleRow:  { flexDirection:'row', gap:10, marginBottom:8 },
  roleChip: { flex:1, borderWidth:1, borderRadius:10, paddingVertical:12, alignItems:'center' },
  footer:   { flexDirection:'row', gap:10, padding:16, borderTopWidth:1 },
  btn:      { flex:1, borderWidth:1, borderRadius:12, paddingVertical:14, alignItems:'center' },
});

// ─── Guard wrapper ────────────────────────────────────────────────────────────
export default function Settings() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const user = getUserById(userId);
  if (!user) return (
    <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background }}>
      <Text style={{ color: colors.subtext }}>User not found.</Text>
    </View>
  );
  return <SettingsInner user={user} />;
}

// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = 'appearance' | 'vault' | 'data' | 'accounts' | 'about';

// ─── Inner ────────────────────────────────────────────────────────────────────
function SettingsInner({ user }: { user: User }) {
  const router  = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { t }   = useTranslation();
  const {
    colors, slots, activeSlotIdx,
    setColor, applyPreset, applySlot,
    saveToSlot, deleteSlot, resetToDefault,
  } = useTheme();

  const isMasterAdmin = user.role === 'masterAdmin';
  const [activeTab, setActiveTab] = useState<Tab>('appearance');

  // ── Account card state ────────────────────────────────────────────────────
  const [accountIcon,       setAccountIconState] = useState(() => getAccountIcon(user.id));
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [accountDrawerUser, setAccountDrawerUser] = useState<User | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);

  // ── Language ──────────────────────────────────────────────────────────────
  const [currentLang, setCurrentLang] = useState(() => getStoredLanguage() || i18n.language);

  // ── Slot save ─────────────────────────────────────────────────────────────
  const [slotNameInput, setSlotNameInput] = useState('');
  const [slotSaveIdx,   setSlotSaveIdx]   = useState<number | null>(null);

  // ── Hidden vault ──────────────────────────────────────────────────────────
  const [hiddenAuthVisible, setHiddenAuthVisible] = useState(false);
  const [hiddenPwd,         setHiddenPwd]         = useState('');

  // ── Biometric ─────────────────────────────────────────────────────────────
  const [bioSheetVisible,  setBioSheetVisible]  = useState(false);
  const [bioHardwareAvail, setBioHardwareAvail] = useState(false);
  const [bioType,          setBioType]          = useState<'face'|'fingerprint'|'generic'>('generic');
  const [bioUserMap,       setBioUserMap]        = useState<Record<string, boolean>>({});
  const [bioPwdTarget,     setBioPwdTarget]      = useState<User | null>(null);
  const [bioPwdInput,      setBioPwdInput]       = useState('');
  const [bioPwdVisible,    setBioPwdVisible]     = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [transferring, setTransferring] = useState(false);
  const [allUsers,     setAllUsers]     = useState<User[]>([]);
  const reloadUsers = useCallback(() => setAllUsers(getAllUsers()), []);
  useEffect(() => { reloadUsers(); }, [reloadUsers]);

  useEffect(() => {
    (async () => {
      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHw || !enrolled) return;
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBioType('face');
        else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setBioType('fingerprint');
        setBioHardwareAvail(true);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!bioSheetVisible) return;
    const map: Record<string, boolean> = {};
    getAllUsers().forEach(u => { map[u.id] = isBiometricEnabledForUser(u.id); });
    setBioUserMap(map);
  }, [bioSheetVisible, allUsers]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function persistIcon(icon: string) {
    saveAccountIcon(user.id, icon); setAccountIconState(icon); setIconPickerVisible(false);
  }

  async function pickIconFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('chooseFromGallery'), 'Gallery permission required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], allowsEditing:true, aspect:[1,1], quality:0.7 });
    if (!result.canceled && result.assets[0]?.uri) persistIcon(result.assets[0].uri);
  }

  function changeLanguage(lang: string) {
    i18n.changeLanguage(lang); setStoredLanguage(lang); setCurrentLang(lang);
  }

  function handleBioToggle(targetUser: User, newValue: boolean) {
    if (!newValue) {
      toggleBiometricForUser(targetUser.id, false);
      deleteBiometricCredential(targetUser.id);
      setBioUserMap(m => ({ ...m, [targetUser.id]: false }));
      return;
    }
    if (!targetUser.passwordHash) {
      saveBiometricCredential(targetUser.id, '');
      toggleBiometricForUser(targetUser.id, true);
      setBioUserMap(m => ({ ...m, [targetUser.id]: true }));
      return;
    }
    setBioPwdTarget(targetUser); setBioPwdInput('');
  }

  function confirmBioPwd() {
    if (!bioPwdTarget) return;
    if (!verifyPassword(bioPwdInput, bioPwdTarget.passwordHash)) {
      Alert.alert(t('wrongPassword'), 'Please enter the correct account password.'); return;
    }
    saveBiometricCredential(bioPwdTarget.id, bioPwdInput);
    toggleBiometricForUser(bioPwdTarget.id, true);
    setBioUserMap(m => ({ ...m, [bioPwdTarget!.id]: true }));
    setBioPwdTarget(null); setBioPwdInput('');
  }

  function handleHiddenAccess() {
    if (!user.passwordHash) { router.push({ pathname:'/Home', params:{ userId, hiddenMode:'1' } }); return; }
    setHiddenAuthVisible(true);
  }

  function confirmHiddenAccess() {
    if (!verifyPassword(hiddenPwd, user.passwordHash)) { Alert.alert(t('wrongPassword'), t('wrongPasswordMsg')); return; }
    setHiddenAuthVisible(false); setHiddenPwd('');
    router.push({ pathname:'/Home', params:{ userId, hiddenMode:'1' } });
  }

  async function handleExport(format: 'csv'|'excel') {
    setTransferring(true);
    try {
      const pwds = getUserById(userId)?.passwords ?? [];
      if (pwds.length === 0) { Alert.alert(t('nothingToExport'), t('noPasswordsSaved')); return; }
      const ok = format === 'csv' ? await exportCsv(pwds) : await exportExcel(pwds);
      if (!ok) Alert.alert(t('sharingUnavailable'), t('sharingUnavailableMsg'));
    } catch (e: any) { Alert.alert(t('exportFailed'), e?.message ?? ''); }
    finally { setTransferring(false); }
  }

  async function handleImport(format: 'csv'|'excel') {
    setTransferring(true);
    try {
      const result: ImportResult | null = format === 'csv' ? await importCsv() : await importExcel();
      if (!result) return;
      if (result.imported.length === 0) {
        Alert.alert(t('nothingImported'), result.total === 0 ? 'File empty or no header row.' : `All ${result.skipped} row(s) were blank.`);
        return;
      }
      Alert.alert(t('confirmImport'), `Import ${result.imported.length} password(s)?` + (result.skipped > 0 ? `\n(${result.skipped} blank row(s) skipped)` : ''), [
        { text: t('cancel'), style:'cancel' },
        { text: t('import'), onPress: () => {
          result.imported.forEach(entry => addPasswordToUser(userId, entry));
          Alert.alert(t('importSuccess'), `${result.imported.length} password(s) imported.`);
        }},
      ]);
    } catch (e: any) { Alert.alert(t('importFailed'), e?.message ?? ''); }
    finally { setTransferring(false); }
  }

  // ── Preset chip sizing ────────────────────────────────────────────────────
  const chipW = (SCREEN_W - 40 - 32 - 8*3) / 4;
  const darkPresets  = PRESET_THEMES.filter(p => isDark(p.colors.background));
  const lightPresets = PRESET_THEMES.filter(p => !isDark(p.colors.background));

  // ── Tab content renderers ─────────────────────────────────────────────────
  function renderAppearance() {
    return (
      <ScrollView contentContainerStyle={pg.scroll} showsVerticalScrollIndicator={false}>

        {/* Account card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { setAccountDrawerUser(user); setAccountDrawerOpen(true); }}
          style={[pg.accountCard, { backgroundColor: colors.card }]}
        >
          <TouchableOpacity
            onPress={e => { e.stopPropagation(); setIconPickerVisible(true); }}
            style={[pg.iconWrap, { backgroundColor: colors.accent+'22', borderColor: colors.accent+'55' }]}
          >
            {isUri(accountIcon) ? (
              <Image source={{ uri: accountIcon }} style={pg.iconImg} contentFit="cover" />
            ) : (
              <Text style={pg.iconEmoji}>{accountIcon || '👤'}</Text>
            )}
          </TouchableOpacity>
          <View style={{ flex:1 }}>
            <Text style={[pg.accountName, { color: colors.text }]}>{user.username}</Text>
            <Text style={[pg.accountMeta, { color: colors.subtext }]}>
              {roleLabel(user.role)}  ·  {t('joined')} {new Date(user.createdAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}
            </Text>
          </View>
          <Text style={{ fontSize:16, color: colors.subtext }}>✏</Text>
        </TouchableOpacity>

        {/* Custom colors */}
        <SL label={t('customColors')} color={colors.accent} />
        <View style={[pg.card, { backgroundColor: colors.card }]}>
          <ColorPickerModal label={t('accent')}     currentColor={colors.accent}     onSelect={v=>setColor('accent',v)}     labelColor={colors.accent}  containerColor={colors.card} />
          <ColorPickerModal label={t('background')} currentColor={colors.background} onSelect={v=>setColor('background',v)} labelColor={colors.text}    containerColor={colors.card} />
          <ColorPickerModal label={t('card')}       currentColor={colors.card}       onSelect={v=>setColor('card',v)}       labelColor={colors.text}    containerColor={colors.card} />
          <ColorPickerModal label={t('text')}       currentColor={colors.text}       onSelect={v=>setColor('text',v)}       labelColor={colors.text}    containerColor={colors.card} />
          <ColorPickerModal label={t('subtext')}    currentColor={colors.subtext}    onSelect={v=>setColor('subtext',v)}    labelColor={colors.subtext} containerColor={colors.card} />
          <TouchableOpacity style={[pg.resetBtn, { borderColor: colors.subtext+'88' }]} onPress={resetToDefault}>
            <Text style={{ color: colors.subtext, fontSize:13 }}>↺  {t('resetToDefault')}</Text>
          </TouchableOpacity>
        </View>

        {/* OLED Black */}
        <SL label={t('oledBlack')} color={colors.accent} />
        <TouchableOpacity
          style={[pg.oledBtn, { backgroundColor: colors.card, borderColor: colors.accent+'44' }]}
          onPress={() => applyPreset({ name:'OLED', colors: OLED_THEME })}
          activeOpacity={0.8}
        >
          <View style={[pg.oledDot, { backgroundColor: '#000000', borderColor: '#555' }]} />
          <View style={{ flex:1 }}>
            <Text style={[pg.oledLabel, { color: colors.text }]}>{t('oledBlack')}</Text>
            <Text style={[pg.oledSub, { color: colors.subtext }]}>{t('oledBlackSub')}</Text>
          </View>
          <View style={[pg.oledPreview, { backgroundColor:'#000000', borderColor:'#333' }]}>
            <View style={[pg.oledPreviewAccent, { backgroundColor:'#C8A97E' }]} />
          </View>
        </TouchableOpacity>

        {/* Preset themes — dark row */}
        <SL label={t('darkThemes')} color={colors.accent} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pg.presetRow}>
          {darkPresets.map(preset => (
            <TouchableOpacity
              key={preset.name}
              style={[pg.presetChip, { width: chipW+16, backgroundColor: preset.colors.card, borderColor: preset.colors.accent }]}
              onPress={() => applyPreset(preset)}
            >
              <View style={[pg.presetDot, { backgroundColor: preset.colors.accent }]} />
              <Text style={[pg.presetName, { color: preset.colors.text }]} numberOfLines={1}>{preset.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Preset themes — light row */}
        <SL label={t('lightThemes')} color={colors.accent} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pg.presetRow}>
          {lightPresets.map(preset => (
            <TouchableOpacity
              key={preset.name}
              style={[pg.presetChip, { width: chipW+16, backgroundColor: preset.colors.card, borderColor: preset.colors.accent }]}
              onPress={() => applyPreset(preset)}
            >
              <View style={[pg.presetDot, { backgroundColor: preset.colors.accent }]} />
              <Text style={[pg.presetName, { color: preset.colors.text }]} numberOfLines={1}>{preset.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Saved slots */}
        <SL label={t('savedSlots')} color={colors.accent} />
        <View style={[pg.card, { backgroundColor: colors.card }]}>
          {Array.from({ length:5 }).map((_,i) => {
            const slot = slots[i];
            const isActive = activeSlotIdx === i;
            return (
              <TouchableOpacity
                key={i}
                style={[pg.slotRow, { borderColor: isActive ? colors.accent : colors.background, backgroundColor: isActive ? colors.accent+'0D' : colors.background }]}
                onPress={() => slot && applySlot(i)}
                activeOpacity={slot ? 0.7 : 1}
              >
                <View style={[pg.slotDot, { backgroundColor: slot?.colors.accent ?? colors.subtext+'44' }]} />
                <View style={{ flex:1 }}>
                  <Text style={[pg.slotName, { color: slot ? colors.text : colors.subtext }]} numberOfLines={1}>
                    {slot?.name ?? t('empty')}
                  </Text>
                  {isActive && <Text style={[pg.slotActive, { color: colors.accent }]}>{t('active')}</Text>}
                </View>
                <View style={{ flexDirection:'row', gap:18 }}>
                  <TouchableOpacity hitSlop={{ top:8,bottom:8,left:8,right:8 }} onPress={e => { e.stopPropagation(); setSlotSaveIdx(i); setSlotNameInput(slot?.name ?? `Slot ${i+1}`); }}>
                    <Text style={{ fontSize:16, color: colors.subtext }}>{slot ? '✏' : '+'}</Text>
                  </TouchableOpacity>
                  {slot && (
                    <TouchableOpacity hitSlop={{ top:8,bottom:8,left:8,right:8 }} onPress={e => { e.stopPropagation(); Alert.alert(t('deleteSlot'), t('deleteSlotMsg'), [{ text:t('cancel'), style:'cancel' },{ text:t('delete'), style:'destructive', onPress:()=>deleteSlot(i) }]); }}>
                      <Text style={{ fontSize:16, color:'#C84F4F' }}>🗑</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Language */}
        <SL label={t('language')} color={colors.accent} />
        <View style={[pg.card, { backgroundColor: colors.card }]}>
          <View style={{ flexDirection:'row', alignItems:'center' }}>
            <View style={{ flex:1 }}>
              <Text style={[row.label, { color: colors.text }]}>{t('language')}</Text>
              <Text style={[row.sub, { color: colors.subtext }]}>{t('languageSub')}</Text>
            </View>
            <View style={pg.langRow}>
              {(['it','en'] as const).map(lang => (
                <TouchableOpacity
                  key={lang}
                  style={[pg.langBtn, { backgroundColor: currentLang === lang ? colors.accent : colors.background }]}
                  onPress={() => changeLanguage(lang)}
                >
                  <Text style={[pg.langBtnTxt, { color: currentLang === lang ? colors.background : colors.subtext }]}>
                    {lang === 'it' ? 'ITA' : 'ENG'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

      </ScrollView>
    );
  }

  function renderVault() {
    return (
      <ScrollView contentContainerStyle={pg.scroll} showsVerticalScrollIndicator={false}>
        <SL label={t('vault')} color={colors.accent} />
        <Row label={t('hiddenPasswords')} sub={t('hiddenPasswordsSub')} onPress={handleHiddenAccess} colors={colors}
          right={<Text style={{ fontSize:20, color: contrast(colors.card) }}>👁</Text>} />

        {isMasterAdmin && (
          <>
            <SL label={t('biometricAccess')} color={colors.accent} />
            {!bioHardwareAvail ? (
              <View style={[row.wrap, { backgroundColor: colors.card }]}>
                <View style={{ flex:1 }}>
                  <Text style={[row.label, { color: colors.subtext }]}>{t('biometricNotAvail')}</Text>
                  <Text style={[row.sub, { color: colors.subtext }]}>{t('biometricNotAvailSub')}</Text>
                </View>
              </View>
            ) : (
              <Row
                label={bioType==='face' ? t('faceIdAccess') : bioType==='fingerprint' ? t('fingerprintAccess') : t('biometricUnlock')}
                sub={t('biometricSub')} onPress={() => setBioSheetVisible(true)} colors={colors}
                right={<Text style={{ fontSize:22 }}>{bioType==='face' ? '🪪' : bioType==='fingerprint' ? '☝' : '🔓'}</Text>}
              />
            )}
          </>
        )}
      </ScrollView>
    );
  }

  function renderData() {
    return (
      <ScrollView contentContainerStyle={pg.scroll} showsVerticalScrollIndicator={false}>
        <SL label={t('import')} color={colors.accent} />
        <Text style={[pg.hint, { color: colors.subtext }]}>{t('importHint')}</Text>
        <View style={pg.dataRow}>
          {(['csv','excel'] as const).map(fmt => (
            <TouchableOpacity key={fmt}
              style={[pg.dataBtn, { backgroundColor: colors.card, opacity: transferring ? 0.4 : 1 }]}
              disabled={transferring} onPress={() => handleImport(fmt)}
            >
              <Text style={{ fontSize:22 }}>↓</Text>
              <Text style={[pg.dataBtnTxt, { color: colors.text }]}>{fmt.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SL label={t('export')} color={colors.accent} />
        <View style={pg.dataRow}>
          {(['csv','excel'] as const).map(fmt => (
            <TouchableOpacity key={fmt}
              style={[pg.dataBtn, { backgroundColor: colors.card, opacity: transferring ? 0.4 : 1 }]}
              disabled={transferring} onPress={() => handleExport(fmt)}
            >
              <Text style={{ fontSize:22 }}>↑</Text>
              <Text style={[pg.dataBtnTxt, { color: colors.text }]}>{fmt.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderAccounts() {
    return (
      <ScrollView contentContainerStyle={pg.scroll} showsVerticalScrollIndicator={false}>
        <SL label={t('accountManager')} color={colors.accent} />
        {allUsers.map(u => {
          const isSelf  = u.id === userId;
          if (isSelf) return null;
          const canSee  = isMasterAdmin || u.role !== 'masterAdmin';
          const canEdit = (isMasterAdmin && u.role !== 'masterAdmin') || (user.role === 'admin' && u.role === 'user');
          if (!canSee) return null;
          return (
            <TouchableOpacity key={u.id}
              style={[pg.userRow, { backgroundColor: colors.card }]}
              onPress={() => { if(canEdit){ setAccountDrawerUser(u); setAccountDrawerOpen(true); } }}
              activeOpacity={canEdit ? 0.7 : 1}
            >
              <View style={[pg.userAvatar, { borderColor: roleColor(u.role, colors.accent), backgroundColor: colors.background }]}>
                <Text style={[pg.userAvatarTxt, { color: roleColor(u.role, colors.accent) }]}>
                  {u.username.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={[pg.userName, { color: colors.text }]}>{u.username}</Text>
                <Text style={[pg.userRole, { color: roleColor(u.role, colors.accent) }]}>{roleLabel(u.role)}</Text>
              </View>
              {canEdit && <Text style={{ color: colors.subtext, fontSize:18 }}>✏</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  function renderAbout() {
    return (
      <ScrollView contentContainerStyle={pg.scroll} showsVerticalScrollIndicator={false}>
        <SL label={t('statistics')} color={colors.accent} />
        <Row label={t('viewStats')} sub={t('viewStatsSub')}
          onPress={() => router.push({ pathname:'/stats', params:{ userId } })}
          colors={colors} right={<Text style={{ fontSize:22 }}>◈</Text>} />

        <SL label={t('bugReport')} color={colors.accent} />
        <TouchableOpacity
          style={[pg.feedbackCard, { backgroundColor: colors.card, borderColor: colors.accent+'33' }]}
          onPress={() => Linking.openURL(FEEDBACK_URL)}
          activeOpacity={0.8}
        >
          <Text style={pg.feedbackIcon}>📝</Text>
          <View style={{ flex:1 }}>
            <Text style={[pg.feedbackLabel, { color: colors.text }]}>{t('bugReport')}</Text>
            <Text style={[pg.feedbackSub, { color: colors.subtext }]}>{t('bugReportSub')}</Text>
          </View>
          <Text style={{ color: colors.subtext, fontSize:18 }}>›</Text>
        </TouchableOpacity>

        <SL label={t('aboutApp')} color={colors.accent} />
        <View style={[pg.card, { backgroundColor: colors.card, gap:0 }]}>
          <View style={pg.aboutRow}>
            <Text style={[pg.aboutKey, { color: colors.subtext }]}>{t('aboutVersion')}</Text>
            <Text style={[pg.aboutVal, { color: colors.text }]}>1.0.0</Text>
          </View>
          <View style={[pg.aboutRow, { borderTopWidth:1, borderTopColor: colors.background }]}>
            <Text style={[pg.aboutKey, { color: colors.subtext }]}>Developer</Text>
            <Text style={[pg.aboutVal, { color: colors.text }]}>tr3rr0r</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Tab definitions ───────────────────────────────────────────────────────
  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key:'appearance', icon:'🎨', label: t('tabAppearance') },
    { key:'vault',      icon:'🔐', label: t('tabVault')      },
    { key:'data',       icon:'↕',  label: t('tabData')       },
    { key:'accounts',   icon:'👥', label: t('tabAccounts')   },
    { key:'about',      icon:'◈',  label: t('tabAbout')      },
  ];

  return (
    <View style={[pg.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[pg.header, { borderColor: colors.card }]}>
        <TouchableOpacity style={[pg.backBtn, { backgroundColor: colors.card }]} onPress={() => router.back()}>
          <Text style={[pg.backTxt, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[pg.headerTitle, { color: colors.text }]}>{t('settings')}</Text>
        <View style={pg.backBtn} />
      </View>

      {/* ── Tab bar ── */}
      <View style={[pg.tabBar, { backgroundColor: colors.card, borderColor: colors.background }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[pg.tab, active && { backgroundColor: colors.accent+'22', borderRadius:12 }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[pg.tabIcon, { opacity: active ? 1 : 0.45 }]}>{tab.icon}</Text>
              <Text style={[pg.tabLabel, { color: active ? colors.accent : colors.subtext, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content ── */}
      <View style={{ flex:1 }}>
        {activeTab === 'appearance' && renderAppearance()}
        {activeTab === 'vault'      && renderVault()}
        {activeTab === 'data'       && renderData()}
        {activeTab === 'accounts'   && renderAccounts()}
        {activeTab === 'about'      && renderAbout()}
      </View>

      {/* ── Modals ── */}

      {/* Slot save */}
      <Modal visible={slotSaveIdx !== null} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => setSlotSaveIdx(null)} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>{slots[slotSaveIdx??0] ? t('updateSlot') : t('saveCurrentTheme')}</Text>
          <TextInput
            style={[bs.input, { color: colors.text, borderColor: colors.accent, backgroundColor: colors.background }]}
            value={slotNameInput} onChangeText={setSlotNameInput}
            placeholder={t('slotName')} placeholderTextColor={colors.subtext} autoFocus
          />
          <View style={bs.btnRow}>
            <TouchableOpacity style={[bs.btn, { borderColor: colors.subtext }]} onPress={() => setSlotSaveIdx(null)}>
              <Text style={{ color: colors.subtext }}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[bs.btn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => { if(slotSaveIdx!==null){ saveToSlot(slotSaveIdx, slotNameInput||`Slot ${slotSaveIdx+1}`); setSlotSaveIdx(null); } }}>
              <Text style={{ color: colors.background, fontWeight:'700' }}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Hidden vault auth */}
      <Modal visible={hiddenAuthVisible} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => { setHiddenAuthVisible(false); setHiddenPwd(''); }} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>{t('hiddenVault')}</Text>
          <Text style={{ color: colors.subtext, fontSize:13 }}>{t('hiddenVaultPrompt')}</Text>
          <TextInput
            style={[bs.input, { color: colors.text, borderColor: colors.accent, backgroundColor: colors.background }]}
            value={hiddenPwd} onChangeText={setHiddenPwd}
            placeholder={t('yourPassword')} placeholderTextColor={colors.subtext}
            secureTextEntry autoFocus onSubmitEditing={confirmHiddenAccess}
          />
          <View style={bs.btnRow}>
            <TouchableOpacity style={[bs.btn, { borderColor: colors.subtext }]} onPress={() => { setHiddenAuthVisible(false); setHiddenPwd(''); }}>
              <Text style={{ color: colors.subtext }}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[bs.btn, { backgroundColor: colors.accent, borderColor: colors.accent }]} onPress={confirmHiddenAccess}>
              <Text style={{ color: colors.background, fontWeight:'700' }}>{t('unlock')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Icon picker */}
      <Modal visible={iconPickerVisible} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => setIconPickerVisible(false)} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>{t('chooseIcon')}</Text>
          <TouchableOpacity style={[pg.galleryBtn, { backgroundColor: colors.accent+'18', borderColor: colors.accent+'44' }]} onPress={pickIconFromGallery}>
            <Text>🖼</Text>
            <Text style={[pg.galleryTxt, { color: colors.accent }]}>{t('chooseFromGallery')}</Text>
          </TouchableOpacity>
          <View style={pg.emojiGrid}>
            {['👤','🔐','🛡','⚡','🌟','🎯','🦁','🐺','🦊','🐻','🌙','☀️','🌈','💎','🔥','❄️','🎮','🚀','🎵','🌿'].map(em => (
              <TouchableOpacity key={em}
                style={[pg.emojiBtn, accountIcon===em && { backgroundColor: colors.accent+'33', borderColor: colors.accent }]}
                onPress={() => persistIcon(em)}
              >
                <Text style={{ fontSize:26 }}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Biometric sheet */}
      <Modal visible={bioSheetVisible} transparent animationType="slide">
        <Pressable style={bs.backdrop} onPress={() => setBioSheetVisible(false)} />
        <View style={[pg.bioSheet, { backgroundColor: colors.card }]}>
          <View style={[pg.bioHandle, { backgroundColor: colors.subtext+'44' }]} />
          <Text style={[pg.bioTitle, { color: colors.text }]}>
            {bioType==='face' ? t('faceIdAccess') : bioType==='fingerprint' ? t('fingerprintAccess') : t('biometricUnlock')}
          </Text>
          <Text style={[pg.bioSub, { color: colors.subtext }]}>{t('biometricSub')}</Text>
          <ScrollView style={{ flex:1 }} contentContainerStyle={pg.bioList}>
            {getAllUsers().map(u => {
              const isOn = bioUserMap[u.id] ?? false;
              return (
                <View key={u.id} style={[pg.bioRow, { backgroundColor: colors.background }]}>
                  <View style={[pg.bioAvatar, { borderColor: roleColor(u.role, colors.accent), backgroundColor: colors.card }]}>
                    <Text style={[pg.bioAvatarTxt, { color: roleColor(u.role, colors.accent) }]}>{u.username.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={[pg.bioName, { color: colors.text }]}>{u.username}{u.id===userId?'  (you)':''}</Text>
                    <Text style={[pg.bioRole, { color: roleColor(u.role, colors.accent) }]}>{roleLabel(u.role)}</Text>
                  </View>
                  <Switch value={isOn} onValueChange={val=>handleBioToggle(u,val)}
                    trackColor={{ false: colors.subtext+'44', true: colors.accent }}
                    thumbColor={isOn ? colors.background : colors.subtext} />
                </View>
              );
            })}
          </ScrollView>
          <View style={pg.bioDone}>
            <TouchableOpacity style={[pg.bioDoneBtn, { backgroundColor: colors.accent }]} onPress={() => setBioSheetVisible(false)}>
              <Text style={[pg.bioDoneTxt, { color: colors.background }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Biometric password confirm */}
      <Modal visible={bioPwdTarget !== null} transparent animationType="fade">
        <Pressable style={bs.backdrop} onPress={() => { setBioPwdTarget(null); setBioPwdInput(''); }} />
        <View style={[bs.card, { backgroundColor: colors.card }]}>
          <Text style={[bs.title, { color: colors.text }]}>{t('confirmPassword')}</Text>
          <Text style={{ color: colors.subtext, fontSize:13 }}>{t('confirmBioPrompt')}</Text>
          <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
            <TextInput
              style={[bs.input, { flex:1, color: colors.text, borderColor: colors.accent, backgroundColor: colors.background }]}
              value={bioPwdInput} onChangeText={setBioPwdInput}
              placeholder={t('accountPassword')} placeholderTextColor={colors.subtext}
              secureTextEntry={!bioPwdVisible} autoFocus autoCapitalize="none" autoCorrect={false}
              onSubmitEditing={confirmBioPwd}
            />
            <TouchableOpacity style={[pg.showBtn, { backgroundColor: colors.background }]} onPress={() => setBioPwdVisible(v=>!v)}>
              <Text style={{ color: colors.accent, fontSize:13, fontWeight:'600' }}>{bioPwdVisible ? t('hide') : t('show')}</Text>
            </TouchableOpacity>
          </View>
          <View style={bs.btnRow}>
            <TouchableOpacity style={[bs.btn, { borderColor: colors.subtext }]} onPress={() => { setBioPwdTarget(null); setBioPwdInput(''); }}>
              <Text style={{ color: colors.subtext }}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[bs.btn, { backgroundColor: colors.accent, borderColor: colors.accent }]} onPress={confirmBioPwd}>
              <Text style={{ color: colors.background, fontWeight:'700' }}>{t('enable')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* User edit drawer */}
      <Modal visible={accountDrawerOpen && accountDrawerUser !== null} transparent animationType="none">
        {accountDrawerUser && (
          <UserEditDrawer
            user={accountDrawerUser} currentUser={user} colors={colors}
            onClose={() => { setAccountDrawerOpen(false); setAccountDrawerUser(null); }}
            onSaved={reloadUsers}
          />
        )}
      </Modal>
    </View>
  );
}

// ─── Page styles ──────────────────────────────────────────────────────────────
const pg = StyleSheet.create({
  root:         { flex:1 },
  header:       { flexDirection:'row', alignItems:'center', paddingTop: Platform.OS==='android' ? 44 : 56, paddingHorizontal:16, paddingBottom:14, borderBottomWidth:1, gap:4 },
  backBtn:      { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center' },
  backTxt:      { fontSize:18 },
  headerTitle:  { flex:1, textAlign:'center', fontSize:16, fontWeight:'700' },

  tabBar:       { flexDirection:'row', margin:12, borderRadius:16, padding:6, gap:2, borderWidth:1 },
  tab:          { flex:1, alignItems:'center', paddingVertical:8, gap:3 },
  tabIcon:      { fontSize:16 },
  tabLabel:     { fontSize:9, letterSpacing:0.2, textAlign:'center' },

  scroll:       { padding:20, paddingBottom:60 },
  card:         { borderRadius:16, padding:16, marginBottom:10, gap:12 },

  accountCard:  { flexDirection:'row', alignItems:'center', borderRadius:18, padding:16, marginBottom:20, gap:14 },
  iconWrap:     { width:58, height:58, borderRadius:29, borderWidth:1.5, justifyContent:'center', alignItems:'center', overflow:'hidden' },
  iconImg:      { width:58, height:58, borderRadius:29 },
  iconEmoji:    { fontSize:28 },
  accountName:  { fontSize:17, fontWeight:'700' },
  accountMeta:  { fontSize:12, marginTop:3 },

  resetBtn:     { alignSelf:'flex-start', borderWidth:1, borderRadius:10, paddingHorizontal:14, paddingVertical:8 },

  oledBtn:      { flexDirection:'row', alignItems:'center', borderRadius:14, borderWidth:1, padding:14, marginBottom:10, gap:12 },
  oledDot:      { width:36, height:36, borderRadius:10, borderWidth:1 },
  oledLabel:    { fontSize:15, fontWeight:'700' },
  oledSub:      { fontSize:12, marginTop:2 },
  oledPreview:  { width:36, height:36, borderRadius:10, borderWidth:1, justifyContent:'flex-end', alignItems:'flex-start', padding:4 },
  oledPreviewAccent: { width:16, height:3, borderRadius:2 },

  presetRow:    { paddingLeft:0, paddingRight:4, paddingBottom:14, gap:8 },
  presetChip:   { borderWidth:1.5, borderRadius:14, paddingVertical:14, alignItems:'center', gap:6 },
  presetDot:    { width:22, height:22, borderRadius:8 },
  presetName:   { fontSize:11, fontWeight:'700' },

  slotRow:      { flexDirection:'row', alignItems:'center', borderRadius:12, borderWidth:1, padding:14, marginBottom:8, gap:12 },
  slotDot:      { width:14, height:14, borderRadius:5, flexShrink:0 },
  slotName:     { fontSize:13, fontWeight:'600' },
  slotActive:   { fontSize:10, fontWeight:'600', marginTop:2 },

  langRow:      { flexDirection:'row', gap:8 },
  langBtn:      { borderRadius:10, paddingHorizontal:14, paddingVertical:9 },
  langBtnTxt:   { fontSize:12, fontWeight:'800' },

  hint:         { fontSize:12, lineHeight:17, marginBottom:10, fontStyle:'italic' },
  dataRow:      { flexDirection:'row', gap:10, marginBottom:20 },
  dataBtn:      { flex:1, borderRadius:14, padding:18, alignItems:'center', gap:7 },
  dataBtnTxt:   { fontSize:13, fontWeight:'600' },

  userRow:      { flexDirection:'row', alignItems:'center', borderRadius:14, padding:14, marginBottom:8, gap:12 },
  userAvatar:   { width:44, height:44, borderRadius:14, borderWidth:1.5, justifyContent:'center', alignItems:'center' },
  userAvatarTxt:{ fontSize:17, fontWeight:'700' },
  userName:     { fontSize:15, fontWeight:'600' },
  userRole:     { fontSize:11, fontWeight:'500', marginTop:2 },

  feedbackCard: { flexDirection:'row', alignItems:'center', borderRadius:14, borderWidth:1, padding:16, marginBottom:10, gap:12 },
  feedbackIcon: { fontSize:24 },
  feedbackLabel:{ fontSize:15, fontWeight:'600' },
  feedbackSub:  { fontSize:12, marginTop:3 },
  aboutRow:     { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:12, paddingHorizontal:4 },
  aboutKey:     { fontSize:13 },
  aboutVal:     { fontSize:13, fontWeight:'600' },

  galleryBtn:   { flexDirection:'row', alignItems:'center', gap:10, borderWidth:1, borderRadius:12, padding:14 },
  galleryTxt:   { fontSize:14, fontWeight:'600' },
  emojiGrid:    { flexDirection:'row', flexWrap:'wrap', gap:8, justifyContent:'center', paddingTop:4 },
  emojiBtn:     { width:48, height:48, borderRadius:12, borderWidth:1.5, borderColor:'transparent', justifyContent:'center', alignItems:'center' },

  bioSheet:     { position:'absolute', bottom:0, left:0, right:0, borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'80%', paddingBottom:32 },
  bioHandle:    { width:36, height:3, borderRadius:2, alignSelf:'center', marginTop:12, marginBottom:16 },
  bioTitle:     { fontSize:18, fontWeight:'700', paddingHorizontal:24, marginBottom:6 },
  bioSub:       { fontSize:13, lineHeight:19, paddingHorizontal:24, marginBottom:16, color:'#888' },
  bioList:      { paddingHorizontal:16, gap:8, paddingBottom:8 },
  bioRow:       { flexDirection:'row', alignItems:'center', borderRadius:12, padding:14, gap:12 },
  bioAvatar:    { width:40, height:40, borderRadius:14, borderWidth:1.5, justifyContent:'center', alignItems:'center' },
  bioAvatarTxt: { fontSize:16, fontWeight:'700' },
  bioName:      { fontSize:15, fontWeight:'600' },
  bioRole:      { fontSize:11, fontWeight:'500', marginTop:1 },
  bioDone:      { paddingHorizontal:20, paddingTop:14 },
  bioDoneBtn:   { borderRadius:12, paddingVertical:15, alignItems:'center' },
  bioDoneTxt:   { fontSize:15, fontWeight:'700' },

  showBtn:      { borderRadius:10, paddingHorizontal:12, paddingVertical:12 },
});