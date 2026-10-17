// Melarang nilai warna/ukuran mentah di komponen (blueprint §17.2). Token hidup di globals.css dan lib/theme.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/components', 'src/features', 'src/app'];
const SKIP = ['src/features/theme']; // editor tema memang bekerja dengan nilai hex dari pengguna
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'warna hex'],
  [/\b(?:rgb|hsl)a?\(/, 'warna rgb/hsl'],
  [/\b[\w-]+-\[[^\]]+\]/, 'nilai arbitrer ala Tailwind'],
  [/(?:color|background)\s*:\s*['"](?!var\()/, 'warna literal di style'],
];
const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).replaceAll('\\', '/');
    if (statSync(p).isDirectory()) { if (!SKIP.includes(p)) walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(p)) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('token-ok')) return;
      for (const [re, why] of RULES) if (re.test(line)) bad.push(`${p}:${i + 1} ${why}: ${line.trim().slice(0, 80)}`);
    });
  }
}
ROOTS.forEach(walk);
if (bad.length) { console.error(`check-tokens: ${bad.length} pelanggaran\n${bad.join('\n')}`); process.exit(1); }
console.log('check-tokens: bersih');
