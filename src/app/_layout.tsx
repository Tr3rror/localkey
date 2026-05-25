import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';

// ─── CRITICAL: initialize storage synchronously at module load time ───────────
// If we put this in useEffect, it runs AFTER the first render, which means
// index.tsx's useEffect may fire before storage is ready → getAllUsers()
// throws → always redirects to CreateUser.
// Calling it here at module scope runs it immediately when the JS bundle loads.
import { initStorageBootstrap } from '@/components/Encrypt';
initStorageBootstrap();

// Initialize i18n and restore saved language preference
import { getStoredLanguage } from '@/components/Encrypt';
import '@/constants/i18n';
import i18n from '@/constants/i18n';
const savedLang = getStoredLanguage();
if (savedLang && savedLang !== i18n.language) {
  i18n.changeLanguage(savedLang);
}

import { AppThemeProvider } from '@/components/ThemeContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppThemeProvider>
      <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="CreateUser" />
          <Stack.Screen name="Login" />
          <Stack.Screen name="Home" />
          <Stack.Screen name="Settings" />
          <Stack.Screen name="stats" />
        </Stack>
      </NavThemeProvider>
    </AppThemeProvider>
  );
}