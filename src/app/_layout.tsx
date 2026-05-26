import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';

// ─── CRITICAL: initialize storage synchronously at module load time ───────────
import { getStoredLanguage, initStorageBootstrap } from '@/components/Encrypt';
initStorageBootstrap();

// ─── i18n: init before first render, restore saved language ──────────────────
import '@/constants/i18n'; // side-effect: runs i18n.init()
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