import Clipboard from '@react-native-clipboard/clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Animated, Dimensions, FlatList, KeyboardAvoidingView,
  Modal, PanResponder, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

// ─── Haptic helper ────────────────────────────────────────────────────────────
async function haptic(type: 'light' | 'medium' | 'success' | 'error') {
  try {
    const Haptics = await import('expo-haptics');
    if (type === 'light')   await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'medium')  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (type === 'success') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (type === 'error')   await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch { /* not available */ }
}

import {
  addPasswordToUser, deletePasswordEntry,
  getUserById, updatePasswordEntry,
} from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { Password } from '@/constants/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const { height: SCREEN_H } = Dimensions.get('window');

// Drawer is a fixed-height bottom sheet.
// DRAWER_SNAP_* are the sheet heights (not translateY offsets).
const DRAWER_SNAP_MID  = SCREEN_H * 0.60;
const DRAWER_SNAP_MAX  = SCREEN_H * 0.93;
const DRAWER_SNAP_CLOSE_VY = 0.8;

const ALPHABET      = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const LETTER_ITEM_H = 22;

type SearchField = 'all' | 'label' | 'username' | 'email' | 'password' | 'url' | 'notes';
const SEARCH_FIELDS: { key: SearchField; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'label', label: 'Site' },
  { key: 'username', label: 'User' }, { key: 'email', label: 'Email' },
  { key: 'password', label: 'Pass' }, { key: 'url', label: 'URL' },
  { key: 'notes', label: 'Notes' },
];

const I_BACK = '←'; const I_SETTINGS = '≡'; const I_SEARCH = '🔍';
const I_CLOSE = '✕'; const I_TRASH = '🗑'; const I_COPY = '⎘';
const I_EYE = '👁'; const I_EYEOFF = '🙈'; const I_EDIT = '✏';
const I_COLLAPSE = '⌄'; const I_PLUS = '+'; const I_CHEVRON = '›';

function emptyEntry(): Omit<Password, 'id' | 'createdAt' | 'updatedAt'> {
  return { label: '', username: '', email: '', password: '', url: '', notes: '', isHidden: false };
}

function copyField(value: string, _label: string, onCopied?: () => void) {
  if (!value) return;
  Clipboard.setString(value);
  haptic('light');
  onCopied?.();
}

// ─── DrawerField ──────────────────────────────────────────────────────────────
function DrawerField({
  label, value, secureDefault = false, editable = false,
  onChangeText, placeholder, multiline = false,
  cardColor, textColor, subtextColor, onCopied,
}: {
  label: string; value: string; secureDefault?: boolean;
  editable?: boolean; onChangeText?: (t: string) => void;
  placeholder?: string; multiline?: boolean;
  cardColor: string; textColor: string; subtextColor: string;
  onCopied?: () => void;
}) {
  const [hidden, setHidden] = useState(secureDefault);

  // When switching from view→edit, reset hidden so password shows toggle
  useEffect(() => { setHidden(secureDefault); }, [editable]);

  return (
    <View style={df.wrap}>
      <Text style={[df.label, { color: subtextColor }]}>{label}</Text>
      <View style={[df.row, { backgroundColor: cardColor, borderColor: cardColor },
        multiline && { alignItems: 'flex-start' }]}>
        {editable ? (
          <TextInput
            style={[df.input, { color: textColor }, multiline && df.inputMulti]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder ?? label}
            placeholderTextColor={subtextColor}
            secureTextEntry={hidden}
            autoCapitalize="none"
            autoCorrect={false}
            multiline={multiline}
          />
        ) : (
          <Text style={[df.value, { color: value ? textColor : subtextColor }]}
            numberOfLines={multiline ? undefined : 1}>
            {!value ? '—' : secureDefault && hidden ? '••••••••' : value}
          </Text>
        )}
        <View style={[df.actions, multiline && { marginTop: 2 }]}>
          {secureDefault && (
            <TouchableOpacity style={[df.iconBtn, { backgroundColor: cardColor }]}
              onPress={() => setHidden(h => !h)}>
              <Text style={df.iconTxt}>{hidden ? I_EYE : I_EYEOFF}</Text>
            </TouchableOpacity>
          )}
          {!editable && !!value && (
            <TouchableOpacity style={[df.iconBtn, { backgroundColor: cardColor }]}
              onPress={() => copyField(value, label, onCopied)}>
              <Text style={df.iconTxt}>{I_COPY}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const df = StyleSheet.create({
  wrap:       { gap: 5 },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  row:        { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  value:      { flex: 1, fontSize: 14 },
  input:      { flex: 1, fontSize: 14, padding: 0 },
  inputMulti: { minHeight: 56, textAlignVertical: 'top' },
  actions:    { flexDirection: 'row', gap: 4 },
  iconBtn:    { width: 30, height: 30, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
  iconTxt:    { fontSize: 14 },
});

// ─── AlphabetSidebar ──────────────────────────────────────────────────────────
function AlphabetSidebar({ active, onChange, accentColor, subtextColor }: {
  active: string | null; onChange: (l: string | null) => void;
  accentColor: string; subtextColor: string;
}) {
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  function letterAt(y: number): string | null {
    const i = Math.floor(y / LETTER_ITEM_H);
    return i >= 0 && i < ALPHABET.length ? ALPHABET[i] : null;
  }

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: evt => {
      const l = letterAt(evt.nativeEvent.locationY);
      if (l) onChange(l);
    },
    onPanResponderMove: evt => {
      const l = letterAt(evt.nativeEvent.locationY);
      if (l && l !== activeRef.current) onChange(l);
    },
    onPanResponderRelease: evt => {
      const l = letterAt(evt.nativeEvent.locationY);
      if (l === activeRef.current) onChange(null);
      else if (l) onChange(l);
    },
  })).current;

  return (
    <View style={s.alphabetWrap} {...pan.panHandlers}>
      {ALPHABET.map(letter => (
        <View key={letter} style={s.alphabetItem}>
          <Text style={[s.alphabetLetter, { color: active === letter ? accentColor : subtextColor }]}>
            {letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { colors } = useTheme();
  const { userId, hiddenMode } = useLocalSearchParams<{ userId: string; hiddenMode?: string }>();
  const isHiddenMode = hiddenMode === '1';

  // ── Data ───────────────────────────────────────────────────────────────────
  const [passwords, setPasswords] = useState<Password[]>([]);
  const reload = useCallback(() => {
    const all = getUserById(userId)?.passwords ?? [];
    setPasswords(isHiddenMode ? all.filter(p => p.isHidden) : all.filter(p => !p.isHidden));
  }, [userId, isHiddenMode]);
  useEffect(() => { reload(); }, [reload]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchMode,   setSearchMode]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchField,  setSearchField]  = useState<SearchField>('all');
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const searchRef = useRef<TextInput>(null);

  const filtered = useMemo(() => {
    let list = [...passwords];
    if (letterFilter) {
      list = list.filter(p => {
        const c = p.label.charAt(0).toUpperCase();
        return letterFilter === '#' ? !/[A-Z]/.test(c) : c === letterFilter;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(p => {
        const targets = searchField === 'all'
          ? [p.label, p.username, p.email ?? '', p.url ?? '', p.notes ?? '']
          : [String(p[searchField as keyof Password] ?? '')];
        return targets.some(t => t.toLowerCase().includes(q));
      });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [passwords, letterFilter, searchQuery, searchField]);

  function enterSearch() { setSearchMode(true); setTimeout(() => searchRef.current?.focus(), 80); }
  function exitSearch()  { setSearchMode(false); setSearchQuery(''); setSearchField('all'); }

  // ── Flash toast ────────────────────────────────────────────────────────────
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [flashMsg, setFlashMsg] = useState('');

  function showFlash(msg: string) {
    setFlashMsg(msg);
    flashAnim.setValue(1);
    Animated.sequence([
      Animated.delay(900),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }

  // ── Drawer ─────────────────────────────────────────────────────────────────
  // The drawer is a bottom sheet with a fixed height animated from SCREEN_H
  // (off screen) down to the snap point.
  // We animate the PANEL's translateY:
  //   translateY = 0       → panel sits exactly at bottom of screen
  //   translateY = -height → panel is fully visible above bottom edge
  // The Modal's root View is position:absolute filling the screen.
  // The panel is position:absolute bottom:0, height = drawerHeightAnim.
  // We drive translateY so the panel slides in from below.

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerMode,    setDrawerMode]    = useState<'view' | 'add' | 'edit'>('add');
  const [selected,      setSelected]      = useState<Password | null>(null);
  const [form,          setForm]          = useState(emptyEntry());

  // currentHeight tracks the live height of the sheet so PanResponder can use it
  const currentHeight = useRef(DRAWER_SNAP_MID);
  // Animated height of the sheet (drives both the View height and translateY for spring)
  const drawerHeight  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = drawerHeight.addListener(({ value }) => { currentHeight.current = value; });
    return () => drawerHeight.removeListener(id);
  }, [drawerHeight]);

  function snapHeight(h: number, vel = 0) {
    Animated.spring(drawerHeight, {
      toValue: h, velocity: vel,
      tension: 80, friction: 14,
      useNativeDriver: false,   // height cannot use native driver
    }).start(() => { currentHeight.current = h; });
  }

  function openDrawer(h = DRAWER_SNAP_MID) {
    // Start from 0 height (off screen), set visible, then spring to target
    drawerHeight.setValue(1); // 1 not 0 to avoid layout flash
    setDrawerVisible(true);
    requestAnimationFrame(() => snapHeight(h));
  }

  function closeDrawer() {
    Animated.timing(drawerHeight, {
      toValue: 0, duration: 220, useNativeDriver: false,
    }).start(() => { setDrawerVisible(false); drawerHeight.setValue(0); });
  }

  // PanResponder on the handle — dragging changes the HEIGHT (not translateY)
  const drawerPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dy) > 4,
    onPanResponderMove: (_, gs) => {
      // Dragging DOWN (positive dy) decreases height
      const next = Math.min(DRAWER_SNAP_MAX, Math.max(DRAWER_SNAP_MID * 0.3, currentHeight.current - gs.dy));
      drawerHeight.setValue(next);
    },
    onPanResponderRelease: (_, gs) => {
      const liveH = currentHeight.current - gs.dy;
      // Fast swipe down or dragged below 40% of mid → close
      if (gs.vy > DRAWER_SNAP_CLOSE_VY || liveH < DRAWER_SNAP_MID * 0.5) {
        closeDrawer(); return;
      }
      // Snap to mid or max
      const threshold = (DRAWER_SNAP_MID + DRAWER_SNAP_MAX) / 2;
      snapHeight(liveH < threshold ? DRAWER_SNAP_MID : DRAWER_SNAP_MAX, gs.vy);
    },
  })).current;

  function openAdd() {
    haptic('light');
    setDrawerMode('add'); setSelected(null); setForm(emptyEntry()); openDrawer();
  }
  function openView(entry: Password) {
    haptic('light');
    setDrawerMode('view'); setSelected(entry);
    setForm({
      label: entry.label, username: entry.username,
      email: entry.email ?? '', password: entry.password,
      url: entry.url ?? '', notes: entry.notes ?? '',
      isHidden: entry.isHidden ?? false,
    });
    openDrawer();
  }
  function handleSave() {
    if (!form.label.trim()) { Alert.alert('Required', 'Please enter a site or app name.'); return; }
    if (drawerMode === 'add') addPasswordToUser(userId, form);
    else if (drawerMode === 'edit' && selected) updatePasswordEntry(userId, selected.id, form);
    haptic('success');
    showFlash(drawerMode === 'add' ? 'Password saved ✓' : 'Password updated ✓');
    reload(); closeDrawer();
  }
  function handleDelete() {
    if (!selected) return;
    Alert.alert('Delete', `Delete "${selected.label}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        haptic('medium');
        deletePasswordEntry(userId, selected.id); reload(); closeDrawer();
      }},
    ]);
  }
  function handleBack() {
    if (isHiddenMode) router.back();
    else router.replace('/');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Hidden mode banner */}
      {isHiddenMode && (
        <View style={[s.hiddenBanner, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
          <Text style={[s.hiddenBannerTxt, { color: colors.accent }]}>👁  Hidden vault</Text>
        </View>
      )}

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.background, borderColor: colors.card }]}>
        <View style={s.topRow}>
          <TouchableOpacity style={s.topBtn} onPress={handleBack}>
            <Text style={[s.topBtnTxt, { color: colors.accent }]}>{I_BACK}</Text>
          </TouchableOpacity>

          {searchMode ? (
            <TextInput
              ref={searchRef}
              style={[s.searchInput, { backgroundColor: colors.card, borderColor: colors.accent + '55', color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search…"
              placeholderTextColor={colors.subtext}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <TouchableOpacity style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.card }]} onPress={enterSearch}>
              <Text style={s.searchIcon}>{I_SEARCH}</Text>
              <Text style={[s.searchPlaceholder, { color: colors.subtext }]}>Search passwords…</Text>
            </TouchableOpacity>
          )}

          {searchMode ? (
            <TouchableOpacity style={s.topBtn} onPress={exitSearch}>
              <Text style={[s.topBtnTxt, { color: colors.accent }]}>{I_CLOSE}</Text>
            </TouchableOpacity>
          ) : !isHiddenMode ? (
            <TouchableOpacity
              style={s.topBtn}
              onPress={() => router.push({ pathname: '/Settings', params: { userId } })}
            >
              <Text style={[s.topBtnTxt, { color: colors.accent }]}>{I_SETTINGS}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.topBtn} />
          )}
        </View>

        {searchMode && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
            {SEARCH_FIELDS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.chip, { backgroundColor: colors.card, borderColor: colors.card },
                  searchField === f.key && { borderColor: colors.accent, backgroundColor: colors.accent + '18' }]}
                onPress={() => setSearchField(f.key)}
              >
                <Text style={[s.chipTxt, { color: searchField === f.key ? colors.accent : colors.subtext },
                  searchField === f.key && s.chipTxtActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── Body ── */}
      <View style={s.body}>
        <FlatList
          data={filtered}
          keyExtractor={p => p.id}
          style={s.list}
          contentContainerStyle={[s.listContent, filtered.length === 0 && { flex: 1 }]}
          ItemSeparatorComponent={() => <View style={[s.sep, { backgroundColor: colors.card }]} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={[s.emptyTitle, { color: colors.subtext }]}>
                {passwords.length === 0
                  ? (isHiddenMode ? 'No hidden passwords' : 'No passwords yet')
                  : 'No results'}
              </Text>
              {passwords.length === 0 && !isHiddenMode && (
                <Text style={[s.emptySub, { color: colors.subtext + '88' }]}>Tap + to add your first entry.</Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => openView(item)}>
              <View style={[s.avatar, { backgroundColor: colors.card, borderColor: colors.card }]}>
                <Text style={[s.avatarTxt, { color: colors.accent }]}>{item.label.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={s.rowInfo}>
                <Text style={[s.rowLabel, { color: colors.text }]}>{item.label}</Text>
                <Text style={[s.rowSub, { color: colors.subtext }]} numberOfLines={1}>
                  {item.username || item.email || item.url || '—'}
                </Text>
              </View>
              <Text style={[s.chevron, { color: colors.subtext }]}>{I_CHEVRON}</Text>
            </TouchableOpacity>
          )}
        />
        <AlphabetSidebar
          active={letterFilter} onChange={setLetterFilter}
          accentColor={colors.accent} subtextColor={colors.subtext}
        />
      </View>

      {letterFilter && (
        <View style={[s.letterBubble, { backgroundColor: colors.accent }]} pointerEvents="none">
          <Text style={[s.letterBubbleTxt, { color: colors.background }]}>{letterFilter}</Text>
        </View>
      )}

      {!isHiddenMode && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
          onPress={openAdd} activeOpacity={0.85}
        >
          <Text style={[s.fabTxt, { color: colors.background }]}>{I_PLUS}</Text>
        </TouchableOpacity>
      )}

      {/* ── Drawer ── */}
      {/*
        Architecture:
        - Modal covers full screen (transparent, no animation)
        - Pressable backdrop fills the screen behind the sheet
        - Animated.View is the sheet itself: position absolute, bottom 0,
          height driven by drawerHeight animated value.
        - Inside: handle zone (pan responder) | header | flex:1 ScrollView | footer
        - Footer is OUTSIDE the ScrollView so it's always visible.
        - No overflow:hidden on the sheet itself.
      */}
      <Modal visible={drawerVisible} transparent animationType="none" onRequestClose={closeDrawer}>
        <View style={StyleSheet.absoluteFill}>
          {/* Backdrop */}
          <Pressable style={s.backdrop} onPress={closeDrawer} />

          {/* Sheet — animated height, pinned to bottom */}
          <Animated.View style={[s.sheet, {
            backgroundColor: colors.card,
            borderColor: colors.background,
            height: drawerHeight,
          }]}>

            {/* Drag handle — pan responder only on this zone */}
            <View style={s.handleZone} {...drawerPan.panHandlers}>
              <View style={[s.handle, { backgroundColor: colors.subtext + '55' }]} />
            </View>

            {/* Sheet header */}
            <View style={[s.sheetHead, { borderColor: colors.background }]}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>
                {drawerMode === 'add' ? 'New password'
                  : drawerMode === 'edit' ? 'Edit password'
                  : form.label || 'Password'}
              </Text>
              <View style={s.sheetHeadBtns}>
                {drawerMode === 'view' && (
                  <TouchableOpacity style={[s.headBtn, { backgroundColor: '#2A1515' }]} onPress={handleDelete}>
                    <Text>{I_TRASH}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.headBtn, { backgroundColor: colors.background }]} onPress={closeDrawer}>
                  <Text style={{ color: colors.subtext, fontSize: 16 }}>{I_COLLAPSE}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable fields — flex:1 so it takes remaining space between header and footer */}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={s.sheetBody}
              keyboardVerticalOffset={Platform.OS === 'android' ? 80 : 0}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={s.sheetScroll}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                <DrawerField label="Site / App" value={form.label}
                  editable={drawerMode !== 'view'}
                  onChangeText={t => setForm(f => ({ ...f, label: t }))}
                  placeholder="e.g. Gmail"
                  cardColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} />
                <DrawerField label="Username" value={form.username}
                  editable={drawerMode !== 'view'}
                  onChangeText={t => setForm(f => ({ ...f, username: t }))}
                  cardColor={colors.background} textColor={colors.text} subtextColor={colors.subtext}
                  onCopied={() => showFlash('Username copied ✓')} />
                <DrawerField label="Email" value={form.email ?? ''}
                  editable={drawerMode !== 'view'}
                  onChangeText={t => setForm(f => ({ ...f, email: t }))}
                  cardColor={colors.background} textColor={colors.text} subtextColor={colors.subtext}
                  onCopied={() => showFlash('Email copied ✓')} />
                <DrawerField label="Password" value={form.password}
                  secureDefault editable={drawerMode !== 'view'}
                  onChangeText={t => setForm(f => ({ ...f, password: t }))}
                  cardColor={colors.background} textColor={colors.text} subtextColor={colors.subtext}
                  onCopied={() => showFlash('Password copied ✓')} />
                <DrawerField label="URL" value={form.url ?? ''}
                  editable={drawerMode !== 'view'}
                  onChangeText={t => setForm(f => ({ ...f, url: t }))}
                  placeholder="https://"
                  cardColor={colors.background} textColor={colors.text} subtextColor={colors.subtext}
                  onCopied={() => showFlash('URL copied ✓')} />
                <DrawerField label="Notes" value={form.notes ?? ''}
                  editable={drawerMode !== 'view'}
                  onChangeText={t => setForm(f => ({ ...f, notes: t }))}
                  multiline
                  cardColor={colors.background} textColor={colors.text} subtextColor={colors.subtext}
                  onCopied={() => showFlash('Notes copied ✓')} />

                {drawerMode !== 'view' && (
                  <View style={[s.hiddenRow, { backgroundColor: colors.background }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.hiddenLabel, { color: colors.text }]}>Hidden password</Text>
                      <Text style={[s.hiddenSub, { color: colors.subtext }]}>Only visible in the hidden vault</Text>
                    </View>
                    <Switch
                      value={!!form.isHidden}
                      onValueChange={v => { haptic('light'); setForm(f => ({ ...f, isHidden: v })); }}
                      trackColor={{ false: colors.subtext + '44', true: colors.accent }}
                      thumbColor={form.isHidden ? colors.background : colors.subtext}
                    />
                  </View>
                )}
                {drawerMode === 'view' && form.isHidden && (
                  <View style={[s.hiddenBadge, { borderColor: colors.accent + '44', backgroundColor: colors.accent + '11' }]}>
                    <Text style={[s.hiddenBadgeTxt, { color: colors.accent }]}>👁  Hidden password</Text>
                  </View>
                )}
              </ScrollView>
            </KeyboardAvoidingView>

            {/* Footer — OUTSIDE scroll view, always visible at bottom of sheet */}
            <View style={[s.sheetFoot, { borderColor: colors.background }]}>
              {drawerMode === 'view' ? (
                <TouchableOpacity
                  style={[s.btnPrimary, { backgroundColor: colors.accent }]}
                  onPress={() => { haptic('light'); setDrawerMode('edit'); }}
                >
                  <Text style={[s.btnPrimaryTxt, { color: colors.background }]}>{I_EDIT}  Edit</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.footRow}>
                  <TouchableOpacity
                    style={[s.btnSecondary, { flex: 1, borderColor: colors.background }]}
                    onPress={closeDrawer}
                  >
                    <Text style={[s.btnSecondaryTxt, { color: colors.subtext }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, { flex: 2, backgroundColor: colors.accent }]}
                    onPress={handleSave}
                  >
                    <Text style={[s.btnPrimaryTxt, { color: colors.background }]}>
                      {drawerMode === 'add' ? 'Save' : 'Update'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

          </Animated.View>
        </View>
      </Modal>

      {/* Flash toast — visual success feedback, no popup */}
      <Animated.View
        pointerEvents="none"
        style={[s.flash, { backgroundColor: colors.accent, opacity: flashAnim }]}
      >
        <Text style={[s.flashTxt, { color: colors.background }]}>{flashMsg}</Text>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:             { flex: 1 },
  hiddenBanner:     { borderBottomWidth: 1, paddingVertical: 6, alignItems: 'center' },
  hiddenBannerTxt:  { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  header:           { paddingTop: Platform.OS === 'android' ? 44 : 54, borderBottomWidth: 1 },
  topRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  topBtn:           { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  topBtnTxt:        { fontSize: 20 },
  searchBar:        { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  searchIcon:       { fontSize: 13 },
  searchPlaceholder:{ fontSize: 14 },
  searchInput:      { flex: 1, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  chips:            { paddingHorizontal: 12, paddingTop: 0, paddingBottom: 10, gap: 6, alignItems: 'center' },
  chip:             { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  chipTxt:          { fontSize: 12 },
  chipTxtActive:    { fontWeight: '600' },
  body:             { flex: 1, flexDirection: 'row' },
  list:             { flex: 1 },
  listContent:      { paddingLeft: 16, paddingRight: 2, paddingTop: 4, paddingBottom: 100 },
  sep:              { height: 1, marginLeft: 68 },
  row:              { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  avatar:           { width: 42, height: 42, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:        { fontSize: 17, fontWeight: '700' },
  rowInfo:          { flex: 1 },
  rowLabel:         { fontSize: 15, fontWeight: '600' },
  rowSub:           { fontSize: 12, marginTop: 2 },
  chevron:          { fontSize: 18, paddingRight: 4 },
  empty:            { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 80 },
  emptyTitle:       { fontSize: 16, fontWeight: '600' },
  emptySub:         { fontSize: 13 },
  alphabetWrap:     { width: 22, paddingVertical: 6, justifyContent: 'center', alignItems: 'center' },
  alphabetItem:     { height: LETTER_ITEM_H, justifyContent: 'center', alignItems: 'center', width: 22 },
  alphabetLetter:   { fontSize: 9, fontWeight: '700' },
  letterBubble:     { position: 'absolute', alignSelf: 'center', top: '45%', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 20 },
  letterBubbleTxt:  { fontSize: 24, fontWeight: '700' },
  fab:              { position: 'absolute', bottom: 32, right: 20, width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fabTxt:           { fontSize: 28, fontWeight: '300', lineHeight: 32 },

  // Backdrop fills full screen behind the sheet
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000AA' },

  // Sheet — bottom-anchored, height animated, NO overflow:hidden
  // overflow:hidden was the root cause of the footer being clipped
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    // No overflow:hidden — footer must not be clipped
    flexDirection: 'column',
  },
  handleZone:   { height: 32, justifyContent: 'center', alignItems: 'center' },
  handle:       { width: 36, height: 3, borderRadius: 2 },
  sheetHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  sheetTitle:   { fontSize: 17, fontWeight: '700' },
  sheetHeadBtns:{ flexDirection: 'row', gap: 8 },
  headBtn:      { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },

  // Body: flex:1 so it fills space between header and footer
  sheetBody:    { flex: 1 },
  sheetScroll:  { padding: 20, gap: 16, paddingBottom: 8 },

  hiddenRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, gap: 10 },
  hiddenLabel:  { fontSize: 14, fontWeight: '600' },
  hiddenSub:    { fontSize: 12, marginTop: 2 },
  hiddenBadge:  { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  hiddenBadgeTxt:{ fontSize: 13, fontWeight: '600' },

  // Footer — fixed at the bottom of the sheet, never scrolled away
  sheetFoot:    { padding: 16, borderTopWidth: 1 },
  footRow:      { flexDirection: 'row', gap: 10 },
  btnPrimary:   { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryTxt:{ fontWeight: '700', fontSize: 14 },
  btnSecondary: { borderWidth: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnSecondaryTxt:{ fontSize: 14 },
  flash:        { position: 'absolute', bottom: 40, left: 32, right: 32, borderRadius: 12, paddingVertical: 14, alignItems: 'center', zIndex: 999 },
  flashTxt:     { fontSize: 14, fontWeight: '700' },
});