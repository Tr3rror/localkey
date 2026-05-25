import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
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

  const fadeAnim = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.spring(fadeAnim, { toValue: 1, tension: 55, friction: 12, useNativeDriver: true }).start();
  }, []);

  useEffect(() => { if (isFirstUser) setIsAdmin(false); }, [isFirstUser]);

  const role: UserRole = isFirstUser ? 'masterAdmin' : isAdmin ? 'admin' : 'user';

  const roleColor =
    role === 'masterAdmin' ? colors.accent :
    role === 'admin'       ? '#7EB8C8'     : colors.subtext;

  const roleName =
    role === 'masterAdmin' ? 'Master Admin' :
    role === 'admin'       ? 'Admin'        : 'User';

  function validate(): string | null {
    if (!username.trim()) return 'Username cannot be empty.';
    const dup = getAllUsers().some(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (dup) return 'This username is already taken.';
    if (password && password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  function handleCreate() {
    const error = validate();
    if (error) { Alert.alert('Cannot create account', error); return; }
    const newUser = createUser(username.trim(), password.trim(), role);
    saveUser(newUser);
    Alert.alert(
      'Account created',
      `${roleName} "${newUser.username}" is ready.`,
      [{ text: 'Continue', onPress: () => router.replace('/') }],
    );
  }

  return (
    <KeyboardAvoidingView
      style={[st.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Back button */}
        {!isFirstUser && (
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <View style={[st.backBtnInner, { backgroundColor: colors.card }]}>
              <Text style={[st.backBtnTxt, { color: colors.text }]}>←</Text>
            </View>
          </TouchableOpacity>
        )}

        <Animated.View style={[st.content, { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }] }]}>

          {/* Header */}
          <View style={st.header}>
            <Text style={[st.title, { color: colors.text }]}>
              {isFirstUser ? 'Welcome to LocalKey' : 'New account'}
            </Text>
            <Text style={[st.subtitle, { color: colors.subtext }]}>
              {isFirstUser
                ? 'Create your master account to get started.'
                : 'Fill in the details below.'}
            </Text>
          </View>

          {/* Role badge */}
          <View style={[st.roleBadge, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}>
            <View style={[st.roleDot, { backgroundColor: roleColor }]} />
            <Text style={[st.roleLabel, { color: roleColor }]}>{roleName}</Text>
          </View>

          {/* Username */}
          <View style={st.fieldGroup}>
            <Text style={[st.fieldLabel, { color: colors.subtext }]}>Username</Text>
            <TextInput
              style={[st.input, { backgroundColor: colors.card, color: colors.text }]}
              placeholder="e.g. emanuele"
              placeholderTextColor={colors.subtext}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={st.fieldGroup}>
            <Text style={[st.fieldLabel, { color: colors.subtext }]}>
              Password{'  '}
              <Text style={{ fontWeight: '400', fontSize: 12 }}>(optional)</Text>
            </Text>
            <View style={[st.inputRow, { backgroundColor: colors.card }]}>
              <TextInput
                style={[st.inputFlex, { color: colors.text }]}
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
                style={[st.eyeBtn, { backgroundColor: colors.background }]}
              >
                <Text style={{ fontSize: 16 }}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm password */}
          {password.length > 0 && (
            <View style={st.fieldGroup}>
              <Text style={[st.fieldLabel, { color: colors.subtext }]}>Confirm password</Text>
              <TextInput
                style={[st.input, { backgroundColor: colors.card, color: colors.text,
                  borderColor: confirmPassword && confirmPassword !== password ? '#C84F4F55' : colors.card,
                  borderWidth: 1,
                }]}
                placeholder="Repeat your password"
                placeholderTextColor={colors.subtext}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <Text style={{ color: '#C84F4F', fontSize: 12, paddingLeft: 4 }}>Passwords don't match</Text>
              )}
            </View>
          )}

          {/* Admin toggle */}
          {!isFirstUser && (
            <View style={[st.toggleRow, { backgroundColor: colors.card }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.toggleLabel, { color: colors.text }]}>Admin privileges</Text>
                <Text style={[st.toggleSub, { color: colors.subtext }]}>
                  Can manage users and all passwords
                </Text>
              </View>
              <Switch
                value={isAdmin}
                onValueChange={setIsAdmin}
                trackColor={{ false: colors.subtext + '44', true: colors.accent }}
                thumbColor={isAdmin ? colors.background : colors.subtext}
              />
            </View>
          )}

          {/* Master admin info box */}
          {isFirstUser && (
            <View style={[st.infoBox, { backgroundColor: colors.accent + '11', borderColor: colors.accent + '44' }]}>
              <Text style={st.infoIcon}>🔑</Text>
              <Text style={[st.infoText, { color: colors.accent }]}>
                The Master Admin is unique and has full control over all accounts and settings.
              </Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[st.submitBtn, { backgroundColor: colors.accent }]}
            onPress={handleCreate}
            activeOpacity={0.82}
          >
            <Text style={[st.submitTxt, { color: colors.background }]}>
              {isFirstUser ? 'Set up LocalKey' : 'Create account'}
            </Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  flex:        { flex: 1 },
  scroll:      { flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 52 : 70, paddingBottom: 52 },
  content:     { gap: 22 },
  backBtn:     { marginBottom: 8 },
  backBtnInner:{ width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  backBtnTxt:  { fontSize: 18 },
  header:      { gap: 8, marginBottom: 4 },
  title:       { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  subtitle:    { fontSize: 15, lineHeight: 22 },

  roleBadge:   { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  roleDot:     { width: 8, height: 8, borderRadius: 4 },
  roleLabel:   { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },

  fieldGroup:  { gap: 8 },
  fieldLabel:  { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingLeft: 4 },
  input:       { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingLeft: 16, paddingRight: 8, paddingVertical: 6, gap: 8 },
  inputFlex:   { flex: 1, fontSize: 15, paddingVertical: 9 },
  eyeBtn:      { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  toggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 16, gap: 16 },
  toggleLabel: { fontSize: 15, fontWeight: '600' },
  toggleSub:   { fontSize: 12, marginTop: 2 },

  infoBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 14, padding: 16 },
  infoIcon:    { fontSize: 20, lineHeight: 22 },
  infoText:    { fontSize: 13, lineHeight: 20, flex: 1 },

  submitBtn:   { borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  submitTxt:   { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});