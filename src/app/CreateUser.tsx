import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { createUser, getAllUsers, hasMasterAdmin, saveUser } from '@/components/Encrypt';
import { useTheme } from '@/components/ThemeContext';
import { UserRole } from '@/constants/types';

export default function CreateUser() {
  const router = useRouter();
  const { colors } = useTheme();

  const isFirstUser = !hasMasterAdmin();

  const [username,        setUsername]        = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isAdmin,         setIsAdmin]         = useState(false);
  const [showPassword,    setShowPassword]    = useState(false);

  useEffect(() => { if (isFirstUser) setIsAdmin(false); }, [isFirstUser]);

  const role: UserRole = isFirstUser ? 'masterAdmin' : isAdmin ? 'admin' : 'user';

  function roleLabel(r: UserRole): string {
    if (r === 'masterAdmin') return 'Master Admin';
    if (r === 'admin') return 'Admin';
    return 'User';
  }

  function roleBadgeColor(r: UserRole) {
    if (r === 'masterAdmin') return { backgroundColor: colors.accent + '22', borderColor: colors.accent };
    if (r === 'admin')       return { backgroundColor: '#7EB8C822',           borderColor: '#7EB8C8'     };
    return                          { backgroundColor: colors.subtext + '22', borderColor: colors.subtext };
  }

  function validate(): string | null {
    if (!username.trim()) return 'Username cannot be empty.';
    const dup = getAllUsers().some(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (dup) return 'A user with this username already exists.';
    if (password && password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  function handleCreate() {
    const error = validate();
    if (error) { Alert.alert('Cannot create user', error); return; }
    const newUser = createUser(username.trim(), password, role);
    saveUser(newUser);
    Alert.alert('User created', `${roleLabel(role)} "${newUser.username}" has been created.`, [
      { text: 'OK', onPress: () => router.replace('/') },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          {!isFirstUser && (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={[styles.backText, { color: colors.accent }]}>← Back</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.title, { color: colors.text }]}>
            {isFirstUser ? 'Welcome to LocalKey' : 'New user'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.subtext }]}>
            {isFirstUser ? 'Set up your Master Admin account to get started.' : 'Fill in the details to create a new account.'}
          </Text>
        </View>

        <View style={[styles.roleBadge, roleBadgeColor(role)]}>
          <Text style={[styles.roleBadgeText, { color: colors.text }]}>{roleLabel(role)}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.subtext }]}>Username</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.card, color: colors.text }]}
              placeholder="e.g. emanuele"
              placeholderTextColor={colors.subtext}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.subtext }]}>
              Password <Text style={{ color: colors.subtext, fontWeight: '400' }}>(optional)</Text>
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputFlex, { backgroundColor: colors.card, borderColor: colors.card, color: colors.text }]}
                placeholder="Leave empty for no password"
                placeholderTextColor={colors.subtext}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(s => !s)}
                style={[styles.showToggle, { backgroundColor: colors.card, borderColor: colors.card }]}
              >
                <Text style={[styles.showToggleText, { color: colors.accent }]}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {password.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.subtext }]}>Confirm password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.card, color: colors.text }]}
                placeholder="Repeat your password"
                placeholderTextColor={colors.subtext}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {!isFirstUser && (
            <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.card }]}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: colors.text }]}>Admin privileges</Text>
                <Text style={[styles.toggleDescription, { color: colors.subtext }]}>
                  Admins can manage other users and passwords.
                </Text>
              </View>
              <Switch
                value={isAdmin}
                onValueChange={setIsAdmin}
                trackColor={{ false: '#333', true: colors.accent }}
                thumbColor={isAdmin ? colors.background : colors.subtext}
              />
            </View>
          )}
        </View>

        {isFirstUser && (
          <View style={[styles.infoBox, { backgroundColor: colors.accent + '11', borderColor: colors.accent + '44' }]}>
            <Text style={[styles.infoText, { color: colors.accent }]}>
              The Master Admin is unique — there can only be one. It has full control over the app including all other admin accounts.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.accent }]}
          onPress={handleCreate}
          activeOpacity={0.8}
        >
          <Text style={[styles.submitText, { color: colors.background }]}>
            {isFirstUser ? 'Set up LocalKey' : 'Create user'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:              { flex: 1 },
  container:         { flexGrow: 1, paddingHorizontal: 28, paddingTop: 80, paddingBottom: 48, gap: 28 },
  header:            { gap: 8 },
  backButton:        { marginBottom: 8 },
  backText:          { fontSize: 15 },
  title:             { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  subtitle:          { fontSize: 15, lineHeight: 22 },
  roleBadge:         { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  roleBadgeText:     { fontSize: 13, fontWeight: '600' },
  form:              { gap: 20 },
  fieldGroup:        { gap: 8 },
  label:             { fontSize: 13, fontWeight: '500', letterSpacing: 0.3 },
  input:             { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  inputRow:          { flexDirection: 'row', gap: 10, alignItems: 'center' },
  inputFlex:         { flex: 1 },
  showToggle:        { paddingHorizontal: 12, paddingVertical: 14, borderWidth: 1, borderRadius: 12 },
  showToggleText:    { fontSize: 13, fontWeight: '600' },
  toggleRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 16, gap: 16 },
  toggleInfo:        { flex: 1, gap: 3 },
  toggleLabel:       { fontSize: 15, fontWeight: '500' },
  toggleDescription: { fontSize: 13 },
  infoBox:           { borderWidth: 1, borderRadius: 12, padding: 16 },
  infoText:          { fontSize: 13, lineHeight: 20 },
  submitButton:      { borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  submitText:        { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});