import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getAllUsers } from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { User } from '@/constants/types';

type AppState = 'loading' | 'no_users' | 'has_users';

function roleLabel(role: User['role']): string {
  if (role === 'masterAdmin') return 'Master Admin';
  if (role === 'admin') return 'Admin';
  return 'User';
}

export default function Index() {
  const router = useRouter();
  const { colors } = useTheme();
  const [appState, setAppState] = useState<AppState>('loading');
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    // Storage is already initialized synchronously in _layout.tsx module scope,
    // so getAllUsers() is safe to call here.
    try {
      const saved = getAllUsers();
      if (saved.length === 0) {
        setAppState('no_users');
      } else {
        setUsers(saved);
        setAppState('has_users');
      }
    } catch {
      // Should not happen since _layout init is synchronous, but guard anyway
      setAppState('no_users');
    }
  }, []);

  useEffect(() => {
    if (appState === 'no_users') {
      router.replace('/CreateUser');
    }
  }, [appState]);

  if (appState === 'loading' || appState === 'no_users') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  function roleColor(role: User['role']): string {
    if (role === 'masterAdmin') return colors.accent;
    if (role === 'admin') return '#7EB8C8';
    return colors.subtext;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.accent }]}>LocalKey</Text>
        <Text style={[styles.subtitle, { color: colors.subtext }]}>Select your account</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={u => u.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.card }]} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userCard}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: '/Login', params: { userId: item.id } })}
          >
            <View style={[styles.avatar, { borderColor: roleColor(item.role), backgroundColor: colors.card }]}>
              <Text style={[styles.avatarText, { color: roleColor(item.role) }]}>
                {item.username.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.username, { color: colors.text }]}>{item.username}</Text>
              <Text style={[styles.role, { color: roleColor(item.role) }]}>{roleLabel(item.role)}</Text>
            </View>
            <Text style={[styles.arrow, { color: colors.subtext }]}>›</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={[styles.createButton, { borderColor: colors.card }]}
        onPress={() => router.push('/CreateUser')}
        activeOpacity={0.8}
      >
        <Text style={[styles.createButtonText, { color: colors.subtext }]}>+ Create another user</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centered:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container:         { flex: 1, paddingTop: Platform.OS === 'android' ? 52 : 64, paddingBottom: 48 },
  header:            { paddingHorizontal: 32, marginBottom: 36, gap: 6 },
  title:             { fontSize: 42, fontWeight: '700', letterSpacing: -1 },
  subtitle:          { fontSize: 15, letterSpacing: 0.3 },
  listContent:       { paddingHorizontal: 24 },
  separator:         { height: 1, marginHorizontal: 8 },
  userCard:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8, gap: 16 },
  avatar:            { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  avatarText:        { fontSize: 20, fontWeight: '600' },
  userInfo:          { flex: 1, gap: 3 },
  username:          { fontSize: 16, fontWeight: '600' },
  role:              { fontSize: 12, fontWeight: '500', letterSpacing: 0.3 },
  arrow:             { fontSize: 24 },
  createButton:      { marginHorizontal: 24, marginTop: 24, borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  createButtonText:  { fontSize: 15, fontWeight: '500' },
});