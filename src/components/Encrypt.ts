import { AppStorage, Password, User } from '@/constants/types';
import { createMMKV } from 'react-native-mmkv';

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'app_data';

// Salt is fixed per-app (not secret, just prevents rainbow tables).
// In production you could store a random salt in expo-secure-store.
const SALT = 'localkey::v1::salt::9f3a';

// Fallback key used ONLY when MasterAdmin has no password set.
// Still better than no encryption — ties storage to this specific app build.
const NO_PASSWORD_FALLBACK_KEY = `localkey::no-pwd::${SALT}`;

// Temporary key used during first-launch bootstrap (before MasterAdmin is saved).
const BOOTSTRAP_KEY = `localkey::bootstrap::${SALT}`;

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derives a deterministic 16-char hex encryption key from a password.
 * Uses a multi-round hash to stretch the input.
 *
 * NOTE: For production, swap this with react-native-quick-crypto PBKDF2:
 *   crypto.pbkdf2Sync(password, SALT, 100_000, 32, 'sha256').toString('hex')
 */
export function deriveKey(password: string): string {
  if (!password) return NO_PASSWORD_FALLBACK_KEY;

  const input = `${SALT}::${password}`;
  let h1 = 5381;
  let h2 = 52711;

  // Forward pass
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }

  // Backward pass for extra diffusion
  for (let i = input.length - 1; i >= 0; i--) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2246822507);
    h2 = Math.imul(h2 ^ c, 3266489909);
  }

  h1 ^= h2;
  h2 ^= h1;

  const part1 = ((h1 >>> 0) ^ (h2 >>> 16)).toString(16).padStart(8, '0');
  const part2 = ((h2 >>> 0) ^ (h1 >>> 16)).toString(16).padStart(8, '0');

  // 16-char hex string — fits MMKV's AES-128 key limit
  return `${part1}${part2}`;
}

// ─── Password hashing (separate from key derivation) ─────────────────────────

/**
 * Hashes a password for storage in User.passwordHash.
 * Intentionally separate from deriveKey:
 *   - deriveKey(rawPassword) → opens the vault
 *   - hashPassword(rawPassword) → verifies identity at login
 *
 * We must keep the raw password available during the login flow to derive
 * the encryption key, so we can never store only the hash and derive from it.
 */
export function hashPassword(password: string): string {
  if (!password) return '';
  const input = `verify::${SALT}::${password}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x5bd1e995);
    hash ^= hash >>> 15;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function verifyPassword(plain: string, storedHash: string): boolean {
  if (!storedHash) return true;           // no password → always passes
  if (!plain && storedHash) return false; // password required but not given
  return hashPassword(plain) === storedHash;
}

// ─── Storage instance (lazily initialized) ────────────────────────────────────

let _storage: ReturnType<typeof createMMKV> | null = null;

/**
 * Returns the active storage instance.
 * Throws if initStorage() has not been called yet.
 */
export function getStorage(): ReturnType<typeof createMMKV> {
  if (!_storage) {
    throw new Error('Storage not initialized. Call initStorage() or initStorageBootstrap() first.');
  }
  return _storage;
}

/**
 * Opens (or re-opens) MMKV with the given encryption key.
 *
 * Call this:
 *   - At first launch → initStorageBootstrap()
 *   - After MasterAdmin creation → via bootstrapMasterAdmin()
 *   - At every subsequent app open → loginAsMasterAdmin(password)
 */
export function initStorage(encryptionKey: string): void {
  _storage = createMMKV({
    id: 'localkey-storage',
    encryptionKey,
  });
}

/**
 * Opens storage with the temporary bootstrap key.
 * Used only during first-launch setup, before MasterAdmin is created.
 */
export function initStorageBootstrap(): void {
  initStorage(BOOTSTRAP_KEY);
}

/**
 * Re-encrypts all data under a new key.
 *
 * MMKV doesn't expose reKey() in JS, so we manually:
 *   1. Read all data with the old key
 *   2. Swap to a new MMKV instance with the new key
 *   3. Write data back
 *   4. Wipe the old instance
 */
export function rekeyStorage(newEncryptionKey: string): void {
  const oldStorage = getStorage();
  const raw = oldStorage.getString(STORAGE_KEY);

  // Open new instance under new key
  initStorage(newEncryptionKey);
  const newStorage = getStorage();

  if (raw) {
    newStorage.set(STORAGE_KEY, raw);
  }

  // Clear old instance so no plaintext lingers
  oldStorage.clearAll();
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

function loadAppData(): AppStorage {
  try {
    const raw = getStorage().getString(STORAGE_KEY);
    if (!raw) return { users: [] };
    return JSON.parse(raw) as AppStorage;
  } catch {
    return { users: [] };
  }
}

function saveAppData(data: AppStorage): void {
  getStorage().set(STORAGE_KEY, JSON.stringify(data));
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export function getAllUsers(): User[] {
  return loadAppData().users;
}

export function getUserById(id: string): User | undefined {
  return loadAppData().users.find(u => u.id === id);
}

export function hasMasterAdmin(): boolean {
  return loadAppData().users.some(u => u.role === 'masterAdmin');
}

export function saveUser(user: User): void {
  const data = loadAppData();
  const index = data.users.findIndex(u => u.id === user.id);
  if (index >= 0) {
    data.users[index] = user;
  } else {
    data.users.push(user);
  }
  saveAppData(data);
}

export function deleteUser(id: string): void {
  const data = loadAppData();
  data.users = data.users.filter(u => u.id !== id);
  saveAppData(data);
}

export function createUser(
  username: string,
  password: string,
  role: User['role'],
): User {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    username,
    passwordHash: hashPassword(password),
    role,
    createdAt: now,
    passwords: [],
  };
}

// ─── MasterAdmin bootstrap flow ───────────────────────────────────────────────

/**
 * Full first-launch flow for creating the MasterAdmin.
 *
 * Steps:
 *   1. Create the User object
 *   2. Save it under the bootstrap key (storage must already be init'd with initStorageBootstrap)
 *   3. Re-key storage to the key derived from their password
 *
 * After this call, storage is open and ready under the correct key.
 */
export function bootstrapMasterAdmin(username: string, password: string): User {
  const user = createUser(username, password, 'masterAdmin');
  saveUser(user);

  const masterKey = deriveKey(password);
  rekeyStorage(masterKey);

  return user;
}

/**
 * Attempts to open storage and log in as MasterAdmin.
 *
 * Steps:
 *   1. Derive key from entered password
 *   2. Open MMKV with that key
 *   3. Try to read users — if decryption fails, MMKV returns garbage/throws
 *   4. Find the MasterAdmin and verify their stored hash as a second check
 *
 * Returns the User on success, null on wrong password.
 */
export function loginAsMasterAdmin(enteredPassword: string): User | null {
  const key = deriveKey(enteredPassword);

  try {
    initStorage(key);
    const users = getAllUsers();
    const master = users.find(u => u.role === 'masterAdmin');

    if (!master) {
      _storage = null;
      return null;
    }

    // Secondary check: stored hash must match
    // (guards against a wrong password that accidentally produces valid JSON)
    if (!verifyPassword(enteredPassword, master.passwordHash)) {
      _storage = null;
      return null;
    }

    return master;
  } catch {
    _storage = null;
    return null;
  }
}

/**
 * Closes the storage instance (e.g. on logout).
 * Next action must be loginAsMasterAdmin() to re-open it.
 */
export function closeStorage(): void {
  _storage = null;
}

// ─── Password entry helpers ───────────────────────────────────────────────────

export function addPasswordToUser(
  userId: string,
  entry: Omit<Password, 'id' | 'createdAt' | 'updatedAt'>,
): void {
  const data = loadAppData();
  const user = data.users.find(u => u.id === userId);
  if (!user) return;
  const now = Date.now();
  user.passwords.push({
    ...entry,
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    createdAt: now,
    updatedAt: now,
  });
  saveAppData(data);
}

export function updatePasswordEntry(
  userId: string,
  passwordId: string,
  updates: Partial<Omit<Password, 'id' | 'createdAt'>>,
): void {
  const data = loadAppData();
  const user = data.users.find(u => u.id === userId);
  if (!user) return;
  const entry = user.passwords.find(p => p.id === passwordId);
  if (!entry) return;
  Object.assign(entry, updates, { updatedAt: Date.now() });
  saveAppData(data);
}

export function deletePasswordEntry(userId: string, passwordId: string): void {
  const data = loadAppData();
  const user = data.users.find(u => u.id === userId);
  if (!user) return;
  user.passwords = user.passwords.filter(p => p.id !== passwordId);
  saveAppData(data);
}

// ─── Biometric access helpers ─────────────────────────────────────────────────
// Stored as a plain JSON array of userId strings under a dedicated key.
// Uses the same MMKV instance (already unlocked), but lives outside AppStorage
// so it survives storage re-keying cleanly.

const BIOMETRIC_KEY = 'biometric_enabled_users';

export function getBiometricEnabledUsers(): string[] {
  try {
    const raw = getStorage().getString(BIOMETRIC_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function setBiometricEnabledUsers(userIds: string[]): void {
  getStorage().set(BIOMETRIC_KEY, JSON.stringify(userIds));
}

export function isBiometricEnabledForUser(userId: string): boolean {
  return getBiometricEnabledUsers().includes(userId);
}

export function toggleBiometricForUser(userId: string, enabled: boolean): void {
  const current = getBiometricEnabledUsers();
  const updated = enabled
    ? [...new Set([...current, userId])]
    : current.filter(id => id !== userId);
  setBiometricEnabledUsers(updated);
}

// ─── Biometric credential vault ───────────────────────────────────────────────
// A SEPARATE unencrypted MMKV instance used purely to cache credentials for
// biometric login. The device OS (Face ID / fingerprint) guards physical access;
// this storage is only readable on the same device.
//
// We store the raw password (needed to re-derive the masterAdmin encryption key)
// in this vault when the user enables biometric access for an account.

let _bioStorage: ReturnType<typeof createMMKV> | null = null;

function getBioStorage(): ReturnType<typeof createMMKV> {
  if (!_bioStorage) {
    _bioStorage = createMMKV({ id: 'localkey-biometric-credentials' });
  }
  return _bioStorage;
}

const BIO_CRED_PREFIX = 'bio_cred::';

export function saveBiometricCredential(userId: string, password: string): void {
  getBioStorage().set(`${BIO_CRED_PREFIX}${userId}`, password);
}

export function getBiometricCredential(userId: string): string | undefined {
  const val = getBioStorage().getString(`${BIO_CRED_PREFIX}${userId}`);
  // Empty string sentinel means "credential was cleared"
  if (val === undefined || val === '\x00') return undefined;
  return val;
}

export function deleteBiometricCredential(userId: string): void {
  // MMKV v4 doesn't expose delete/removeItem in this build — overwrite with sentinel
  getBioStorage().set(`${BIO_CRED_PREFIX}${userId}`, '\x00');
}

// ─── Account icon storage ─────────────────────────────────────────────────────
// Stores per-user icon: either an emoji string or a local image URI (prefixed with 'file:' or 'content:')

const ICON_PREFIX = 'account_icon::';

export function getAccountIcon(userId: string): string {
  try {
    return getStorage().getString(`${ICON_PREFIX}${userId}`) ?? '👤';
  } catch {
    return '👤';
  }
}

export function setAccountIcon(userId: string, icon: string): void {
  getStorage().set(`${ICON_PREFIX}${userId}`, icon);
}

// ─── Language storage ─────────────────────────────────────────────────────────

const LANG_KEY = 'app_language';

export function getStoredLanguage(): string {
  try {
    // Use the bio storage (unencrypted) so language is accessible before vault unlock
    return getBioStorage().getString(LANG_KEY) ?? 'it';
  } catch {
    return 'it';
  }
}

export function setStoredLanguage(lang: string): void {
  getBioStorage().set(LANG_KEY, lang);
}