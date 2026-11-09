export const MAX_SHORTCUT_CARDS = 30;
export const MAX_SHORTCUT_KEYS = 12;
export const MAX_SHORTCUT_LABEL = 120;
export const MAX_SHORTCUT_NOTE = 500;
export const MAX_SHORTCUT_KEY_LENGTH = 20;

export type ShortcutCard = {
  keys: string[];
  label: string;
  note: string | null;
};

export type ShortcutDraft = {
  uid: string;
  keys: string[];
  label: string;
  note: string;
};

export function emptyShortcutDraft(uid = 's0'): ShortcutDraft {
  return { uid, keys: [''], label: '', note: '' };
}

// Draf lokal boleh menyimpan slot yang masih kosong agar pengguna bisa
// melanjutkan pengisian. Validasi final terjadi saat simpan/terbitkan.
export function shortcutDraftsFromUnknown(value: unknown, fallbackUid = 's0'): ShortcutDraft[] {
  if (!Array.isArray(value)) return [emptyShortcutDraft(fallbackUid)];
  const cards = value.slice(0, MAX_SHORTCUT_CARDS).map((item, index) => {
    const card = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawKeys = Array.isArray(card.keys) ? card.keys : [];
    const keys = rawKeys
      .map((key) => (typeof key === 'string' ? key : ''))
      .slice(0, MAX_SHORTCUT_KEYS);
    return {
      uid: typeof card.uid === 'string' && card.uid ? card.uid : `s${index}`,
      keys: keys.length > 0 ? keys : [''],
      label: typeof card.label === 'string' ? card.label : '',
      note: typeof card.note === 'string' ? card.note : '',
    };
  });
  return cards.length > 0 ? cards : [emptyShortcutDraft(fallbackUid)];
}

export function shortcutDraftsFromRows(rows: { keys: string[]; label: string; note: string | null; position: number }[] | null | undefined): ShortcutDraft[] {
  if (!rows || rows.length === 0) return [emptyShortcutDraft()];
  return [...rows].sort((a, b) => a.position - b.position).map((row, index) => ({
    uid: `s${index}`,
    keys: row.keys.length > 0 ? [...row.keys] : [''],
    label: row.label,
    note: row.note ?? '',
  }));
}

// Bentuk yang dikirim ke Server Action/RPC: tanpa uid dan dengan nilai yang
// sudah dirapikan. Slot kosong tetap dipertahankan agar validasi bisa
// menjelaskan bagian mana yang belum lengkap.
export function shortcutPayload(cards: ShortcutDraft[]): ShortcutCard[] {
  return cards.map((card) => ({
    keys: card.keys.map((key) => key.trim()),
    label: card.label.trim(),
    note: card.note.trim() || null,
  }));
}

export function shortcutCardsFromUnknown(value: unknown): ShortcutCard[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SHORTCUT_CARDS + 1).map((item) => {
    const card = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawKeys = Array.isArray(card.keys) ? card.keys : [];
    return {
      keys: rawKeys.slice(0, MAX_SHORTCUT_KEYS + 1).map((key) => (
        typeof key === 'string' ? key.trim() : ''
      )),
      label: typeof card.label === 'string' ? card.label.trim() : '',
      note: typeof card.note === 'string' ? card.note.trim() || null : null,
    };
  });
}

export function validateShortcutCards(cards: ShortcutCard[]): string | null {
  if (cards.length === 0) return 'Tambahkan minimal satu kartu shortcut.';
  if (cards.length > MAX_SHORTCUT_CARDS) return `Maksimal ${MAX_SHORTCUT_CARDS} kartu shortcut.`;
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (!card) continue;
    const number = i + 1;
    if (card.label.length === 0) return `Label kartu ${number} wajib diisi.`;
    if (card.label.length > MAX_SHORTCUT_LABEL) return `Label kartu ${number} maksimal ${MAX_SHORTCUT_LABEL} karakter.`;
    if (card.keys.length === 0) return `Kartu ${number} memerlukan minimal satu tombol.`;
    if (card.keys.length > MAX_SHORTCUT_KEYS) return `Kartu ${number} maksimal ${MAX_SHORTCUT_KEYS} tombol.`;
    if (card.keys.some((key) => key.length === 0)) return `Lengkapi semua slot tombol pada kartu ${number}.`;
    if (card.keys.some((key) => key.length > MAX_SHORTCUT_KEY_LENGTH)) return `Nama tombol pada kartu ${number} terlalu panjang.`;
    if (card.note && card.note.length > MAX_SHORTCUT_NOTE) return `Keterangan kartu ${number} maksimal ${MAX_SHORTCUT_NOTE} karakter.`;
  }
  return null;
}

export function shortcutKeysText(keys: string[]): string {
  return keys.join(' + ');
}
