export type UserRole = 'masterAdmin' | 'admin' | 'user';

export type Password = {
  id: string;
  label: string;
  username: string;
  email?: string;
  password: string;
  url?: string;
  telefono?: string;
  notes?: string;
  isHidden?: boolean;   
  createdAt: number;
  updatedAt: number;
};

export type User = {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: number;
  passwords: Password[];
};

export type AppStorage = {
  users: User[];
};

// ─── Theme ────────────────────────────────────────────────────────────────────

export type ThemeColors = {
  accent: string;       
  background: string;
  card: string;
  text: string;
  subtext: string;
};

export type ThemeSlot = {
  name: string;
  colors: ThemeColors;
};

export const DEFAULT_THEME: ThemeColors = {
  accent:     '#C8A97E',
  background: '#0C0C0C',
  card:       '#161616',
  text:       '#EEEAE4',
  subtext:    '#484848',
};

export const OLED_THEME: ThemeColors = {
  accent:     '#C8A97E',
  background: '#000000',
  card:       '#0A0A0A',
  text:       '#FFFFFF',
  subtext:    '#555555',
};

export const PRESET_THEMES: ThemeSlot[] = [
  // ── Dark themes ───────────────────────────────────────────────────────────
  { name: 'Vault',     colors: { accent: '#C8A97E', background: '#0C0C0C', card: '#161616', text: '#EEEAE4', subtext: '#484848' } },
  { name: 'Midnight',  colors: { accent: '#7EB8C8', background: '#070B14', card: '#0F1623', text: '#D6E8F0', subtext: '#3A5060' } },
  { name: 'Crimson',   colors: { accent: '#C84F4F', background: '#0E0A0A', card: '#1A1010', text: '#F0E8E8', subtext: '#503A3A' } },
  { name: 'Forest',    colors: { accent: '#6BAF7A', background: '#090E09', card: '#111811', text: '#E4F0E6', subtext: '#3A503D' } },
  // ── Light themes ──────────────────────────────────────────────────────────
  { name: 'Paper',     colors: { accent: '#8B6914', background: '#F5F0E8', card: '#FFFFFF',  text: '#1A1208', subtext: '#8A7A60' } },
  { name: 'Sky',       colors: { accent: '#2A7DA8', background: '#EDF5FB', card: '#FFFFFF',  text: '#0A1E2C', subtext: '#6A9AB8' } },
  { name: 'Rose',      colors: { accent: '#A83050', background: '#FBF0F3', card: '#FFFFFF',  text: '#2C0A14', subtext: '#B87A90' } },
  { name: 'Sage',      colors: { accent: '#2E7A47', background: '#EFF6F1', card: '#FFFFFF',  text: '#0A1E12', subtext: '#6AB880' } },
];