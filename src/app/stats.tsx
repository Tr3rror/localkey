import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getUserById } from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { Password } from '@/constants/types';

// ─── Password strength (pure, memoised per call site) ─────────────────────────
function scorePassword(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: 'None', color: '#555' };
  let s = 0;
  if (pwd.length >= 8)            s++;
  if (pwd.length >= 12)           s++;
  if (pwd.length >= 16)           s++;
  if (/[A-Z]/.test(pwd))         s++;
  if (/[a-z]/.test(pwd))         s++;
  if (/[0-9]/.test(pwd))         s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  if (s <= 2) return { score: s, label: 'Weak',   color: '#C84F4F' };
  if (s <= 4) return { score: s, label: 'Fair',   color: '#C8A04F' };
  if (s <= 5) return { score: s, label: 'Good',   color: '#7EB8C8' };
             return { score: s, label: 'Strong', color: '#6BAF7A' };
}

// ─── Strength bar ─────────────────────────────────────────────────────────────
const StrengthBar = memo(({ score, color, bg }: { score: number; color: string; bg: string }) => (
  <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
    {Array.from({ length: 7 }).map((_, i) => (
      <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < score ? color : bg }} />
    ))}
  </View>
));

// ─── Tab bar ─────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'security' | 'reused' | 'emails';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',  label: 'Overview',  icon: '◈' },
  { key: 'security',  label: 'Security',  icon: '🔐' },
  { key: 'reused',    label: 'Reused',    icon: '♻' },
  { key: 'emails',    label: 'Emails',    icon: '✉' },
];

// ─── Section header ───────────────────────────────────────────────────────────
function SectionTitle({ label, accent }: { label: string; accent: string }) {
  return (
    <Text style={[ti.txt, { color: accent }]}>{label}</Text>
  );
}
const ti = StyleSheet.create({
  txt: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12, marginTop: 4 },
});

// ─── Overview tab ─────────────────────────────────────────────────────────────
const OverviewTab = memo(({ passwords, colors }: { passwords: Password[]; colors: any }) => {
  const stats = useMemo(() => {
    const total   = passwords.length;
    const withPwd = passwords.filter(p => p.password);
    const scores  = withPwd.map(p => scorePassword(p.password).score);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const weak    = withPwd.filter(p => scorePassword(p.password).score <= 2).length;
    const hidden  = passwords.filter(p => p.isHidden).length;
    const withEmail = passwords.filter(p => p.email).length;
    const withUrl   = passwords.filter(p => p.url).length;
    const withPhone = passwords.filter(p => p.telefono).length;

    // Reused count
    const freq: Record<string, number> = {};
    for (const p of passwords) {
      if (p.password) freq[p.password] = (freq[p.password] ?? 0) + 1;
    }
    const reused = Object.values(freq).filter(c => c > 1).reduce((a, b) => a + b, 0);

    return { total, avgScore, weak, hidden, withEmail, withUrl, withPhone, reused };
  }, [passwords]);

  const avgStrength = scorePassword('x'.repeat(stats.avgScore > 0 ? stats.avgScore * 2 : 0));

  const statCards = [
    { label: 'Total',   value: stats.total,   color: colors.accent },
    { label: 'Weak',    value: stats.weak,    color: stats.weak   > 0 ? '#C84F4F' : '#6BAF7A' },
    { label: 'Reused',  value: stats.reused,  color: stats.reused > 0 ? '#C84F4F' : '#6BAF7A' },
    { label: 'Hidden',  value: stats.hidden,  color: colors.subtext },
  ];

  const coverage = [
    { label: 'With email',   value: stats.withEmail,  icon: '✉' },
    { label: 'With URL',     value: stats.withUrl,    icon: '🔗' },
    { label: 'With phone',   value: stats.withPhone,  icon: '📞' },
  ];

  return (
    <ScrollView contentContainerStyle={ov.scroll} showsVerticalScrollIndicator={false}>
      {/* Stat cards */}
      <View style={ov.grid}>
        {statCards.map(c => (
          <View key={c.label} style={[ov.card, { backgroundColor: colors.card }]}>
            <Text style={[ov.val, { color: c.color }]}>{c.value}</Text>
            <Text style={[ov.lbl, { color: colors.subtext }]}>{c.label}</Text>
          </View>
        ))}
      </View>

      {/* Average strength */}
      <SectionTitle label="Average strength" accent={colors.accent} />
      <View style={[ov.strengthCard, { backgroundColor: colors.card }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[ov.strengthLabel, { color: colors.text }]}>
            {passwords.filter(p => p.password).length} passwords analysed
          </Text>
          <View style={[ov.badge, { backgroundColor: avgStrength.color + '18', borderColor: avgStrength.color + '44' }]}>
            <Text style={[ov.badgeTxt, { color: avgStrength.color }]}>
              {passwords.filter(p => p.password).length > 0 ? avgStrength.label : 'N/A'}
            </Text>
          </View>
        </View>
        <StrengthBar score={stats.avgScore} color={avgStrength.color} bg={colors.background} />
      </View>

      {/* Coverage */}
      <SectionTitle label="Coverage" accent={colors.accent} />
      <View style={[ov.coverageCard, { backgroundColor: colors.card }]}>
        {coverage.map(c => (
          <View key={c.label} style={ov.coverageRow}>
            <Text style={ov.coverageIcon}>{c.icon}</Text>
            <Text style={[ov.coverageLabel, { color: colors.text }]}>{c.label}</Text>
            <Text style={[ov.coverageVal, { color: colors.accent }]}>
              {c.value} / {stats.total}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
});

const ov = StyleSheet.create({
  scroll:        { padding: 20, paddingBottom: 60 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  card:          { flex: 1, minWidth: '42%', borderRadius: 16, padding: 18, alignItems: 'center', gap: 4 },
  val:           { fontSize: 30, fontWeight: '800' },
  lbl:           { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  strengthCard:  { borderRadius: 14, padding: 16, gap: 6, marginBottom: 28 },
  strengthLabel: { fontSize: 13, fontWeight: '600' },
  badge:         { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt:      { fontSize: 12, fontWeight: '700' },
  coverageCard:  { borderRadius: 14, overflow: 'hidden', marginBottom: 28 },
  coverageRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  coverageIcon:  { fontSize: 16, width: 24, textAlign: 'center' },
  coverageLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  coverageVal:   { fontSize: 14, fontWeight: '700' },
});

// ─── Security tab — virtualised FlatList for performance ──────────────────────
type ScoredPassword = Password & { strength: { score: number; label: string; color: string } };

const SecurityRow = memo(({ item, colors }: { item: ScoredPassword; colors: any }) => {
  const [shown, setShown] = useState(false);
  return (
    <View style={[sec.row, { backgroundColor: colors.card }]}>
      <View style={{ flex: 1 }}>
        <Text style={[sec.site, { color: colors.text }]} numberOfLines={1}>{item.label || 'Unknown'}</Text>
        {!!item.username && <Text style={[sec.user, { color: colors.subtext }]} numberOfLines={1}>{item.username}</Text>}
        {/* Password value — tappable to reveal */}
        <TouchableOpacity onPress={() => setShown(v => !v)} activeOpacity={0.7} style={sec.pwdRow}>
          <Text style={[sec.pwd, { color: shown ? colors.text : colors.subtext }]} numberOfLines={1}>
            {shown ? item.password : '••••••••'}
          </Text>
          <Text style={[sec.eye, { color: colors.subtext }]}>{shown ? '🙈' : '👁'}</Text>
        </TouchableOpacity>
        <StrengthBar score={item.strength.score} color={item.strength.color} bg={colors.background} />
      </View>
      <View style={[sec.badge, { backgroundColor: item.strength.color + '18', borderColor: item.strength.color + '44' }]}>
        <Text style={[sec.badgeTxt, { color: item.strength.color }]}>{item.strength.label}</Text>
      </View>
    </View>
  );
});

const SecurityTab = memo(({ passwords, colors }: { passwords: Password[]; colors: any }) => {
  const [filter, setFilter] = useState<string | null>(null);
  const FILTERS = ['Weak', 'Fair', 'Good', 'Strong'];

  const scored: ScoredPassword[] = useMemo(() =>
    passwords
      .filter(p => p.password)
      .map(p => ({ ...p, strength: scorePassword(p.password) }))
      .sort((a, b) => a.strength.score - b.strength.score),
    [passwords]
  );

  const displayed = useMemo(() =>
    filter ? scored.filter(p => p.strength.label === filter) : scored,
    [scored, filter]
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={sec.chips} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={[sec.chip, { backgroundColor: filter === null ? colors.accent : colors.card }]}
          onPress={() => setFilter(null)}
        >
          <Text style={[sec.chipTxt, { color: filter === null ? colors.background : colors.subtext }]}>All ({scored.length})</Text>
        </TouchableOpacity>
        {FILTERS.map(f => {
          const count = scored.filter(p => p.strength.label === f).length;
          const fcolor = scorePassword('x'.repeat(f === 'Weak' ? 2 : f === 'Fair' ? 6 : f === 'Good' ? 10 : 14)).color;
          return (
            <TouchableOpacity
              key={f}
              style={[sec.chip, { backgroundColor: filter === f ? fcolor + '22' : colors.card, borderColor: filter === f ? fcolor + '66' : 'transparent', borderWidth: 1 }]}
              onPress={() => setFilter(f === filter ? null : f)}
            >
              <Text style={[sec.chipTxt, { color: filter === f ? fcolor : colors.subtext }]}>{f} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {displayed.length === 0 ? (
        <View style={sec.empty}>
          <Text style={[sec.emptyTxt, { color: colors.subtext }]}>No passwords match this filter.</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <SecurityRow item={item} colors={colors} />}
          contentContainerStyle={sec.list}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
        />
      )}
    </View>
  );
});

const sec = StyleSheet.create({
  chips:   { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  chip:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  chipTxt: { fontSize: 12, fontWeight: '700' },
  list:    { paddingHorizontal: 16, paddingBottom: 60 },
  row:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  site:    { fontSize: 14, fontWeight: '600' },
  user:    { fontSize: 12, marginTop: 1 },
  pwdRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pwd:     { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
  eye:     { fontSize: 13 },
  badge:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  badgeTxt:{ fontSize: 11, fontWeight: '700' },
  empty:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTxt:{ fontSize: 14, fontStyle: 'italic' },
});

// ─── Reused card (own state for reveal toggle) ────────────────────────────────
function ReusedCard({ pwd, count, sites, colors }: {
  pwd: string; count: number; sites: string[]; colors: any;
}) {
  const [shown, setShown] = useState(false);
  return (
    <View style={[ru.row, { backgroundColor: colors.card }]}>
      <View style={{ flex: 1, gap: 6 }}>
        <TouchableOpacity onPress={() => setShown(v => !v)} activeOpacity={0.7} style={ru.pwdRow}>
          <Text style={[ru.pwd, { color: shown ? colors.text : colors.subtext }]} numberOfLines={1}>
            {shown ? pwd : '••••••••'}
          </Text>
          <Text style={[ru.eye, { color: colors.subtext }]}>{shown ? '🙈' : '👁'}</Text>
        </TouchableOpacity>
        <View style={{ gap: 3 }}>
          {sites.map((site, i) => (
            <Text key={i} style={[ru.site, { color: colors.subtext }]}>· {site}</Text>
          ))}
        </View>
      </View>
      <View style={[ru.badge, { backgroundColor: '#C84F4F11', borderColor: '#C84F4F44' }]}>
        <Text style={{ color: '#C84F4F', fontWeight: '800', fontSize: 16 }}>×{count}</Text>
        <Text style={{ color: '#C84F4F', fontSize: 10, fontWeight: '600' }}>uses</Text>
      </View>
    </View>
  );
}

// ─── Reused tab ───────────────────────────────────────────────────────────────
const ReusedTab = memo(({ passwords, colors }: { passwords: Password[]; colors: any }) => {
  const reused = useMemo(() => {
    const freq: Record<string, { count: number; sites: string[] }> = {};
    for (const p of passwords) {
      if (!p.password) continue;
      if (!freq[p.password]) freq[p.password] = { count: 0, sites: [] };
      freq[p.password].count++;
      freq[p.password].sites.push(p.label || p.url || 'Unknown');
    }
    return Object.entries(freq)
      .filter(([, v]) => v.count > 1)
      .sort((a, b) => b[1].count - a[1].count);
  }, [passwords]);

  if (reused.length === 0) {
    return (
      <View style={ru.centered}>
        <Text style={ru.icon}>✅</Text>
        <Text style={[ru.goodTitle, { color: colors.text }]}>No reused passwords</Text>
        <Text style={[ru.goodSub, { color: colors.subtext }]}>
          Each password is unique — great security hygiene!
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={reused}
      keyExtractor={([pwd]) => pwd}
      contentContainerStyle={ru.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={[ru.warningBanner, { backgroundColor: '#C84F4F11', borderColor: '#C84F4F33' }]}>
          <Text style={{ color: '#C84F4F', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
            {reused.length} password{reused.length !== 1 ? 's' : ''} used on multiple sites
          </Text>
        </View>
      }
      renderItem={({ item: [pwd, { count, sites }] }) => {
        // Each card manages its own revealed state
        return <ReusedCard pwd={pwd} count={count} sites={sites} colors={colors} />;
      }}
    />
  );
});

const ru = StyleSheet.create({
  list:          { padding: 16, paddingBottom: 60 },
  centered:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 60 },
  icon:          { fontSize: 52 },
  goodTitle:     { fontSize: 18, fontWeight: '700' },
  goodSub:       { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  warningBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  row:           { borderRadius: 14, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pwdRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pwd:           { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
  eye:           { fontSize: 13 },
  site:          { fontSize: 13 },
  badge:         { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', minWidth: 52 },
});

// ─── Emails tab ───────────────────────────────────────────────────────────────
function EmailRow({ email, sites, colors }: { email: string; sites: string[]; colors: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[em.wrap, { backgroundColor: colors.card }]}>
      <TouchableOpacity style={em.header} onPress={() => setOpen(v => !v)} activeOpacity={0.7}>
        <View style={[em.iconWrap, { backgroundColor: colors.accent + '18' }]}>
          <Text style={[em.iconTxt, { color: colors.accent }]}>✉</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[em.email, { color: colors.text }]} numberOfLines={1}>{email}</Text>
          <Text style={[em.count, { color: colors.subtext }]}>{sites.length} site{sites.length !== 1 ? 's' : ''}</Text>
        </View>
        <Text style={[em.chevron, { color: colors.subtext }]}>{open ? '⌄' : '›'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={[em.list, { borderTopColor: colors.background }]}>
          {sites.map((site, i) => (
            <Text key={i} style={[em.site, { color: colors.subtext }]}>· {site}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const EmailsTab = memo(({ passwords, colors }: { passwords: Password[]; colors: any }) => {
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const p of passwords) {
      const e = (p.email ?? '').trim().toLowerCase();
      if (!e) continue;
      if (!g[e]) g[e] = [];
      g[e].push(p.label || p.url || 'Unknown');
    }
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [passwords]);

  if (groups.length === 0) {
    return (
      <View style={em.centered}>
        <Text style={em.bigIcon}>✉</Text>
        <Text style={[em.emptyTxt, { color: colors.subtext }]}>No email addresses saved yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={groups}
      keyExtractor={([email]) => email}
      contentContainerStyle={em.listContent}
      showsVerticalScrollIndicator={false}
      renderItem={({ item: [email, sites] }) => (
        <EmailRow email={email} sites={sites} colors={colors} />
      )}
    />
  );
});

const em = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 60 },
  wrap:        { borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  iconWrap:    { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  iconTxt:     { fontSize: 15 },
  email:       { fontSize: 14, fontWeight: '600' },
  count:       { fontSize: 12, marginTop: 2 },
  chevron:     { fontSize: 18 },
  list:        { paddingHorizontal: 14, paddingBottom: 12, gap: 4, borderTopWidth: 1 },
  site:        { fontSize: 13, paddingTop: 6 },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 60 },
  bigIcon:     { fontSize: 40 },
  emptyTxt:    { fontSize: 14, fontStyle: 'italic' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Stats() {
  const router = useRouter();
  const { colors } = useTheme();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Load passwords once — all computation happens in each tab's own useMemo
  const passwords = useMemo(() => getUserById(userId)?.passwords ?? [], [userId]);

  const renderTab = useCallback(() => {
    switch (activeTab) {
      case 'overview': return <OverviewTab passwords={passwords} colors={colors} />;
      case 'security': return <SecurityTab passwords={passwords} colors={colors} />;
      case 'reused':   return <ReusedTab   passwords={passwords} colors={colors} />;
      case 'emails':   return <EmailsTab   passwords={passwords} colors={colors} />;
    }
  }, [activeTab, passwords, colors]);

  return (
    <View style={[main.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[main.header, { borderColor: colors.card }]}>
        <TouchableOpacity style={[main.backBtn, { backgroundColor: colors.card }]} onPress={() => router.back()}>
          <Text style={[main.backTxt, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[main.title, { color: colors.text }]}>Statistics</Text>
        <View style={main.backBtn} />
      </View>

      {/* Tab bar */}
      <View style={[main.tabBar, { backgroundColor: colors.card, borderColor: colors.background }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[main.tab, active && { backgroundColor: colors.accent + '22', borderRadius: 12 }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[main.tabIcon, { opacity: active ? 1 : 0.5 }]}>{tab.icon}</Text>
              <Text style={[main.tabLabel, { color: active ? colors.accent : colors.subtext, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {renderTab()}
      </View>
    </View>
  );
}

const main = StyleSheet.create({
  root:     { flex: 1 },
  header:   { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'android' ? 44 : 56, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 4 },
  backBtn:  { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  backTxt:  { fontSize: 18 },
  title:    { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  tabBar:   { flexDirection: 'row', margin: 12, borderRadius: 16, padding: 6, gap: 2, borderWidth: 1 },
  tab:      { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 3 },
  tabIcon:  { fontSize: 16 },
  tabLabel: { fontSize: 10, letterSpacing: 0.3 },
});