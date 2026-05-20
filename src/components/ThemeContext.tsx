/**
 * ThemeContext
 * Place at: src/components/ThemeContext.tsx
 *
 * Theme hierarchy:
 *   - MasterAdmin's theme  → global app theme (index, Login, CreateUser, etc.)
 *   - Other users' theme   → only their Home/Settings session
 *   - If no user logged in → DEFAULT_THEME
 */

import { DEFAULT_THEME, ThemeColors, ThemeSlot } from '@/constants/types';
import React, {
    createContext, useCallback, useContext, useEffect, useState,
} from 'react';

// ─── Lazy storage access ──────────────────────────────────────────────────────
// Storage may not be initialized when ThemeProvider mounts (bootstrap phase),
// so we always wrap in try/catch.
function safeStorage() {
  try {
    const { getStorage } = require('@/components/Encrypt');
    return getStorage() as ReturnType<typeof import('react-native-mmkv').createMMKV>;
  } catch {
    return null;
  }
}

// ─── Storage keys ─────────────────────────────────────────────────────────────
// Global theme (MasterAdmin) — used by all screens
const THEME_GLOBAL_KEY = 'theme_global';
// Per-user theme key — used only while that user is active
function themeUserKey(userId: string) { return `theme_user_${userId}`; }
// Slots are per-user too
function slotsUserKey(userId: string) { return `theme_slots_${userId}`; }

const MAX_SLOTS = 5;

// ─── Context type ─────────────────────────────────────────────────────────────
type ThemeContextValue = {
  colors:         ThemeColors;
  slots:          (ThemeSlot | null)[];
  activeSlotIdx:  number | null;
  /** Call after login to load the correct theme for this user */
  loadUserTheme:  (userId: string, isMasterAdmin: boolean) => void;
  setColor:       (key: keyof ThemeColors, value: string) => void;
  applyPreset:    (preset: ThemeSlot) => void;
  applySlot:      (index: number) => void;
  saveToSlot:     (index: number, name: string) => void;
  deleteSlot:     (index: number) => void;
  resetToDefault: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [colors,        setColors]        = useState<ThemeColors>(DEFAULT_THEME);
  const [slots,         setSlots]         = useState<(ThemeSlot | null)[]>(Array(MAX_SLOTS).fill(null));
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null);
  // Track which user is currently active (null = global/MasterAdmin context)
  const [activeUserId, setActiveUserId]   = useState<string | null>(null);
  const [isMasterCtx,  setIsMasterCtx]   = useState(true);

  // ── Load global (MasterAdmin) theme on mount ──────────────────────────────
  useEffect(() => {
    const storage = safeStorage();
    if (!storage) return;
    try {
      const raw = storage.getString(THEME_GLOBAL_KEY);
      if (raw) setColors(JSON.parse(raw));
    } catch { /* use default */ }
  }, []);

  // ── Persist helpers ───────────────────────────────────────────────────────
  function persistColors(c: ThemeColors) {
    const storage = safeStorage();
    if (!storage) return;
    try {
      if (isMasterCtx || !activeUserId) {
        // MasterAdmin → write global key
        storage.set(THEME_GLOBAL_KEY, JSON.stringify(c));
      } else {
        // Other user → write per-user key
        storage.set(themeUserKey(activeUserId), JSON.stringify(c));
      }
    } catch { /* ignore */ }
  }

  function persistSlots(sl: (ThemeSlot | null)[]) {
    if (!activeUserId) return;
    const storage = safeStorage();
    if (!storage) return;
    try { storage.set(slotsUserKey(activeUserId), JSON.stringify(sl)); } catch { /* ignore */ }
  }

  // ── loadUserTheme — called after login ────────────────────────────────────
  const loadUserTheme = useCallback((userId: string, isMasterAdmin: boolean) => {
    setActiveUserId(userId);
    setIsMasterCtx(isMasterAdmin);
    const storage = safeStorage();
    if (!storage) return;
    try {
      // Read the correct theme key
      const themeKey = isMasterAdmin ? THEME_GLOBAL_KEY : themeUserKey(userId);
      const raw = storage.getString(themeKey);
      if (raw) {
        setColors(JSON.parse(raw));
      } else if (!isMasterAdmin) {
        // New non-master user: inherit the MasterAdmin's global theme as starting point
        const globalRaw = storage.getString(THEME_GLOBAL_KEY);
        if (globalRaw) setColors(JSON.parse(globalRaw));
        else setColors(DEFAULT_THEME);
      }
      // Load slots for this user
      const slotsRaw = storage.getString(slotsUserKey(userId));
      setSlots(slotsRaw ? JSON.parse(slotsRaw) : Array(MAX_SLOTS).fill(null));
      setActiveSlotIdx(null);
    } catch { /* use current */ }
  }, []);

  // ── Setters ───────────────────────────────────────────────────────────────
  const setColor = useCallback((key: keyof ThemeColors, value: string) => {
    setColors(prev => {
      const next = { ...prev, [key]: value };
      persistColors(next);
      return next;
    });
    setActiveSlotIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMasterCtx, activeUserId]);

  const applyPreset = useCallback((preset: ThemeSlot) => {
    setColors(preset.colors);
    persistColors(preset.colors);
    setActiveSlotIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMasterCtx, activeUserId]);

  const applySlot = useCallback((index: number) => {
    const slot = slots[index];
    if (!slot) return;
    setColors(slot.colors);
    persistColors(slot.colors);
    setActiveSlotIdx(index);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, isMasterCtx, activeUserId]);

  const saveToSlot = useCallback((index: number, name: string) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { name, colors };
      persistSlots(next);
      return next;
    });
    setActiveSlotIdx(index);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, activeUserId]);

  const deleteSlot = useCallback((index: number) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = null;
      persistSlots(next);
      return next;
    });
    if (activeSlotIdx === index) setActiveSlotIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserId, activeSlotIdx]);

  const resetToDefault = useCallback(() => {
    setColors(DEFAULT_THEME);
    persistColors(DEFAULT_THEME);
    setActiveSlotIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMasterCtx, activeUserId]);

  return (
    <ThemeContext.Provider value={{
      colors, slots, activeSlotIdx,
      loadUserTheme,
      setColor, applyPreset, applySlot,
      saveToSlot, deleteSlot, resetToDefault,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside AppThemeProvider');
  return ctx;
}