/**
 * FileManipulation.tsx
 * Place at: src/components/FileManipulation.tsx
 *
 * Fully local CSV + Excel import/export for LocalKey.
 *
 * Export behaviour (per platform):
 *   Android → Storage Access Framework folder picker → saves directly to chosen folder
 *   iOS     → OS share sheet → user picks Files / Drive / etc.
 *
 * Import: document picker on both platforms.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import XLSX from 'xlsx';

import { Password } from '@/constants/types';

const { StorageAccessFramework: SAF } = FileSystem;

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: { key: keyof Password | 'isHidden'; header: string }[] = [
  { key: 'label',     header: 'Site / App'   },
  { key: 'username',  header: 'Username'     },
  { key: 'email',     header: 'Email'        },
  { key: 'password',  header: 'Password'     },
  { key: 'url',       header: 'URL'          },
  { key: 'telefono',  header: 'Phone'        },
  { key: 'notes',     header: 'Notes'        },
  { key: 'isHidden',  header: 'Hidden (0/1)' },
];

// ─── Row conversion ───────────────────────────────────────────────────────────

function passwordsToAoa(passwords: Password[]): string[][] {
  const header = COLUMNS.map(c => c.header);
  const rows = passwords.map(p =>
    COLUMNS.map(c => {
      const v = p[c.key as keyof Password];
      if (c.key === 'isHidden') return v ? '1' : '0';
      return v != null ? String(v) : '';
    })
  );
  return [header, ...rows];
}

function aoaToPasswordFields(
  allRows: string[][],
): Omit<Password, 'id' | 'createdAt' | 'updatedAt'>[] {
  if (allRows.length < 2) return [];
  const [headerRow, ...dataRows] = allRows;

  const idx: Record<string, number> = {};
  headerRow.forEach((h, i) => { idx[h.toLowerCase().trim()] = i; });

  function get(row: string[], ...names: string[]): string {
    for (const name of names) {
      const i = idx[name.toLowerCase()];
      if (i !== undefined && row[i] != null) return String(row[i]).trim();
    }
    return '';
  }

  return dataRows
    .filter(row => row.some(c => String(c ?? '').trim() !== ''))
    .map(row => ({
      label:    get(row, 'site / app', 'site/app', 'site', 'label', 'name', 'title') || 'Imported',
      username: get(row, 'username', 'user', 'login', 'account'),
      email:    get(row, 'email', 'e-mail', 'mail') || undefined,
      password: get(row, 'password', 'pass', 'pwd', 'secret'),
      url:      get(row, 'url', 'website', 'link', 'uri') || undefined,
      telefono: get(row, 'phone', 'telefono', 'tel', 'mobile', 'phone number') || undefined,
      notes:    get(row, 'notes', 'note', 'comment', 'remarks') || undefined,
      isHidden: get(row, 'hidden (0/1)', 'hidden', 'ishidden', 'is_hidden') === '1',
    }));
}

// ─── Public result type ───────────────────────────────────────────────────────

export type ImportResult = {
  imported: Omit<Password, 'id' | 'createdAt' | 'updatedAt'>[];
  skipped:  number;
  total:    number;
};

function buildResult(aoa: unknown[][]): ImportResult {
  const normalised = aoa.map(row =>
    (row as unknown[]).map(c => (c == null ? '' : String(c)))
  );
  const parsed   = aoaToPasswordFields(normalised);
  const imported = parsed.filter(p => p.label || p.password);
  const skipped  = parsed.length - imported.length;
  const total    = Math.max(0, normalised.length - 1);
  return { imported, skipped, total };
}

// ─── Cache URI helper ─────────────────────────────────────────────────────────

function cacheUri(filename: string): string {
  return `${FileSystem.cacheDirectory}${filename}`;
}

// ─── Android SAF save ─────────────────────────────────────────────────────────

/**
 * On Android: opens a folder picker (SAF), creates the file in the chosen
 * folder, and writes the content (base64 or utf8).
 *
 * Returns true if saved, false if the user cancelled the folder picker.
 */
async function safSave(
  filename: string,
  mimeType: string,
  content: string,
  encoding: FileSystem.EncodingType,
): Promise<boolean> {
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted) return false;

  const fileUri = await SAF.createFileAsync(perm.directoryUri, filename, mimeType);
  await FileSystem.writeAsStringAsync(fileUri, content, { encoding });
  return true;
}

// ─── iOS share save ───────────────────────────────────────────────────────────

/**
 * On iOS: writes to cache then opens the share sheet so the user can save
 * to Files, Drive, etc.
 */
async function iosShare(
  filename: string,
  mimeType: string,
  content: string,
  encoding: FileSystem.EncodingType,
  UTI: string,
): Promise<boolean> {
  const uri = cacheUri(filename);
  await FileSystem.writeAsStringAsync(uri, content, { encoding });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return false;

  await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Save passwords', UTI });
  return true;
}

// ─── EXPORT CSV ───────────────────────────────────────────────────────────────

export async function exportCsv(
  passwords: Password[],
  filename = 'localkey_passwords.csv',
): Promise<boolean> {
  const aoa = passwordsToAoa(passwords);
  const ws  = XLSX.utils.aoa_to_sheet(aoa);
  const csv = XLSX.utils.sheet_to_csv(ws);

  if (Platform.OS === 'android') {
    return safSave(filename, 'text/csv', csv, FileSystem.EncodingType.UTF8);
  }
  return iosShare(filename, 'text/csv', csv, FileSystem.EncodingType.UTF8, 'public.comma-separated-values-text');
}

// ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────

export async function exportExcel(
  passwords: Password[],
  filename = 'localkey_passwords.xlsx',
): Promise<boolean> {
  const aoa = passwordsToAoa(passwords);
  const ws  = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = COLUMNS.map((col, ci) => {
    const maxLen = aoa.reduce(
      (m, row) => Math.max(m, (row[ci] ?? '').length),
      col.header.length,
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });

  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Passwords');
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;

  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (Platform.OS === 'android') {
    return safSave(filename, mime, b64, FileSystem.EncodingType.Base64);
  }
  return iosShare(filename, mime, b64, FileSystem.EncodingType.Base64, 'org.openxmlformats.spreadsheetml.sheet');
}

// ─── IMPORT CSV ───────────────────────────────────────────────────────────────

export async function importCsv(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (picked.canceled) return null;

  const text = await FileSystem.readAsStringAsync(picked.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const wb  = XLSX.read(text, { type: 'string' });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  return buildResult(aoa);
}

// ─── IMPORT EXCEL ─────────────────────────────────────────────────────────────

export async function importExcel(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'org.openxmlformats.spreadsheetml.sheet',
      'application/octet-stream',
    ],
    copyToCacheDirectory: true,
  });

  if (picked.canceled) return null;

  const b64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const wb  = XLSX.read(b64, { type: 'base64' });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  return buildResult(aoa);
}