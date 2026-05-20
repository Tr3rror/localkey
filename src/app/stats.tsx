import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

import { getUserById } from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';

// ─── Password strength ────────────────────────────────────────────────────────
function scorePassword(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: 'None', color: '#555' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (pwd.length >= 16) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 2) return { score, label: 'Weak',   color: '#C84F4F' };
  if (score <= 4) return { score, label: 'Fair',   color: '#C8A04F' };
  if (score <= 5) return { score, label: 'Good',   color: '#7EB8C8' };
                  return { score, label: 'Strong', color: '#6BAF7A' };
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent: string }) {
  return (
    <View style={ss.section}>
      <Text style={[ss.sectionTitle, { color: accent }]}>{title}</Text>
      {children}
    </View>
  );
}
const ss = StyleSheet.create({
  section:      { marginBottom: 28 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
});

// ─── Email group item ─────────────────────────────────────────────────────────
function EmailGroup({ email, sites, colors }: {
  email: string; sites: string[];
  colors: { card: string; text: string; subtext: string; accent: string; background: string };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[eg.wrap, { backgroundColor: colors.card }]}>
      <TouchableOpacity style={eg.header} onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={[eg.email, { color: colors.text }]}>{email}</Text>
          <Text style={[eg.count, { color: colors.subtext }]}>{sites.length} site{sites.length !== 1 ? 's' : ''}</Text>
        </View>
        <Text style={[eg.chevron, { color: colors.subtext }]}>{expanded ? '⌄' : '›'}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={[eg.list, { borderTopColor: colors.background }]}>
          {sites.map((site, i) => (
            <Text key={i} style={[eg.site, { color: colors.subtext }]}>· {site}</Text>
          ))}
        </View>
      )}
    </View>
  );
}
const eg = StyleSheet.create({
  wrap:    { borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  header:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  email:   { fontSize: 14, fontWeight: '600' },
  count:   { fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 18 },
  list:    { paddingHorizontal: 14, paddingBottom: 12, gap: 4, borderTopWidth: 1 },
  site:    { fontSize: 13, paddingTop: 6 },
});

// ─── Strength bar ─────────────────────────────────────────────────────────────
function StrengthBar({ score, color, background }: { score: number; color: string; background: string }) {
  const max = 7;
  return (
    <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
      {Array.from({ length: max }).map((_, i) => (
        <View key={i} style={{
          flex: 1, height: 4, borderRadius: 2,
          backgroundColor: i < score ? color : background,
        }} />
      ))}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Stats() {
  const router = useRouter();
  const { colors } = useTheme();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const passwords = useMemo(() => getUserById(userId)?.passwords ?? [], [userId]);

  // ── Most used passwords ───────────────────────────────────────────────────
  const mostUsed = useMemo(() => {
    const freq: Record<string, { count: number; sites: string[] }> = {};
    for (const p of passwords) {
      if (!p.password) continue;
      if (!freq[p.password]) freq[p.password] = { count: 0, sites: [] };
      freq[p.password].count++;
      freq[p.password].sites.push(p.label || p.url || 'Unknown');
    }
    return Object.entries(freq)
      .filter(([, v]) => v.count > 1)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
  }, [passwords]);

  // ── Email groups ──────────────────────────────────────────────────────────
  const emailGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const p of passwords) {
      const email = (p.email ?? '').trim().toLowerCase();
      if (!email) continue;
      if (!groups[email]) groups[email] = [];
      groups[email].push(p.label || p.url || 'Unknown');
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [passwords]);

  // ── Security overview ─────────────────────────────────────────────────────
  const security = useMemo(() => {
    return passwords
      .filter(p => p.password)
      .map(p => ({ ...p, strength: scorePassword(p.password) }))
      .sort((a, b) => a.strength.score - b.strength.score);
  }, [passwords]);

  const avgScore = security.length
    ? Math.round(security.reduce((s, p) => s + p.strength.score, 0) / security.length)
    : 0;
  const avgStrength = scorePassword('x'.repeat(avgScore > 0 ? avgScore * 2 : 0));

  // ── Summary stats ─────────────────────────────────────────────────────────
  const total     = passwords.length;
  const withEmail = passwords.filter(p => p.email).length;
  const hidden    = passwords.filter(p => p.isHidden).length;
  const reused    = mostUsed.reduce((s, [, v]) => s + v.count, 0);
  const weak      = security.filter(p => p.strength.label === 'Weak').length;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { borderColor: colors.card }]}>
        <TouchableOpacity style={st.headerBtn} onPress={() => router.back()}>
          <Text style={[st.headerBtnTxt, { color: colors.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>Statistics</Text>
        <View style={st.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Summary cards ── */}
        <View style={st.summaryGrid}>
          {[
            { label: 'Total', value: total, color: colors.accent },
            { label: 'Reused', value: reused, color: reused > 0 ? '#C84F4F' : '#6BAF7A' },
            { label: 'Weak', value: weak, color: weak > 0 ? '#C84F4F' : '#6BAF7A' },
            { label: 'Hidden', value: hidden, color: colors.subtext },
          ].map(item => (
            <View key={item.label} style={[st.summaryCard, { backgroundColor: colors.card }]}>
              <Text style={[st.summaryValue, { color: item.color }]}>{item.value}</Text>
              <Text style={[st.summaryLabel, { color: colors.subtext }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Overall security ── */}
        <Section title="Overall security" accent={colors.accent}>
          <View style={[st.overallCard, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[st.overallLabel, { color: colors.text }]}>Average strength</Text>
              <Text style={[st.overallBadge, { color: avgStrength.color, borderColor: avgStrength.color + '44', backgroundColor: avgStrength.color + '11' }]}>
                {security.length > 0 ? avgStrength.label : 'N/A'}
              </Text>
            </View>
            <StrengthBar score={avgScore} color={avgStrength.color} background={colors.background} />
            <Text style={[st.overallSub, { color: colors.subtext }]}>
              Based on {security.length} password{security.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </Section>

        {/* ── Password security list ── */}
        <Section title="Password security" accent={colors.accent}>
          {security.length === 0 ? (
            <Text style={[st.empty, { color: colors.subtext }]}>No passwords saved yet.</Text>
          ) : security.map(p => {
            const { score, label, color } = p.strength;
            return (
              <View key={p.id} style={[st.secRow, { backgroundColor: colors.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.secSite, { color: colors.text }]}>{p.label || 'Unknown'}</Text>
                  {!!p.username && <Text style={[st.secUser, { color: colors.subtext }]}>{p.username}</Text>}
                  <StrengthBar score={score} color={color} background={colors.background} />
                </View>
                <View style={[st.secBadge, { backgroundColor: color + '11', borderColor: color + '44' }]}>
                  <Text style={[st.secBadgeTxt, { color }]}>{label}</Text>
                </View>
              </View>
            );
          })}
        </Section>

        {/* ── Reused passwords ── */}
        <Section title="Reused passwords" accent={colors.accent}>
          {mostUsed.length === 0 ? (
            <View style={[st.greenCard, { backgroundColor: '#6BAF7A11', borderColor: '#6BAF7A44' }]}>
              <Text style={[st.greenTxt, { color: '#6BAF7A' }]}>✓ No reused passwords — great job!</Text>
            </View>
          ) : mostUsed.map(([pwd, { count, sites }], i) => (
            <View key={i} style={[st.reuseRow, { backgroundColor: colors.card }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.reusePwd, { color: colors.text }]}>{'•'.repeat(Math.min(pwd.length, 12))}</Text>
                <Text style={[st.reuseSites, { color: colors.subtext }]}>Used on: {sites.join(', ')}</Text>
              </View>
              <View style={[st.reuseBadge, { backgroundColor: '#C84F4F11', borderColor: '#C84F4F44' }]}>
                <Text style={{ color: '#C84F4F', fontWeight: '700', fontSize: 13 }}>×{count}</Text>
              </View>
            </View>
          ))}
        </Section>

        {/* ── Email groups ── */}
        <Section title="Emails" accent={colors.accent}>
          {emailGroups.length === 0 ? (
            <Text style={[st.empty, { color: colors.subtext }]}>No email addresses saved yet.</Text>
          ) : emailGroups.map(([email, sites]) => (
            <EmailGroup key={email} email={email} sites={sites} colors={colors} />
          ))}
        </Section>

      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'android' ? 44 : 54, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBtn:     { width: 40, justifyContent: 'center', alignItems: 'center' },
  headerBtnTxt:  { fontSize: 22 },
  headerTitle:   { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  scroll:        { padding: 20, paddingBottom: 60 },

  summaryGrid:   { flexDirection: 'row', gap: 10, marginBottom: 28 },
  summaryCard:   { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
  summaryValue:  { fontSize: 26, fontWeight: '800' },
  summaryLabel:  { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  overallCard:   { borderRadius: 12, padding: 16, gap: 6 },
  overallLabel:  { fontSize: 15, fontWeight: '600' },
  overallBadge:  { fontSize: 12, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  overallSub:    { fontSize: 12, marginTop: 4 },

  secRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  secSite:       { fontSize: 14, fontWeight: '600' },
  secUser:       { fontSize: 12, marginTop: 1 },
  secBadge:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  secBadgeTxt:   { fontSize: 11, fontWeight: '700' },

  reuseRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  reusePwd:      { fontSize: 14, fontWeight: '600', letterSpacing: 2 },
  reuseSites:    { fontSize: 12, marginTop: 2 },
  reuseBadge:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },

  greenCard:     { borderWidth: 1, borderRadius: 12, padding: 14 },
  greenTxt:      { fontSize: 14, fontWeight: '600' },

  empty:         { fontSize: 14, fontStyle: 'italic' },
});