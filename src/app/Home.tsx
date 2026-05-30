import '@/constants/i18n';
import Clipboard from '@react-native-clipboard/clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Animated, Dimensions, FlatList, Keyboard,
  Modal, PanResponder, Platform,
  Pressable, ScrollView, StyleSheet, Switch, Text,
  TextInput, TouchableOpacity, View
} from 'react-native';

import {
  addPasswordToUser, deletePasswordEntry,
  getUserById, updatePasswordEntry,
} from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { Password } from '@/constants/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_SNAP_MID      = SCREEN_H * 0.62;
const DRAWER_SNAP_MAX      = SCREEN_H * 0.93;
const DRAWER_SNAP_CLOSE_VY = 0.8;
const ALPHABET             = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const LETTER_ITEM_H        = 22;

type SearchField = 'all' | 'label' | 'username' | 'email' | 'password' | 'url' | 'notes';
// Labels are built at render time via t() — see useSearchFields() below
const SEARCH_FIELD_KEYS: SearchField[] = ['all','label','username','email','password','url','notes'];

// ─── Keyboard height hook ─────────────────────────────────────────────────────
// Tracks the keyboard height as an Animated.Value so the sheet can smoothly
// push its content up when the keyboard appears.
function useKeyboardHeight(): Animated.Value {
  const keyboardH = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      Animated.timing(keyboardH, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration ?? 250 : 200,
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e: any) => {
      Animated.timing(keyboardH, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e.duration ?? 250 : 200,
        useNativeDriver: false,
      }).start();
    };
    const s = Keyboard.addListener(showEvent, onShow);
    const h = Keyboard.addListener(hideEvent, onHide);
    return () => { s.remove(); h.remove(); };
  }, []);
  return keyboardH;
}

// Deterministic pastel color from a string
function labelColor(str: string): string {
  const palette = ['#C8A97E','#7EB8C8','#9B8FC8','#C87E9B','#7EC8A0','#C8B87E','#7E9BC8'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function emptyEntry(): Omit<Password, 'id' | 'createdAt' | 'updatedAt'> {
  return { label: '', username: '', email: '', password: '', url: '', telefono: '', notes: '', isHidden: false };
}

function copyField(value: string, label: string, copiedMsg: string) {
  if (!value) return;
  Clipboard.setString(value);
  Alert.alert(copiedMsg, `${label}`);
}

// ─── DrawerField ──────────────────────────────────────────────────────────────
function DrawerField({
  label, value, secureDefault = false, editable = false,
  onChangeText, placeholder, multiline = false,
  bgColor, textColor, subtextColor, accentColor, copiedMsg,
}: {
  label: string; value: string; secureDefault?: boolean;
  editable?: boolean; onChangeText?: (t: string) => void;
  placeholder?: string; multiline?: boolean;
  bgColor: string; textColor: string; subtextColor: string; accentColor: string;
  copiedMsg?: string;
}) {
  const [hidden, setHidden] = useState(secureDefault);
  useEffect(() => { setHidden(secureDefault); }, [editable]);

  return (
    <View style={df.wrap}>
      <Text style={[df.label, { color: subtextColor }]}>{label}</Text>
      <View style={[df.row, { backgroundColor: bgColor, borderColor: editable ? accentColor + '33' : bgColor },
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
            <TouchableOpacity style={[df.iconBtn, { backgroundColor: bgColor }]}
              onPress={() => setHidden(h => !h)}>
              <Text style={df.iconTxt}>{hidden ? '👁' : '🙈'}</Text>
            </TouchableOpacity>
          )}
          {!editable && !!value && (
            <TouchableOpacity style={[df.iconBtn, { backgroundColor: accentColor + '22' }]}
              onPress={() => copyField(value, label, copiedMsg ?? '')}>
              <Text style={[df.iconTxt, { color: accentColor }]}>⎘</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const df = StyleSheet.create({
  wrap:       { gap: 6 },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', paddingLeft: 4 },
  row:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, gap: 8 },
  value:      { flex: 1, fontSize: 15 },
  input:      { flex: 1, fontSize: 15, padding: 0 },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  actions:    { flexDirection: 'row', gap: 4 },
  iconBtn:    { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  iconTxt:    { fontSize: 15 },
});

// ─── AlphabetSidebar ──────────────────────────────────────────────────────────
function AlphabetSidebar({ active, onChange, accentColor, subtextColor }: {
  active: string | null; onChange: (l: string | null) => void;
  accentColor: string; subtextColor: string;
}) {
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  // locationY is relative to the view — letters start at y=0 (no padding, no centering offset).
  // Each letter occupies exactly LETTER_ITEM_H points from top.
  function letterAt(y: number): string | null {
    if (y < 0) return null;
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
    // No padding, no justifyContent:'center' — letters must start exactly at y=0
    // so that locationY maps 1:1 to the letter index formula above.
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

// ─── PasswordRow ──────────────────────────────────────────────────────────────
function PasswordRow({ item, onPress, colors }: {
  item: Password; onPress: () => void; colors: any;
}) {
  const color = labelColor(item.label);
  const sub   = item.username || item.email || item.url || '—';
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress}>
      <View style={[s.avatar, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Text style={[s.avatarTxt, { color }]}>{item.label.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={s.rowInfo}>
        <Text style={[s.rowLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
        <Text style={[s.rowSub, { color: colors.subtext }]} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={[s.chevronWrap, { backgroundColor: colors.card }]}>
        <Text style={[s.chevron, { color: colors.subtext }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { userId, hiddenMode } = useLocalSearchParams<{ userId: string; hiddenMode?: string }>();
  const isHiddenMode = hiddenMode === '1';

  // Build search field labels from translations — must be inside the component
  // so they update when the language changes.
  const SEARCH_FIELDS = [
    { key: 'all'      as SearchField, label: t('searchAll')   },
    { key: 'label'    as SearchField, label: t('searchSite')  },
    { key: 'username' as SearchField, label: t('searchUser')  },
    { key: 'email'    as SearchField, label: t('searchEmail') },
    { key: 'password' as SearchField, label: t('searchPass')  },
    { key: 'url'      as SearchField, label: t('searchUrl')   },
    { key: 'notes'    as SearchField, label: t('searchNotes') },
  ];

  const [passwords,    setPasswords]    = useState<Password[]>([]);
  const [searchMode,   setSearchMode]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchField,  setSearchField]  = useState<SearchField>('all');
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const searchRef = useRef<TextInput>(null);

  const reload = useCallback(() => {
    const all = getUserById(userId)?.passwords ?? [];
    setPasswords(isHiddenMode ? all.filter(p => p.isHidden) : all.filter(p => !p.isHidden));
  }, [userId, isHiddenMode]);
  useEffect(() => { reload(); }, [reload]);

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

  // ── Drawer ─────────────────────────────────────────────────────────────────
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerMode,    setDrawerMode]    = useState<'view' | 'add' | 'edit'>('add');
  const [selected,      setSelected]      = useState<Password | null>(null);
  const [form,          setForm]          = useState(emptyEntry());
  const keyboardH = useKeyboardHeight();

  const currentHeight = useRef(DRAWER_SNAP_MID);
  const drawerHeight  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = drawerHeight.addListener(({ value }) => { currentHeight.current = value; });
    return () => drawerHeight.removeListener(id);
  }, [drawerHeight]);

  function snapHeight(h: number, vel = 0) {
    Animated.spring(drawerHeight, { toValue: h, velocity: vel, tension: 80, friction: 14, useNativeDriver: false }).start(() => { currentHeight.current = h; });
  }
  function openDrawer(h = DRAWER_SNAP_MID) {
    drawerHeight.setValue(1); setDrawerVisible(true);
    requestAnimationFrame(() => snapHeight(h));
  }
  function closeDrawer() {
    Animated.timing(drawerHeight, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => { setDrawerVisible(false); drawerHeight.setValue(0); });
  }

  const drawerPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dy) > 4,
    onPanResponderMove: (_, gs) => {
      const next = Math.min(DRAWER_SNAP_MAX, Math.max(DRAWER_SNAP_MID * 0.3, currentHeight.current - gs.dy));
      drawerHeight.setValue(next);
    },
    onPanResponderRelease: (_, gs) => {
      const liveH = currentHeight.current - gs.dy;
      if (gs.vy > DRAWER_SNAP_CLOSE_VY || liveH < DRAWER_SNAP_MID * 0.5) { closeDrawer(); return; }
      const threshold = (DRAWER_SNAP_MID + DRAWER_SNAP_MAX) / 2;
      snapHeight(liveH < threshold ? DRAWER_SNAP_MID : DRAWER_SNAP_MAX, gs.vy);
    },
  })).current;

  function openAdd() {
    setDrawerMode('add'); setSelected(null); setForm(emptyEntry()); openDrawer();
  }
  function openView(entry: Password) {
    setDrawerMode('view'); setSelected(entry);
    setForm({ label: entry.label, username: entry.username, email: entry.email ?? '', password: entry.password, url: entry.url ?? '', telefono: entry.telefono ?? '', notes: entry.notes ?? '', isHidden: entry.isHidden ?? false });
    openDrawer();
  }
  function handleSave() {
    if (!form.label.trim()) { Alert.alert(t('requiredField'), t('enterSiteName')); return; }
    if (drawerMode === 'add') addPasswordToUser(userId, form);
    else if (drawerMode === 'edit' && selected) updatePasswordEntry(userId, selected.id, form);
    reload(); closeDrawer();
  }
  function handleDelete() {
    if (!selected) return;
    Alert.alert(t('deleteEntry'), t('deleteEntryMsg', { name: selected.label }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => { deletePasswordEntry(userId, selected.id); reload(); closeDrawer(); } },
    ]);
  }
  function handleBack() {
    if (isHiddenMode) router.back();
    else router.replace('/');
  }

  // Avatar color for the current drawer entry
  const drawerColor = form.label ? labelColor(form.label) : colors.accent;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Hidden mode banner */}
      {isHiddenMode && (
        <View style={[s.hiddenBanner, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '33' }]}>
          <Text style={[s.hiddenBannerTxt, { color: colors.accent }]}>{t('hiddenVaultBanner')}</Text>
        </View>
      )}

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.background, borderColor: colors.card }]}>
        <View style={s.topRow}>
          {/* Back / vault icon */}
          <TouchableOpacity style={[s.topBtn, { backgroundColor: colors.card }]} onPress={handleBack}>
            <Text style={[s.topBtnTxt, { color: colors.text }]}>←</Text>
          </TouchableOpacity>

          {/* Search bar or input */}
          {searchMode ? (
            <TextInput
              ref={searchRef}
              style={[s.searchInput, { backgroundColor: colors.card, color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search…"
              placeholderTextColor={colors.subtext}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <TouchableOpacity style={[s.searchBar, { backgroundColor: colors.card }]} onPress={enterSearch}>
              <Text style={[s.searchIcon, { color: colors.subtext }]}>🔍</Text>
              <Text style={[s.searchPlaceholder, { color: colors.subtext }]}>
                {passwords.length > 0 ? t('searchPlaceholderCount', { count: passwords.length }) : t('searchPlaceholder')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Right button */}
          {searchMode ? (
            <TouchableOpacity style={[s.topBtn, { backgroundColor: colors.card }]} onPress={exitSearch}>
              <Text style={[s.topBtnTxt, { color: colors.text }]}>✕</Text>
            </TouchableOpacity>
          ) : !isHiddenMode ? (
            <TouchableOpacity
              style={[s.topBtn, { backgroundColor: colors.card }]}
              onPress={() => router.push({ pathname: '/Settings', params: { userId } })}
            >
              <Text style={[s.topBtnTxt, { color: colors.text }]}>≡</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.topBtn} />
          )}
        </View>

        {/* Search field chips */}
        {searchMode && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
            {SEARCH_FIELDS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.chip, { backgroundColor: colors.card },
                  searchField === f.key && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                onPress={() => setSearchField(f.key)}
              >
                <Text style={[s.chipTxt, { color: searchField === f.key ? colors.background : colors.subtext }]}>
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
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={[s.sep, { backgroundColor: colors.card }]} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>{passwords.length === 0 ? '🔐' : '🔍'}</Text>
              <Text style={[s.emptyTitle, { color: colors.text }]}>
                {passwords.length === 0
                  ? (isHiddenMode ? t('hiddenVaultEmpty') : t('noPasswordsYet'))
                  : t('noResults')}
              </Text>
              {passwords.length === 0 && !isHiddenMode && (
                <Text style={[s.emptySub, { color: colors.subtext }]}>
                  {t('tapPlusHint')}
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <PasswordRow item={item} onPress={() => openView(item)} colors={colors} />
          )}
        />
        <AlphabetSidebar
          active={letterFilter} onChange={setLetterFilter}
          accentColor={colors.accent} subtextColor={colors.subtext}
        />
      </View>

      {/* Letter bubble */}
      {letterFilter && (
        <View style={[s.letterBubble, { backgroundColor: colors.accent }]} pointerEvents="none">
          <Text style={[s.letterBubbleTxt, { color: colors.background }]}>{letterFilter}</Text>
        </View>
      )}

      {/* FAB */}
      {!isHiddenMode && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
          onPress={openAdd} activeOpacity={0.85}
        >
          <Text style={[s.fabTxt, { color: colors.background }]}>+</Text>
        </TouchableOpacity>
      )}

      {/* ── Drawer ── */}
      <Modal visible={drawerVisible} transparent animationType="none" onRequestClose={closeDrawer}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={s.backdrop} onPress={closeDrawer} />

          <Animated.View style={[s.sheet, {
            backgroundColor: colors.card,
            borderColor: colors.background,
            height: drawerHeight,
          }]}>
            {/* Handle */}
            <View style={s.handleZone} {...drawerPan.panHandlers}>
              <View style={[s.handle, { backgroundColor: colors.subtext + '44' }]} />
            </View>

            {/* Sheet header */}
            <View style={[s.sheetHead, { borderColor: colors.background }]}>
              <View style={s.sheetHeadLeft}>
                {/* Colored mini-avatar */}
                <View style={[s.sheetAvatar, { backgroundColor: drawerColor + '22', borderColor: drawerColor + '55' }]}>
                  <Text style={[s.sheetAvatarTxt, { color: drawerColor }]}>
                    {form.label ? form.label.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
                <Text style={[s.sheetTitle, { color: colors.text }]}>
                  {drawerMode === 'add'  ? t('newEntry')
                    : drawerMode === 'edit' ? t('editEntry')
                    : form.label || t('entry')}
                </Text>
              </View>
              <View style={s.sheetHeadBtns}>
                {drawerMode === 'view' && (
                  <TouchableOpacity style={[s.headBtn, { backgroundColor: '#C84F4F22' }]} onPress={handleDelete}>
                    <Text style={{ fontSize: 15 }}>🗑</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.headBtn, { backgroundColor: colors.background }]} onPress={closeDrawer}>
                  <Text style={{ color: colors.subtext, fontSize: 16, fontWeight: '300' }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Fields — the ScrollView gets an animated paddingBottom matching the
                keyboard height so the active field is never hidden. This works
                reliably inside Modals on both iOS and Android, unlike KAV. */}
            <Animated.ScrollView
              style={s.sheetBody}
              contentContainerStyle={[s.sheetScroll, { paddingBottom: keyboardH }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
                <DrawerField label={t('fieldSiteApp')} value={form.label}
                  editable={drawerMode !== 'view'}
                  onChangeText={v => setForm(f => ({ ...f, label: v }))}
                  placeholder={t('fieldSiteAppHint')}
                  bgColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} accentColor={colors.accent}
                  copiedMsg={t('copied')} />
                <DrawerField label={t('fieldUsername')} value={form.username}
                  editable={drawerMode !== 'view'}
                  onChangeText={v => setForm(f => ({ ...f, username: v }))}
                  bgColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} accentColor={colors.accent}
                  copiedMsg={t('copied')} />
                <DrawerField label={t('fieldEmail')} value={form.email ?? ''}
                  editable={drawerMode !== 'view'}
                  onChangeText={v => setForm(f => ({ ...f, email: v }))}
                  bgColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} accentColor={colors.accent}
                  copiedMsg={t('copied')} />
                <DrawerField label={t('fieldPassword')} value={form.password}
                  secureDefault editable={drawerMode !== 'view'}
                  onChangeText={v => setForm(f => ({ ...f, password: v }))}
                  bgColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} accentColor={colors.accent}
                  copiedMsg={t('copied')} />
                <DrawerField label={t('fieldUrl')} value={form.url ?? ''}
                  editable={drawerMode !== 'view'}
                  onChangeText={v => setForm(f => ({ ...f, url: v }))}
                  placeholder="https://"
                  bgColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} accentColor={colors.accent}
                  copiedMsg={t('copied')} />
                <DrawerField label={t('fieldPhone')} value={form.telefono ?? ''}
                  editable={drawerMode !== 'view'}
                  onChangeText={v => setForm(f => ({ ...f, telefono: v }))}
                  placeholder="+39 000 0000000"
                  bgColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} accentColor={colors.accent}
                  copiedMsg={t('copied')} />
                <DrawerField label={t('fieldNotes')} value={form.notes ?? ''}
                  editable={drawerMode !== 'view'}
                  onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                  multiline
                  bgColor={colors.background} textColor={colors.text} subtextColor={colors.subtext} accentColor={colors.accent}
                  copiedMsg={t('copied')} />

                {drawerMode !== 'view' && (
                  <View style={[s.hiddenRow, { backgroundColor: colors.background }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.hiddenLabel, { color: colors.text }]}>{t('hiddenEntryLabel')}</Text>
                      <Text style={[s.hiddenSub, { color: colors.subtext }]}>{t('hiddenEntrySub')}</Text>
                    </View>
                    <Switch
                      value={!!form.isHidden}
                      onValueChange={v => setForm(f => ({ ...f, isHidden: v }))}
                      trackColor={{ false: colors.subtext + '44', true: colors.accent }}
                      thumbColor={form.isHidden ? colors.background : colors.subtext}
                    />
                  </View>
                )}
                {drawerMode === 'view' && form.isHidden && (
                  <View style={[s.hiddenBadge, { borderColor: colors.accent + '44', backgroundColor: colors.accent + '11' }]}>
                    <Text style={[s.hiddenBadgeTxt, { color: colors.accent }]}>{t('hiddenEntryBadge')}</Text>
                  </View>
                )}
            </Animated.ScrollView>

            {/* Footer */}
            <View style={[s.sheetFoot, { borderColor: colors.background }]}>
              {drawerMode === 'view' ? (
                <TouchableOpacity
                  style={[s.btnPrimary, { backgroundColor: colors.accent }]}
                  onPress={() => setDrawerMode('edit')}
                >
                  <Text style={[s.btnPrimaryTxt, { color: colors.background }]}>{t('editBtn')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.footRow}>
                  <TouchableOpacity
                    style={[s.btnSecondary, { flex: 1, borderColor: colors.subtext + '44' }]}
                    onPress={closeDrawer}
                  >
                    <Text style={[s.btnSecondaryTxt, { color: colors.subtext }]}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, { flex: 2, backgroundColor: colors.accent }]}
                    onPress={handleSave}
                  >
                    <Text style={[s.btnPrimaryTxt, { color: colors.background }]}>
                      {drawerMode === 'add' ? t('saveEntry') : t('saveChanges')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:             { flex: 1 },
  hiddenBanner:     { borderBottomWidth: 1, paddingVertical: 8, paddingHorizontal: 20, alignItems: 'center' },
  hiddenBannerTxt:  { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },

  header:           { paddingTop: Platform.OS === 'android' ? 44 : 56, borderBottomWidth: 1 },
  topRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, gap: 10 },
  topBtn:           { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  topBtnTxt:        { fontSize: 18, fontWeight: '500' },
  searchBar:        { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
  searchIcon:       { fontSize: 13 },
  searchPlaceholder:{ fontSize: 14, flex: 1 },
  searchInput:      { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  chips:            { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 12, gap: 7, alignItems: 'center' },
  chip:             { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20 },
  chipTxt:          { fontSize: 12, fontWeight: '600' },

  body:             { flex: 1, flexDirection: 'row' },
  list:             { flex: 1 },
  listContent:      { paddingLeft: 14, paddingRight: 2, paddingTop: 6, paddingBottom: 110 },
  sep:              { height: 1, marginLeft: 72, marginRight: 14 },

  row:              { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 2, gap: 12 },
  avatar:           { width: 46, height: 46, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:        { fontSize: 18, fontWeight: '700' },
  rowInfo:          { flex: 1, gap: 3 },
  rowLabel:         { fontSize: 15, fontWeight: '600' },
  rowSub:           { fontSize: 12 },
  chevronWrap:      { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  chevron:          { fontSize: 17, lineHeight: 20 },

  empty:            { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 80 },
  emptyIcon:        { fontSize: 48, marginBottom: 4 },
  emptyTitle:       { fontSize: 17, fontWeight: '700' },
  emptySub:         { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },

  alphabetWrap:     { width: 22, alignItems: 'center' },
  alphabetItem:     { height: LETTER_ITEM_H, justifyContent: 'center', alignItems: 'center', width: 22 },
  alphabetLetter:   { fontSize: 9, fontWeight: '700' },

  letterBubble:     { position: 'absolute', alignSelf: 'center', top: '45%', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 20 },
  letterBubbleTxt:  { fontSize: 26, fontWeight: '700' },

  fab:              { position: 'absolute', bottom: 34, right: 22, width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
  fabTxt:           { fontSize: 30, fontWeight: '300', lineHeight: 34, marginTop: -1 },

  backdrop:         { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000099' },
  sheet:            { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, flexDirection: 'column' },
  handleZone:       { height: 30, justifyContent: 'center', alignItems: 'center' },
  handle:           { width: 40, height: 4, borderRadius: 2 },

  sheetHead:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1 },
  sheetHeadLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sheetAvatar:      { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  sheetAvatarTxt:   { fontSize: 15, fontWeight: '700' },
  sheetTitle:       { fontSize: 17, fontWeight: '700', flex: 1 },
  sheetHeadBtns:    { flexDirection: 'row', gap: 8 },
  headBtn:          { width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },

  sheetBody:        { flex: 1 },
  sheetScroll:      { padding: 18, gap: 14, paddingBottom: 10 },

  hiddenRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, gap: 10 },
  hiddenLabel:      { fontSize: 14, fontWeight: '600' },
  hiddenSub:        { fontSize: 12, marginTop: 2 },
  hiddenBadge:      { borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  hiddenBadgeTxt:   { fontSize: 13, fontWeight: '600' },

  sheetFoot:        { padding: 16, borderTopWidth: 1 },
  footRow:          { flexDirection: 'row', gap: 10 },
  btnPrimary:       { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnPrimaryTxt:    { fontWeight: '700', fontSize: 15 },
  btnSecondary:     { borderWidth: 1, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnSecondaryTxt:  { fontSize: 15 },
});