/**
 * Menghapus akun anggota kelas, KECUALI Ketua (`npm run reset-users`).
 *
 * Dipakai untuk mengembalikan kelas ke kondisi "hanya Ketua" sebelum
 * `npm run seed` dijalankan lagi. Yang dihapus adalah akun Auth beserta
 * seluruh baris miliknya: membership, profil, portofolio, tautan sosial,
 * aturan visibilitas pribadi, dan objek Storage di folder `member-media`.
 *
 * Aman secara bawaan:
 *  - Tanpa `--yes`, skrip hanya mencetak rencana (tidak menghapus apa pun).
 *  - Akun Ketua dan role lain yang punya izin kelola (`class.manage` /
 *    `members.manage`) tidak pernah dihapus.
 *  - `--keep <username|email>` mengecualikan akun lain yang harus bertahan
 *    (mis. akun sistem).
 *  - Skrip berhenti bila tidak ada satu pun akun pengelola yang dilindungi.
 *  - Konten kelas (jadwal, event, tugas) tidak dihapus; kolom `created_by`
 *    menjadi NULL karena FK-nya `on delete set null`.
 *
 * Panduan menjalankan ada di `scripts/reset-users.md`.
 */

import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------- tipe & aturan

export type ResetMember = {
  userId: string;
  /** Bisa null bila akun Auth-nya tidak punya email. */
  email: string | null;
  username: string | null;
  status: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
};

export type ResetPlan = {
  keep: ResetMember[];
  remove: ResetMember[];
};

/**
 * Izin yang membuat sebuah role diperlakukan sebagai pengelola. Role dengan izin
 * ini tidak pernah ikut dihapus, walau key-nya bukan `ketua` (mis. Wakil di masa
 * depan) — menghapus pengelola terakhir akan melanggar invarian EC001.
 */
const PROTECTED_PERMISSIONS = ['class.manage', 'members.manage'] as const;

/** Role dengan key ini selalu dilindungi, apa pun isi `permissions`-nya. */
const PROTECTED_ROLE_KEY = 'ketua';

export function isProtectedMember(member: Pick<ResetMember, 'roleKey' | 'permissions'>): boolean {
  if (member.roleKey === PROTECTED_ROLE_KEY) return true;
  return PROTECTED_PERMISSIONS.some((permission) => member.permissions.includes(permission));
}

/** Memisahkan anggota yang dilindungi dari yang akan dihapus. */
export function partitionMembers(members: readonly ResetMember[]): ResetPlan {
  const keep: ResetMember[] = [];
  const remove: ResetMember[] = [];

  for (const member of members) {
    (isProtectedMember(member) ? keep : remove).push(member);
  }

  return { keep, remove };
}

/**
 * Argumen CLI. Bawaan adalah rencana saja; penghapusan harus diminta eksplisit
 * dengan `--yes` supaya tidak pernah terjadi karena perintah yang terlanjur
 * dijalankan.
 *
 * `--keep <username|email>` (boleh diulang) mengecualikan akun tertentu, mis.
 * akun sistem yang bukan Ketua tetapi tidak boleh ikut dihapus.
 */
export type ResetArgs = { execute: boolean; keep: string[] };

export function parseResetArgs(argv: readonly string[]): ResetArgs {
  let execute = false;
  let dryRun = false;
  const keep: string[] = [];

  const addKeep = (value: string | undefined) => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) throw new ResetError('--keep memerlukan username atau email.');
    if (!keep.includes(normalized)) keep.push(normalized);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--yes') execute = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--keep') {
      addKeep(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--keep=')) {
      addKeep(arg.slice('--keep='.length));
    } else {
      throw new ResetError(
        `Argumen "${arg}" tidak dikenal. Pakai --dry-run, --yes, atau --keep <username|email>.`,
      );
    }
  }

  if (execute && dryRun) {
    throw new ResetError('Pilih salah satu: --dry-run atau --yes, bukan keduanya.');
  }

  return { execute, keep };
}

/**
 * Memindahkan akun yang disebut `--keep` ke kelompok yang dilindungi.
 *
 * Nilai yang tidak cocok dengan anggota mana pun dikembalikan terpisah supaya
 * salah ketik tidak diam-diam berakhir dengan akun itu ikut terhapus.
 */
export function applyKeepList(
  plan: ResetPlan,
  keepKeys: readonly string[],
): { plan: ResetPlan; unknown: string[] } {
  const aliasesOf = (member: ResetMember): string[] =>
    [member.username?.toLowerCase(), member.email?.toLowerCase()].filter((alias): alias is string =>
      Boolean(alias),
    );

  const wanted = new Set(keepKeys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  const matched = new Set<string>();
  const keep = [...plan.keep];
  const remove: ResetMember[] = [];

  // Akun yang sudah dilindungi tetap dihitung cocok, supaya menyebut username
  // Ketua di --keep tidak berakhir sebagai "tidak ditemukan".
  for (const member of plan.keep) {
    for (const alias of aliasesOf(member)) if (wanted.has(alias)) matched.add(alias);
  }

  for (const member of plan.remove) {
    const hit = aliasesOf(member).find((alias) => wanted.has(alias));

    if (hit) {
      matched.add(hit);
      keep.push(member);
    } else {
      remove.push(member);
    }
  }

  return {
    plan: { keep, remove },
    unknown: [...wanted].filter((key) => !matched.has(key)),
  };
}

/**
 * Pemeriksaan sebelum satu baris pun dihapus. Mengembalikan daftar masalah;
 * daftar kosong berarti rencana aman dijalankan.
 */
export function validatePlan(plan: ResetPlan, totalMembers: number): string[] {
  const problems: string[] = [];

  if (totalMembers === 0) {
    problems.push('Kelas belum punya anggota. Tidak ada yang perlu direset.');
  } else if (plan.keep.length === 0) {
    problems.push(
      'Tidak ada akun Ketua/pengelola yang bisa dilindungi. ' +
        'Periksa role di database sebelum menjalankan reset.',
    );
  }

  return problems;
}

/** Ringkasan satu baris untuk rencana/hasil. */
export function describeMember(member: ResetMember): string {
  const identity = member.username
    ? `${member.username} <${member.email ?? 'tanpa email'}>`
    : (member.email ?? member.userId);
  return `${identity} — ${member.roleName} (${member.status})`;
}

// ---------------------------------------------------------------- konfigurasi

class ResetError extends Error {}

function fail(message: string): never {
  throw new ResetError(message);
}

function readEnv(): { url: string; secret: string } {
  // Nama kanonis mengikuti .env.example; nama lama diterima sebagai fallback.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!secret) missing.push('SUPABASE_SECRET_KEY');
  if (missing.length > 0) {
    fail(
      `Env berikut belum diisi: ${missing.join(', ')}. ` +
        'Salin .env.example menjadi .env lalu isi nilainya (kunci service role).',
    );
  }

  return { url, secret };
}

// ---------------------------------------------------------------- bantuan data

type RoleRow = { id: string; key: string; name: string; permissions: string[] };
type MembershipRow = { user_id: string; role_id: string; status: string };
type ProfileRow = { user_id: string; username: string };

/** Semua user Auth, dengan pagination. */
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

/** Isi folder Storage secara rekursif (path penuh), dibatasi kedalamannya. */
async function listStoragePrefix(
  admin: SupabaseClient,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 3) return [];

  const { data, error } = await admin.storage.from('member-media').list(prefix, { limit: 1000 });
  if (error) {
    console.error(`  ! Gagal membaca folder Storage ${prefix}: ${error.message}`);
    return [];
  }

  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    // Entri folder tidak punya id; rekursi satu tingkat per folder.
    if (entry.id === null || entry.id === undefined) {
      paths.push(...(await listStoragePrefix(admin, path, depth + 1)));
    } else {
      paths.push(path);
    }
  }

  return paths;
}

/** Hapus objek Storage milik satu anggota; kegagalan dicatat, bukan fatal. */
async function removeMemberStorage(
  admin: SupabaseClient,
  classId: string,
  userId: string,
): Promise<number> {
  const prefix = `${classId}/${userId}`;
  const paths = await listStoragePrefix(admin, prefix);
  if (paths.length === 0) return 0;

  let removed = 0;
  // Supabase membatasi jumlah path per panggilan; potong agar tetap aman.
  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error } = await admin.storage.from('member-media').remove(chunk);
    if (error) {
      console.error(
        `  ! Gagal menghapus ${chunk.length} objek Storage ${prefix}: ${error.message}`,
      );
      continue;
    }
    removed += chunk.length;
  }

  return removed;
}

// ---------------------------------------------------------------- utama

async function main(): Promise<void> {
  const { execute, keep } = parseResetArgs(process.argv.slice(2));

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

  const [{ data: roleRows, error: roleError }, { data: membershipRows, error: membershipError }] =
    await Promise.all([
      admin.from('roles').select('id, key, name, permissions').eq('class_id', classId),
      admin.from('memberships').select('user_id, role_id, status').eq('class_id', classId),
    ]);

  if (roleError) fail(`Gagal membaca role: ${roleError.message}`);
  if (membershipError) fail(`Gagal membaca membership: ${membershipError.message}`);

  const roles = new Map<string, RoleRow>(
    ((roleRows ?? []) as RoleRow[]).map((role) => [role.id, role]),
  );
  const memberships = (membershipRows ?? []) as MembershipRow[];

  const { data: profileRows, error: profileError } = await admin
    .from('member_profiles')
    .select('user_id, username')
    .eq('class_id', classId);
  if (profileError) fail(`Gagal membaca profil anggota: ${profileError.message}`);

  const usernames = new Map<string, string>(
    ((profileRows ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile.username]),
  );

  const emails = new Map<string, string | null>();
  for (const user of await listAuthUsers(admin)) emails.set(user.id, user.email);

  const members: ResetMember[] = memberships.map((membership) => {
    const role = roles.get(membership.role_id);
    return {
      userId: membership.user_id,
      email: emails.get(membership.user_id) ?? null,
      username: usernames.get(membership.user_id) ?? null,
      status: membership.status,
      roleKey: role?.key ?? 'tidak_dikenal',
      roleName: role?.name ?? 'Role tidak dikenal',
      permissions: role?.permissions ?? [],
    };
  });

  const requested = applyKeepList(partitionMembers(members), keep);
  const plan = requested.plan;
  const problems = validatePlan(plan, members.length);

  for (const key of requested.unknown) {
    problems.push(`--keep "${key}" tidak cocok dengan username atau email anggota mana pun.`);
  }
  if (problems.length > 0) {
    console.error('Reset dibatalkan:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  // Ringkasan konten yang ikut terhapus — supaya operator melihat dampaknya
  // sebelum menambahkan --yes.
  const removedIds = plan.remove.map((member) => member.userId);
  const counts = new Map<string, { portfolio: number; social: number; visibility: number }>();
  const bump = (userId: string, key: 'portfolio' | 'social' | 'visibility') => {
    const entry = counts.get(userId) ?? { portfolio: 0, social: 0, visibility: 0 };
    entry[key] += 1;
    counts.set(userId, entry);
  };

  if (removedIds.length > 0) {
    const [{ data: portfolioRows }, { data: socialRows }, { data: ruleRows }] = await Promise.all([
      admin
        .from('portfolio_items')
        .select('user_id')
        .eq('class_id', classId)
        .in('user_id', removedIds),
      admin
        .from('social_links')
        .select('user_id')
        .eq('class_id', classId)
        .in('user_id', removedIds),
      admin
        .from('visibility_rules')
        .select('owner_id')
        .eq('class_id', classId)
        .in('owner_id', removedIds),
    ]);

    for (const row of (portfolioRows ?? []) as { user_id: string }[])
      bump(row.user_id, 'portfolio');
    for (const row of (socialRows ?? []) as { user_id: string }[]) bump(row.user_id, 'social');
    for (const row of (ruleRows ?? []) as { owner_id: string }[]) bump(row.owner_id, 'visibility');
  }

  console.log(`${execute ? '' : '[dry-run] '}Rencana reset anggota kelas "${className}":`);
  console.log('');

  for (const member of plan.keep) {
    console.log(`  [lindungi] ${describeMember(member)}`);
  }
  for (const member of plan.remove) {
    const extra = counts.get(member.userId);
    const detail =
      extra && (extra.portfolio > 0 || extra.social > 0 || extra.visibility > 0)
        ? ` — ${extra.portfolio} portofolio, ${extra.social} tautan sosial, ${extra.visibility} aturan visibilitas`
        : '';
    console.log(`  [hapus]    ${describeMember(member)}${detail}`);
  }

  console.log('');
  console.log(
    `Ringkasan rencana: ${plan.keep.length} dilindungi, ${plan.remove.length} akan dihapus.`,
  );

  if (!execute) {
    console.log('');
    console.log('Belum ada yang dihapus. Jalankan `npm run reset-users -- --yes` untuk menghapus.');
    return;
  }

  if (plan.remove.length === 0) {
    console.log('');
    console.log('Tidak ada akun anggota yang perlu dihapus.');
    return;
  }

  console.log('');

  const deletedEmails: string[] = [];
  const failures: string[] = [];
  let deleted = 0;
  let storageRemoved = 0;

  for (const member of plan.remove) {
    const label = member.username ?? member.userId;

    const { error: deleteError } = await admin.auth.admin.deleteUser(member.userId);
    if (deleteError) {
      failures.push(`${label}: gagal menghapus akun Auth — ${deleteError.message}`);
      continue;
    }

    deleted += 1;

    // FK `memberships.user_id` on delete cascade menghapus membership, profil,
    // portofolio, tautan sosial, dan aturan visibilitas pribadi sekaligus.
    const { data: leftover, error: checkError } = await admin
      .from('memberships')
      .select('id')
      .eq('class_id', classId)
      .eq('user_id', member.userId)
      .maybeSingle();

    let verified = true;
    if (checkError) {
      verified = false;
      failures.push(
        `${label}: akun Auth terhapus, tetapi verifikasi membership gagal — ${checkError.message}`,
      );
    } else if (leftover) {
      verified = false;
      failures.push(`${label}: akun Auth terhapus, tetapi membership masih ada. Periksa manual.`);
    }

    if (member.email) deletedEmails.push(member.email);
    storageRemoved += await removeMemberStorage(admin, classId, member.userId);

    console.log(`  [${verified ? 'ok' : 'sebagian'}]       ${describeMember(member)} dihapus.`);
  }

  // Permintaan ganti kata sandi merujuk email, bukan FK user. Baris untuk email
  // yang akunnya sudah tidak ada akan gagal saat Ketua menekan "Buat tautan",
  // jadi ikut dibersihkan.
  let resetRequestsRemoved = 0;
  if (deletedEmails.length > 0) {
    const { data: removedRows, error: resetError } = await admin
      .from('password_reset_requests')
      .delete()
      .eq('class_id', classId)
      .in('email', deletedEmails)
      .select('id');

    if (resetError) {
      console.error(`  ! Gagal membersihkan antrean ganti kata sandi: ${resetError.message}`);
    } else {
      resetRequestsRemoved = removedRows?.length ?? 0;
    }
  }

  console.log('');
  console.log(
    `Ringkasan: ${deleted} akun dihapus, ` +
      `${storageRemoved} objek Storage dibersihkan, ` +
      `${resetRequestsRemoved} permintaan ganti kata sandi dibersihkan, ` +
      `${plan.keep.length} akun dilindungi, ${failures.length} gagal.`,
  );
  console.log('Konten kelas (jadwal, event, tugas) tetap ada; pembuatnya menjadi NULL.');

  if (failures.length > 0) {
    console.error('\nAkun yang gagal dihapus:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('\nPerbaiki penyebabnya lalu jalankan ulang.');
    process.exitCode = 1;
  }
}

// Hanya jalankan bila dieksekusi langsung, bukan saat diimpor unit test.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    // Pesan untuk operator; nilai env dan kredensial tidak pernah dicetak.
    console.error(`\nGAGAL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
