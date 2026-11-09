// Tata letak keyboard untuk pemilih tombol shortcut. Baris dipakai di layar
// lebar; di ponsel baris-baris ini dibuka menjadi grid tiga kolom.
export const SHORTCUT_KEYBOARD_ROWS: readonly (readonly string[])[] = [
  ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['Caps Lock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Win', 'Alt', 'Space', 'Alt', 'Fn', 'Ctrl', '←', '↑', '↓', '→'],
  ['Insert', 'Delete', 'Home', 'End', 'PgUp', 'PgDn'],
];

export const SHORTCUT_KEY_LABELS: Record<string, string> = {
  Esc: 'Escape',
  Backspace: 'Backspace',
  Tab: 'Tab',
  'Caps Lock': 'Caps Lock',
  Enter: 'Enter',
  Shift: 'Shift',
  Ctrl: 'Control',
  Win: 'Windows',
  Alt: 'Alt',
  Space: 'Spasi',
  Fn: 'Fn',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PgUp: 'Page Up',
  PgDn: 'Page Down',
};
