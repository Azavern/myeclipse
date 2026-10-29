/**
 * Membuat akun seed untuk seluruh anggota kelas (`npm run seed`).
 *
 * Satu-satunya tempat yang perlu diisi adalah konstanta `SEED_MEMBERS` di bawah:
 * username, email, nama lengkap, dan peran (`member`/`ketua`). Kata sandi per
 * baris opsional; bila dihilangkan, dipakai `SEED_PASSWORD`.
 *
 * Skrip idempoten: akun Auth yang emailnya sudah ada dipakai ulang (kata
 * sandinya tidak diubah), membership dan profil diselaraskan dengan konstanta.
 * `--dry-run` hanya membaca dan mencetak rencana, tanpa menulis apa pun.
 *
 * Komposit: Auth Admin API (service role) + tulisan langsung ke `memberships`
 * dan `member_profiles`. RPC `provision_member` tidak dipakai karena fungsi itu
 * memeriksa permission pemanggil, sedangkan pemanggil di sini adalah service
 * role tanpa membership — pola yang sama dengan `bootstrap-admin.ts`.
 *
 * Keamanan:
 *  - Kata sandi seed dipakai bersama dan ditulis di repo. Ini hanya untuk akun
 *    kelas/demo, bukan akun dengan data sensitif.
 *  - Email dan nama yang diisi di sini ikut repositori bila di-commit. Jangan
 *    isi data pribadi yang tidak boleh tersebar.
 *  - Kunci service role hanya dibaca dari env, tidak pernah dicetak.
 *
 * Lingkungan dibaca dari `.env.local` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`)
 * lewat `@next/env`, sama seperti `bootstrap-admin.ts`.
 */

import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

// ---------------------------------------------------------------- konstanta

export type SeedMemberRole = 'member' | 'ketua';

export type SeedMember = {
  /** Huruf kecil, angka, dan garis bawah; 3–30 karakter. Unik di kelas. */
  username: string;
  email: string;
  fullName: string;
  /** `'member'` = Anggota, `'ketua'` = Ketua (key role di database). */
  role: SeedMemberRole;
  /** Opsional; bila dihilangkan, dipakai `SEED_PASSWORD`. */
  password?: string;
};

/**
 * Kata sandi bawaan untuk akun seed (dipakai bila satu baris tidak mengisi
 * `password`). 10 karakter — memenuhi batas minimum kata sandi baru di
 * `src/features/auth/actions.ts` (`min(10)`) dan `minimum_password_length`
 * pada `supabase/config.toml`.
 */
export const SEED_PASSWORD = 'Ecl.meM?123Sepuh';

/** Kata sandi efektif satu baris seed. */
function passwordOf(member: SeedMember): string {
  return member.password ?? SEED_PASSWORD;
}

/**
 * 18 (harusnya 23) anggota. Isi `username`, `email`, dan `fullName`; `role` bawaan `'member'`.
 * `password` boleh dihilangkan karena memakai `SEED_PASSWORD`; isi hanya bila
 * satu akun perlu kata sandi berbeda. Peran Ketua memakai `role: 'ketua'`.
 */
export const SEED_MEMBERS: SeedMember[] = [
  { username: 'said', email: 'said@myeclipse.my.id', fullName: 'Said', role: 'member', password: SEED_PASSWORD },
  { username: 'jua', email: 'jua@myeclipse.my.id', fullName: 'Jawa?', role: 'member', password: SEED_PASSWORD },
  { username: 'nurul', email: 'nurul@myeclipse.my.id', fullName: 'Nurul', role: 'member', password: SEED_PASSWORD },
  { username: 'nabila', email: 'nabila@myeclipse.my.id', fullName: 'Nabila', role: 'member', password: SEED_PASSWORD },
  { username: 'tiara', email: 'tiara@myeclipse.my.id', fullName: 'Titi', role: 'member', password: SEED_PASSWORD },
  { username: 'cini', email: 'cini@myeclipse.my.id', fullName: 'Cini', role: 'member', password: SEED_PASSWORD },
  { username: 'gibran', email: 'gibran@myeclipse.my.id', fullName: 'Gibran', role: 'member', password: SEED_PASSWORD },
  { username: 'dapa', email: 'dapa@myeclipse.my.id', fullName: 'Dapa', role: 'member', password: SEED_PASSWORD },
  { username: 'abel', email: 'abel@myeclipse.my.id', fullName: 'Abela', role: 'ketua', password: SEED_PASSWORD },
  { username: 'ihsan', email: 'iben@myeclipse.my.id', fullName: 'Iben', role: 'member', password: SEED_PASSWORD },
  { username: 'eka', email: 'eka@myeclipse.my.id', fullName: 'Eka', role: 'member', password: SEED_PASSWORD },
  { username: 'rara', email: 'rara@myeclipse.my.id', fullName: 'Rara', role: 'member', password: SEED_PASSWORD },
  { username: 'abdul', email: 'abdul@myeclipse.my.id', fullName: 'Abdul', role: 'member', password: SEED_PASSWORD },
  { username: 'zain', email: 'zain@myeclipse.my.id', fullName: 'Zawa', role: 'member', password: SEED_PASSWORD },
  { username: 'robby', email: 'robby@myeclipse.my.id', fullName: 'Rob', role: 'member', password: SEED_PASSWORD },
  { username: 'tio', email: 'tio@myeclipse.my.id', fullName: 'Tio', role: 'member', password: SEED_PASSWORD },
  { username: 'yusuf', email: 'yusuf@myeclipse.my.id', fullName: 'ucup', role: 'member', password: SEED_PASSWORD },
  { username: 'ilman', email: 'ilman@myeclipse.my.id', fullName: 'Ilman', role: 'member', password: SEED_PASSWORD },
];

// ---------------------------------------------------------------- validasi

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 72;

/**
 * Memeriksa konstanta sebelum database disentuh. Satu baris yang bermasalah
 * dilaporkan sebagai satu pesan berisi semua temuan untuk baris itu.
 *
 * Diekspor agar logika ini bisa diperiksa tanpa koneksi jaringan.
 */
export function validateSeedMembers(members: readonly SeedMember[]): string[] {
  const problems: string[] = [];
  const usernameRows = new Map<string, number>();
  const emailRows = new Map<string, number>();

  members.forEach((member, index) => {
    const row = index + 1;
    const issues: string[] = [];
    const username = member.username.trim();
    const email = member.email.trim().toLowerCase();
    const fullName = member.fullName.trim();

    if (!username) {
      issues.push('username belum diisi.');
    } else {
      if (!USERNAME_PATTERN.test(username)) {
        issues.push('username harus 3–30 karakter, hanya huruf kecil, angka, dan garis bawah.');
      }
      const firstRow = usernameRows.get(username);
      if (firstRow !== undefined) issues.push(`username sama dengan baris ${firstRow}.`);
      else usernameRows.set(username, row);
    }

    if (!email) {
      issues.push('email belum diisi.');
    } else {
      if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        issues.push('format email tidak valid.');
      }
      const firstRow = emailRows.get(email);
      if (firstRow !== undefined) issues.push(`email sama dengan baris ${firstRow}.`);
      else emailRows.set(email, row);
    }

    if (!fullName) {
      issues.push('nama lengkap belum diisi.');
    } else if (fullName.length > 80) {
      issues.push('nama lengkap maksimal 80 karakter.');
    }

    if (member.role !== 'member' && member.role !== 'ketua') {
      issues.push("peran harus 'member' atau 'ketua'.");
    }

    const password = passwordOf(member);
    if (password.length < PASSWORD_MIN) {
      issues.push(`kata sandi minimal ${PASSWORD_MIN} karakter.`);
    } else if (password.length > PASSWORD_MAX) {
      issues.push(`kata sandi maksimal ${PASSWORD_MAX} karakter.`);
    }

    if (issues.length > 0) problems.push(`Baris ${row}: ${issues.join(' ')}`);
  });

  return problems;
}

// ---------------------------------------------------------------- konfigurasi

function readEnv(): { url: string; secret: string } {
  // Hanya nama kanonis (.env.example); tidak ada variabel NEXT_PUBLIC_* di
  // proyek ini karena semua kunci hanya dibaca di server.
  const url = process.env.SUPABASE_URL ?? '';
  const secret = process.env.SUPABASE_SECRET_KEY ?? '';

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!secret) missing.push('SUPABASE_SECRET_KEY');
  if (missing.length > 0) {
    fail(
      `Env berikut belum diisi: ${missing.join(', ')}. ` +
        'Salin .env.example menjadi .env.local lalu isi nilainya (kunci service role).',
    );
  }

  return { url, secret };
}

class SeedError extends Error {}

function fail(message: string): never {
  throw new SeedError(message);
}

/** Semua user Auth, dengan pagination — kelas bisa lebih dari 1000 akun. */
async function listAuthUsers(
  admin: SupabaseClient,
): Promise<{ id: string; email: string | null }[]> {
  const users: { id: string; email: string | null }[] = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Gagal membaca daftar user Auth: ${error.message}`);

    const batch = data?.users ?? [];
    for (const user of batch) users.push({ id: user.id, email: user.email ?? null });
    if (batch.length < perPage) break;
  }

  return users;
}

/** Kompensasi: jangan tinggalkan akun Auth tanpa membership/profil. */
async function discardUser(admin: SupabaseClient, userId: string, label: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.error(`  ! User Auth ${label} gagal dibersihkan: ${error.message}`);
}

// ---------------------------------------------------------------- utama

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  // 1. Konstanta diperiksa lebih dulu, sebelum env dan database.
  const problems = validateSeedMembers(SEED_MEMBERS);
  if (problems.length > 0) {
    console.error('SEED_MEMBERS belum siap:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('\nIsi konstanta di scripts/seed-fixtures.ts lalu jalankan lagi.');
    process.exitCode = 1;
    return;
  }

  // 2. Konfigurasi dan data referensi. Env dimuat dari .env.local/.env seperti
  //    skrip lain; nilai env tidak pernah dicetak.
  loadEnvConfig(process.cwd());
  const { url, secret } = readEnv();
  const admin = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: classRow, error: classError } = await admin
    .from('classes')
    .select('id, name')
    .limit(1)
    .maybeSingle();
  if (classError) fail(`Gagal membaca kelas: ${classError.message}`);
  if (!classRow) fail('Kelas belum ada. Jalankan migrasi data referensi dulu.');

  const classId: string = classRow.id;
  const className: string = classRow.name;

  const { data: roleRows, error: roleError } = await admin
    .from('roles')
    .select('id, key')
    .eq('class_id', classId);
  if (roleError) fail(`Gagal membaca role: ${roleError.message}`);

  const roleIds = new Map<string, string>();
  for (const role of roleRows ?? []) roleIds.set(role.key, role.id);

  for (const key of ['member', 'ketua'] as const) {
    if (!roleIds.has(key)) {
      fail(`Role "${key}" belum ada. Jalankan migrasi data referensi dulu.`);
    }
  }

  // 3. Peta username/email yang sudah ada, untuk cek bentrok sebelum menulis.
  const users = await listAuthUsers(admin);
  const emailById = new Map<string, string>();
  const userByEmail = new Map<string, string>();
  for (const user of users) {
    if (!user.email) continue;
    const email = user.email.toLowerCase();
    emailById.set(user.id, email);
    userByEmail.set(email, user.id);
  }

  const { data: profileRows, error: profileError } = await admin
    .from('member_profiles')
    .select('username, user_id')
    .eq('class_id', classId);
  if (profileError) fail(`Gagal membaca profil anggota: ${profileError.message}`);

  const usernameOwner = new Map<string, string>();
  for (const profile of profileRows ?? []) {
    usernameOwner.set(profile.username, profile.user_id);
  }

  // Username milik akun lain menghentikan seluruh jalannya skrip sebelum satu
  // tulisan pun terjadi, supaya tidak ada kelas yang terisi setengah.
  const conflicts: string[] = [];
  SEED_MEMBERS.forEach((member, index) => {
    const username = member.username.trim();
    const email = member.email.trim().toLowerCase();
    const owner = usernameOwner.get(username);
    if (!owner) return;
    const ownerEmail = emailById.get(owner);
    if (ownerEmail !== email) {
      conflicts.push(
        `Baris ${index + 1}: username "${username}" sudah dipakai ` +
          `${ownerEmail ?? `user ${owner}`}. Ganti username di konstanta.`,
      );
    }
  });

  if (conflicts.length > 0) {
    console.error('Username bentrok dengan anggota yang sudah ada:');
    for (const conflict of conflicts) console.error(`  - ${conflict}`);
    console.error('\nTidak ada yang ditulis ke database.');
    process.exitCode = 1;
    return;
  }

  // 4. Buat/selaraskan tiap anggota.
  const failures: string[] = [];
  let created = 0;
  let reused = 0;
  let skipped = 0;

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Menyiapkan ${SEED_MEMBERS.length} akun untuk kelas "${className}"…`,
  );

  for (const member of SEED_MEMBERS) {
    const username = member.username.trim();
    const email = member.email.trim().toLowerCase();
    const fullName = member.fullName.trim();
    const label = `${username} <${email}>`;
    const roleId = roleIds.get(member.role);

    if (!roleId) {
      failures.push(`${label}: role "${member.role}" tidak ada.`);
      continue;
    }

    let userId = userByEmail.get(email);
    let createdUser = false;

    if (!userId) {
      if (dryRun) {
        console.log(`[dry-run] ${label}: akun Auth, membership aktif, dan profil akan dibuat.`);
        created += 1;
        continue;
      }

      const { data: createdAuth, error: createError } = await admin.auth.admin.createUser({
        email,
        password: passwordOf(member),
        email_confirm: true,
      });

      if (createError || !createdAuth?.user) {
        failures.push(
          `${label}: gagal membuat akun Auth — ${createError?.message ?? 'tidak diketahui'}`,
        );
        continue;
      }

      userId = createdAuth.user.id;
      createdUser = true;
      userByEmail.set(email, userId);
    }

    const { data: membership, error: membershipError } = await admin
      .from('memberships')
      .select('id, status, role_id')
      .eq('class_id', classId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      failures.push(`${label}: gagal membaca membership — ${membershipError.message}`);
      if (createdUser) await discardUser(admin, userId, label);
      continue;
    }

    // Akun yang sengaja dinonaktifkan tidak diaktifkan diam-diam oleh seed.
    if (membership?.status === 'inactive') {
      console.log(`[skip] ${label}: membership tidak aktif — dibiarkan, aktifkan lewat UI.`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      const action = !membership
        ? 'membership aktif dan profil akan dibuat'
        : membership.status === 'invited'
          ? 'membership akan diaktifkan, peran diselaraskan, dan profil diperbarui'
          : membership.role_id === roleId
            ? 'sudah ada; profil akan diselaraskan'
            : `peran akan diubah menjadi "${member.role}" dan profil diselaraskan`;
      console.log(`[dry-run] ${label}: ${action}.`);
      reused += 1;
      continue;
    }

    let membershipCreated = false;

    if (!membership) {
      const { error: insertError } = await admin.from('memberships').insert({
        class_id: classId,
        user_id: userId,
        role_id: roleId,
        // `active` (bukan `invited`): kata sandi sudah diisi, jadi anggota bisa
        // langsung masuk tanpa tautan akses sekali pakai.
        status: 'active',
        joined_at: new Date().toISOString(),
      });

      if (insertError) {
        failures.push(`${label}: gagal membuat membership — ${insertError.message}`);
        if (createdUser) await discardUser(admin, userId, label);
        continue;
      }

      membershipCreated = true;
    } else {
      const patch: Record<string, string> = {};
      if (membership.role_id !== roleId) patch.role_id = roleId;
      if (membership.status === 'invited') {
        patch.status = 'active';
        patch.joined_at = new Date().toISOString();
      }

      if (Object.keys(patch).length > 0) {
        const { error: updateError } = await admin
          .from('memberships')
          .update(patch)
          .eq('class_id', classId)
          .eq('user_id', userId);

        if (updateError) {
          failures.push(`${label}: gagal memperbarui membership — ${updateError.message}`);
          continue;
        }
      }
    }

    const { error: upsertError } = await admin.from('member_profiles').upsert(
      {
        class_id: classId,
        user_id: userId,
        username,
        full_name: fullName,
      },
      { onConflict: 'class_id,user_id' },
    );

    if (upsertError) {
      failures.push(`${label}: gagal menyimpan profil — ${upsertError.message}`);

      // Kompensasi: baris membership yang baru dibuat ikut dibersihkan.
      if (membershipCreated) {
        const { error: rollbackError } = await admin
          .from('memberships')
          .delete()
          .eq('class_id', classId)
          .eq('user_id', userId);
        if (rollbackError) {
          console.error(`  ! Membership ${label} gagal dibersihkan: ${rollbackError.message}`);
        }
      }
      if (createdUser) await discardUser(admin, userId, label);
      continue;
    }

    if (createdUser) created += 1;
    else reused += 1;

    console.log(
      `[ok] ${label}: ${createdUser ? 'dibuat' : 'sudah ada / diperbarui'} (${member.role}).`,
    );
  }

  // 5. Ringkasan.
  console.log('');
  if (dryRun) console.log('Mode --dry-run: tidak ada yang ditulis ke database.');
  console.log(
    `Ringkasan: ${created} dibuat, ${reused} dipakai ulang/diperbarui, ${skipped} dilewati, ` +
      `${failures.length} gagal.`,
  );
  console.log(
    'Kata sandi akun seed mengikuti SEED_PASSWORD di scripts/seed-fixtures.ts, ' +
      'kecuali baris yang mengisi `password` sendiri.',
  );

  if (failures.length > 0) {
    console.error('\nAkun yang gagal:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('\nPerbaiki penyebabnya lalu jalankan ulang; akun yang sudah jadi dilewati.');
    process.exitCode = 1;
  }
}

// Hanya jalankan bila dieksekusi langsung, bukan saat diimpor unit test.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    // SeedError berisi pesan untuk operator; galat lain tetap dicetak pesannya
    // tanpa pernah menyertakan nilai env atau kata sandi.
    console.error(`\nGAGAL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
