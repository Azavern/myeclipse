// Satu keluarga ikon garis (24×24, stroke 1.75, ujung bulat), digambar sendiri agar tanpa dependensi tambahan.
// Ikon dekoratif disembunyikan dari pembaca layar; beri `title` bila ikon berdiri sendiri tanpa teks.
const c = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const dot = (x: number, y: number) => `M${x} ${y}h.01`;

const PATHS = {
  home: ['M3 11.5 12 4l9 7.5', 'M5.5 10v9a1 1 0 0 0 1 1H10v-5.5h4V20h3.5a1 1 0 0 0 1-1v-9'],
  book: ['M3 5.5h6.5A2.5 2.5 0 0 1 12 8v12a2 2 0 0 0-2-2H3z', 'M21 5.5h-6.5A2.5 2.5 0 0 0 12 8v12a2 2 0 0 1 2-2h7z'],
  calendar: ['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M4 9.5h16', 'M8 2.5v3', 'M16 2.5v3'],
  'calendar-days': ['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M4 9.5h16', 'M8 2.5v3', 'M16 2.5v3', dot(8, 13.5), dot(12, 13.5), dot(16, 13.5), dot(8, 17), dot(12, 17)],
  'calendar-clock': ['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M4 9.5h16', 'M8 2.5v3', 'M16 2.5v3', c(12, 14.5, 3), 'M12 12.8v2l1.4.9'],
  tasks: ['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M8.5 12.2l2.5 2.5 4.5-5'],
  users: [c(9.5, 8, 3.5), 'M3 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1', 'M16 4.6a3.5 3.5 0 0 1 0 6.8', 'M18 14.3a5 5 0 0 1 3 4.7v1'],
  user: [c(12, 8, 4), 'M4.5 20.5v-1A5.5 5.5 0 0 1 10 14h4a5.5 5.5 0 0 1 5.5 5.5v1'],
  settings: ['M4 7h8', 'M18 7h2', c(15, 7, 3), 'M4 17h2', 'M12 17h8', c(9, 17, 3)],
  palette: ['M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.9 1.9-1.9H17a4 4 0 0 0 4-4c0-4.4-4-7.5-9-7.5z', dot(7.5, 11), dot(10, 7.5), dot(14.5, 7.5), dot(17, 11)],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', c(12, 12, 3)],
  'eye-off': ['M3 3l18 18', 'M10.6 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.5', 'M6.6 7.1A15.6 15.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  shield: ['M12 3 19 6v5.5c0 4.4-2.9 8.1-7 9.5-4.1-1.4-7-5.1-7-9.5V6z', 'M9 12l2.2 2.2L15.5 10'],
  'log-out': ['M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3', 'M16 8l4 4-4 4', 'M20 12H9'],
  'log-in': ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 8l-4 4 4 4', 'M6 12h11'],
  plus: ['M12 5v14', 'M5 12h14'],
  pencil: ['M4 20h4L19.2 8.8a2.8 2.8 0 0 0-4-4L4 16z', 'M13.5 6.5l4 4'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l.9 11.3A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.7L18 7', 'M9 7V4.5h6V7'],
  clock: [c(12, 12, 9), 'M12 7v5l3 2'],
  'map-pin': ['M12 21s-7-6.2-7-11.2a7 7 0 1 1 14 0C19 14.8 12 21 12 21z', c(12, 9.8, 2.5)],
  pin: ['M9 3h6', 'M10 3v6l-4 3v2h12v-2l-4-3V3', 'M12 14v7'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  'external-link': ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4'],
  image: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', c(8.5, 9, 1.5), 'M21 16l-5-5-8 8'],
  images: ['M8 3h11a2 2 0 0 1 2 2v11', 'M5 7h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z', c(8.5, 11, 1.5), 'M4 16.5l3.5-3.5 3 3 2-2 3.5 3.5'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'],
  cloud: ['M7 18h9.5a3.5 3.5 0 0 0 .5-6.96A5.5 5.5 0 0 0 6.2 11.4 3.9 3.9 0 0 0 7 18z'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  qr: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h2v2h-2z', 'M18 14h2v2h-2z', 'M14 18h2v2h-2z', 'M18 18h2v2h-2z'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
  search: [c(11, 11, 7), 'M20 20l-4-4'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  'check-circle': [c(12, 12, 9), 'M8 12.3l2.7 2.7L16 9.6'],
  'alert-triangle': ['M12 4 21.5 20h-19z', 'M12 10v4', dot(12, 17)],
  'alert-circle': [c(12, 12, 9), 'M12 8v4.5', dot(12, 16)],
  info: [c(12, 12, 9), 'M12 11v5', dot(12, 8)],
  loader: ['M12 3a9 9 0 0 1 9 9'],
  more: [dot(5, 12), dot(12, 12), dot(19, 12)],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  cap: ['M2 9.5 12 5l10 4.5-10 4.5z', 'M6 11.7V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.3', 'M22 9.5V15'],
  activity: ['M3 12h4l3-8 4 16 3-8h4'],
  chart: ['M5 20V11', 'M12 20V4', 'M19 20v-6'],
  lock: ['M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  key: [c(8, 15, 4), 'M11 12l9-9', 'M17 6l3 3', 'M14 9l2 2'],
  refresh: ['M20 11a8 8 0 0 0-13.7-5.5L3 8.5', 'M3 4v4.5h4.5', 'M4 13a8 8 0 0 0 13.7 5.5L21 15.5', 'M21 20v-4.5h-4.5'],
  mail: ['M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M3 7.5l9 6 9-6'],
  copy: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  globe: [c(12, 12, 9), 'M3 12h18', 'M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z'],
  camera: ['M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', c(12, 13, 3.5)],
  briefcase: ['M4 8h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M3 13h18'],
  package: ['M4 8l8-4 8 4-8 4z', 'M4 8v8l8 4 8-4V8', 'M12 12v8'],
  code: ['M8 7l-5 5 5 5', 'M16 7l5 5-5 5', 'M14 4l-4 16'],
  music: ['M9 18V6l11-2v12', c(6.5, 18, 2.5), c(17.5, 16, 2.5)],
  at: [c(12, 12, 4), 'M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1'],
  folder: ['M3 7a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  trophy: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5v1.5A3 3 0 0 0 8 10.5', 'M16 6h3v1.5a3 3 0 0 1-3 3', 'M12 13v4', 'M8.5 20h7', 'M10 17h4'],
  flag: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
  award: [c(12, 9, 5.5), 'M8.7 13.6 7.5 21l4.5-2.5 4.5 2.5-1.2-7.4'],
  sparkles: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
  archive: ['M3 5h18v4H3z', 'M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9', 'M10 13h4'],
  hourglass: ['M7 3h10', 'M7 21h10', 'M8 3v3.5a4 4 0 0 0 1.5 3.1L12 12l-2.5 2.4A4 4 0 0 0 8 17.5V21', 'M16 3v3.5a4 4 0 0 1-1.5 3.1L12 12l2.5 2.4A4 4 0 0 1 16 17.5V21'],
  'user-plus': [c(9.5, 8, 3.5), 'M3 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1', 'M19 8v6', 'M16 11h6'],
  star: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z'],
  layout: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M4 9h16', 'M10 9v11'],
  'help-circle': [c(12, 12, 9), 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7', dot(12, 17)],
  'book-open': ['M12 6.5C10.5 5.2 8.5 4.5 5 4.5v13c3.5 0 5.5.7 7 2 1.5-1.3 3.5-2 7-2v-13c-3.5 0-5.5.7-7 2z', 'M12 6.5v13'],
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({ name, size = 20, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  const paths: readonly string[] = PATHS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: false })}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
