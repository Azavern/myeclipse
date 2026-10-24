// Menjalankan berkas pgTAP di supabase/tests lewat koneksi Postgres langsung.
// `supabase test db` menjalankan pg_prove di dalam container, jadi perintah itu
// gagal di mesin tanpa Docker. Skrip ini mengirim tiap berkas sebagai satu batch
// multi-statement ke POSTGRES_URL dan mencetak keluaran TAP apa adanya.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const TESTS_DIR = 'supabase/tests';

const USAGE = `Pemakaian: npm run test:db [-- --isolate] [berkas...]

  (tanpa argumen)  jalankan semua supabase/tests/*.test.sql
  --isolate        kosongkan data instance di dalam transaksi yang selalu
                   ROLLBACK, supaya tes bisa dinilai pada DB yang tidak baru
                   di-reset. Tidak ada perubahan yang tersimpan.
  --help           tampilkan pesan ini

Koneksi diambil dari POSTGRES_URL (.env.local atau environment).`;

// Sama seperti Next: .env.local hanya mengisi variabel yang belum ada.
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith('#')) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    const quoted = /^(['"])(.*)\1$/.exec(raw);
    process.env[key] = quoted ? quoted[2] : raw;
  }
}

const ISOLATE_SQL = `-- Awalan isolasi: berkas pgTAP mengasumsikan DB baru di-reset.
begin;
set local storage.allow_delete_query = 'true';
alter table public.memberships disable trigger user;
do $$ begin
  if to_regclass('storage.objects') is not null then delete from storage.objects; end if;
  if to_regclass('public.knowledge_audit') is not null then delete from public.knowledge_audit; end if;
  if to_regclass('public.knowledge_editors') is not null then delete from public.knowledge_editors; end if;
  if to_regclass('public.knowledge_edit_requests') is not null then delete from public.knowledge_edit_requests; end if;
  if to_regclass('public.knowledge_entry_tags') is not null then delete from public.knowledge_entry_tags; end if;
  if to_regclass('public.knowledge_entries') is not null then delete from public.knowledge_entries; end if;
end $$;
delete from public.class_activity;
delete from public.password_reset_requests;
delete from public.visibility_rules;
delete from public.portfolio_items;
delete from public.social_links;
delete from public.class_links;
delete from public.schedules;
delete from public.events;
delete from public.tasks;
delete from public.member_profiles;
delete from public.memberships;
alter table public.memberships enable trigger user;
`;

const TAP_LINE = /^(?:ok |not ok |1\.\.|# |Bail out!)/;

function testFiles(paths) {
  if (paths.length === 0)
    return readdirSync(TESTS_DIR)
      .filter((name) => name.endsWith('.test.sql'))
      .sort()
      .map((name) => join(TESTS_DIR, name));
  return paths.flatMap((path) =>
    statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.test.sql'))
          .sort()
          .map((name) => join(path, name))
      : [path],
  );
}

loadEnvFile('.env.local');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const unknown = args.find((arg) => arg.startsWith('-') && arg !== '--isolate');
if (unknown) {
  console.error(`Argumen tidak dikenal: ${unknown}\n\n${USAGE}`);
  process.exit(2);
}

const isolate = args.includes('--isolate');
const files = testFiles(args.filter((arg) => !arg.startsWith('-')));

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error('POSTGRES_URL belum diset. Isi di .env.local, misalnya connection string proyek Supabase atau');
  console.error('postgresql://postgres:postgres@127.0.0.1:54322/postgres setelah `supabase start`.');
  process.exit(2);
}

// Postgres Supabase hanya menerima koneksi ber-SSL; instans lokal biasanya tidak.
const local = /@(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(url);
const ssl = local || /[?&]sslmode=/.test(url) ? undefined : { rejectUnauthorized: false };

if (isolate) console.warn('--isolate: data instance dikosongkan di dalam transaksi yang selalu ROLLBACK.\n');

let bad = 0;
let okCount = 0;
let notOkCount = 0;

for (const file of files) {
  const client = new Client({ connectionString: url, ssl });
  const lines = [];
  let crash = null;
  try {
    await client.connect();
    const result = await client.query((isolate ? ISOLATE_SQL : '') + readFileSync(file, 'utf8'));
    for (const set of Array.isArray(result) ? result : [result])
      for (const row of set.rows)
        for (const value of Object.values(row))
          if (typeof value === 'string' && TAP_LINE.test(value)) lines.push(value);
  } catch (error) {
    crash = error.message;
  } finally {
    await client.end().catch(() => {});
  }

  const notOk = lines.filter((line) => line.startsWith('not ok ')).length;
  const ok = lines.filter((line) => line.startsWith('ok ')).length;
  okCount += ok;
  notOkCount += notOk;
  const failed = crash !== null || notOk > 0 || lines.length === 0;
  if (failed) bad += 1;

  console.log(`\n${file}`);
  console.log(lines.join('\n'));
  if (crash) console.log(`Bail out! ${crash}`);
  console.log(`→ ${ok} ok, ${notOk} not ok`);
}

console.log(`\n${files.length} berkas, ${okCount} ok, ${notOkCount} not ok${bad ? `, ${bad} berkas bermasalah` : ''}`);
process.exitCode = bad ? 1 : 0;
