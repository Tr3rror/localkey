import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { NativeModules, Platform, useColorScheme } from 'react-native';

// ─── CRITICAL: initialize storage synchronously at module load time ───────────
import { getStoredLanguage, initStorageBootstrap, setStoredLanguage } from '@/components/Encrypt';
initStorageBootstrap();

// ─── i18n: init before first render ──────────────────────────────────────────
import '@/constants/i18n';
import i18n from '@/constants/i18n';

// Restore or auto-detect language
const savedLang = getStoredLanguage();
if (savedLang) {
  // User has previously chosen or first-launch has already set a language
  if (savedLang !== i18n.language) i18n.changeLanguage(savedLang);
} else {
  // Truly first launch before ThemeContext has run: detect locale now
  try {
    let locale = 'en';
    if (Platform.OS === 'ios') {
      locale =
        NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
        'en';
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier || 'en';
    }
    const lang = locale.slice(0, 2).toLowerCase() === 'it' ? 'it' : 'en';
    setStoredLanguage(lang);
    i18n.changeLanguage(lang);
  } catch {
    // fallback to Italian as default (app is Italian-first)
    i18n.changeLanguage('it');
  }
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