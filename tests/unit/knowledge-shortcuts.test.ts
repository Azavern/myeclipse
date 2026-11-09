import { describe, expect, it } from 'vitest';
import {
  emptyShortcutDraft, MAX_SHORTCUT_CARDS, shortcutCardsFromUnknown, shortcutDraftsFromRows,
  shortcutDraftsFromUnknown, shortcutPayload, validateShortcutCards,
} from '../../src/lib/knowledge/shortcuts';
import { KB_CATEGORY_LABEL, isKnowledgeCategory, knowledgeCategory } from '../../src/lib/knowledge/labels';

describe('kartu shortcut Knowledge', () => {
  it('merapikan payload dan membuang uid', () => {
    expect(shortcutPayload([
      { uid: 'a', keys: [' Ctrl ', 'Shift '], label: ' Buka ', note: '  ' },
    ])).toEqual([{ keys: ['Ctrl', 'Shift'], label: 'Buka', note: null }]);
  });

  it('mempertahankan slot kosong agar validasi bisa menolaknya', () => {
    const cards = shortcutCardsFromUnknown([{ keys: ['Ctrl', ''], label: 'Simpan', note: null }]);
    expect(cards).toEqual([{ keys: ['Ctrl', ''], label: 'Simpan', note: null }]);
    expect(validateShortcutCards(cards)).toBe('Lengkapi semua slot tombol pada kartu 1.');
  });

  it('menolak kartu tanpa label, tanpa tombol, dan data bukan array', () => {
    expect(validateShortcutCards([])).toBe('Tambahkan minimal satu kartu shortcut.');
    expect(validateShortcutCards([{ keys: ['Ctrl'], label: '', note: null }]))
      .toBe('Label kartu 1 wajib diisi.');
    expect(validateShortcutCards([{ keys: [], label: 'Buka', note: null }]))
      .toBe('Kartu 1 memerlukan minimal satu tombol.');
    expect(shortcutCardsFromUnknown('bukan array')).toEqual([]);
  });

  it('menerima kartu valid dan membatasi jumlah kartu', () => {
    expect(validateShortcutCards([{ keys: ['Win', 'I'], label: 'Buka Settings', note: null }])).toBeNull();
    const tooMany = Array.from({ length: MAX_SHORTCUT_CARDS + 1 }, () => ({
      keys: ['Ctrl'], label: 'Buka', note: null,
    }));
    expect(shortcutCardsFromUnknown(tooMany)).toHaveLength(MAX_SHORTCUT_CARDS + 1);
    expect(validateShortcutCards(tooMany)).toContain('Maksimal');
  });

  it('memulihkan draf lokal dan mengurutkan kartu dari database', () => {
    const draft = shortcutDraftsFromUnknown([{ uid: 'x', keys: ['Alt'], label: 'Menu', note: 'Tekan' }]);
    expect(draft[0]).toMatchObject({ uid: 'x', keys: ['Alt'], label: 'Menu', note: 'Tekan' });
    expect(emptyShortcutDraft()).toMatchObject({ uid: 's0', keys: [''], label: '' });

    const rows = [
      { keys: ['Ctrl', 'S'], label: 'Simpan', note: null, position: 2 },
      { keys: ['Win'], label: 'Start', note: 'Tekan', position: 1 },
    ];
    expect(shortcutDraftsFromRows(rows).map((card) => card.label)).toEqual(['Start', 'Simpan']);
  });

  it('hanya menerima dua kategori sistem dan memakai knowledge sebagai fallback', () => {
    expect(isKnowledgeCategory('knowledge')).toBe(true);
    expect(isKnowledgeCategory('shortcut')).toBe(true);
    expect(isKnowledgeCategory('Everything')).toBe(false);
    expect(knowledgeCategory('Everything')).toBe('knowledge');
    expect(knowledgeCategory(null)).toBe('knowledge');
    expect(KB_CATEGORY_LABEL).toEqual({ knowledge: 'Pengetahuan', shortcut: 'Shortcut' });
  });
});
