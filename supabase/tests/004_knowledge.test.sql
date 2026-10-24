-- pgTAP 004: RLS dan alur izin Eclipse Knowledge (migrasi 0014).
-- Fokus: batas baca publik, langit-langit page.knowledge, permintaan edit,
-- persetujuan penulis/Ketua, pencabutan, versi, dan audit.
-- Lulus 105/105 pada proyek Supabase asli (PostgreSQL 17.11, pgTAP 1.3.3) dengan data instance dinetralkan di dalam transaksi.
begin;
select plan(105);

create function public.t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function public.t_rows(text) to public;

-- Fixture: K = Ketua, A = penulis, B/C = anggota, I = undangan belum aktif.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'k@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'i@example.test');
insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, u.st::public.membership_status, case when u.st = 'active' then now() end
  from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000d1'::uuid, 'ketua', 'active'),
    ('00000000-0000-0000-0000-0000000000d2'::uuid, 'member', 'active'),
    ('00000000-0000-0000-0000-0000000000d3'::uuid, 'member', 'active'),
    ('00000000-0000-0000-0000-0000000000d4'::uuid, 'member', 'active'),
    ('00000000-0000-0000-0000-0000000000d5'::uuid, 'member', 'invited')
  ) u(id, rk, st) on true
  join public.roles r on r.class_id = c.id and r.key = u.rk;
insert into public.member_profiles (class_id, user_id, username, full_name)
select c.id, u.id, u.un, u.fn from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000d1'::uuid, 'fx_k', 'Ketua Fixture'),
    ('00000000-0000-0000-0000-0000000000d2'::uuid, 'fx_a', 'Author A'),
    ('00000000-0000-0000-0000-0000000000d3'::uuid, 'fx_b', 'Member B'),
    ('00000000-0000-0000-0000-0000000000d4'::uuid, 'fx_c', 'Member C'),
    ('00000000-0000-0000-0000-0000000000d5'::uuid, 'fx_i', 'Undangan I')
  ) u(id, un, fn) on true;
select set_config('tap.class_id', (select id::text from public.classes), false);

-- ===== Buat entri lewat RPC sebagai penulis ==================================
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.create_knowledge_entry(
  'Catatan Algoritma', 'Ringkasan sorting', '# Algoritma. Isi awal.',
  'Kuliah', 'published', 'public', array['Algoritma', 'Sorting', 'algoritma']) $$,
  'A membuat entri publik');
select lives_ok($$ select public.create_knowledge_entry(
  'Catatan Kelas', null, 'Materi khusus anggota.', 'Kuliah',
  'published', 'class_only', array['Ujian']) $$, 'A membuat entri anggota kelas');
select lives_ok($$ select public.create_knowledge_entry(
  'Tautan Saja', 'Hanya lewat tautan', 'Referensi eksternal.', 'Tautan',
  'published', 'unlisted', array['Referensi']) $$, 'A membuat entri tautan saja');
select lives_ok($$ select public.create_knowledge_entry(
  'Draf Pribadi', null, 'Belum siap.', null,
  'draft', 'private', array['Pribadi']) $$, 'A membuat draf privat');
select lives_ok($$ select public.create_knowledge_entry(
  'Catatan Algoritma', null, 'Draf kedua.', 'Kuliah',
  'draft', 'private', array['Algoritma']) $$, 'judul sama membuat slug kedua');

do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.create_knowledge_entry(
  'Catatan B', 'Dari anggota lain', 'Isi B.', 'Umum',
  'published', 'public', array['Algoritma']) $$, 'B membuat entri publik');

reset role;
select set_config('tap.kb_public', (select id::text from public.knowledge_entries
  where slug = 'catatan-algoritma' and status = 'published'), false);
select set_config('tap.kb_class', (select id::text from public.knowledge_entries
  where slug = 'catatan-kelas'), false);
select set_config('tap.kb_unlisted', (select id::text from public.knowledge_entries
  where slug = 'tautan-saja'), false);
select set_config('tap.kb_draft', (select id::text from public.knowledge_entries
  where slug = 'draf-pribadi'), false);
select set_config('tap.kb_dup', (select id::text from public.knowledge_entries
  where slug = 'catatan-algoritma-2'), false);
select set_config('tap.kb_b', (select id::text from public.knowledge_entries
  where slug = 'catatan-b'), false);

-- Slug unik + normalisasi tag.
select is((select count(*) from public.knowledge_entries where title = 'Catatan Algoritma')::int, 2,
  'judul sama tetap mendapat slug unik');
select is((select slug from public.knowledge_entries where id = current_setting('tap.kb_dup')::uuid),
  'catatan-algoritma-2', 'slug kedua memakai sufiks -2');
select is((select count(*) from public.knowledge_entry_tags
  where entry_id = current_setting('tap.kb_public')::uuid)::int, 2,
  'tag dinormalisasi dan duplikat dibuang');

-- ===== Anonim ================================================================
do $$ begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select is((select count(*) from public.knowledge_entries)::int, 3,
  'anon melihat entri publik dan tautan saja');
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_class')::uuid)::int, 0,
  'anon tidak melihat entri class_only');
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_draft')::uuid)::int, 0,
  'anon tidak melihat draf privat');
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_unlisted')::uuid)::int, 1,
  'anon dapat membuka tautan saja');
select is((select total from public.search_knowledge(null, null, '{}', 'newest', 12, 0) limit 1)::int, 2,
  'penjelajah anonim hanya memuat entri publik');
select ok(not exists (select 1 from public.search_knowledge(null, null, '{}', 'newest', 12, 0)
  where slug = 'tautan-saja'), 'entri tautan saja tidak masuk penjelajah');
select is((select entry_count from public.get_knowledge_facets()
  where kind = 'category' and value = 'Kuliah')::int, 1,
  'facet kategori mengikuti visibilitas');
select is((select author_name from public.search_knowledge(null, null, '{}', 'newest', 12, 0)
  where slug = 'catatan-algoritma'), null,
  'nama penulis tidak bocor saat page.members tertutup');
select throws_ok($$ insert into public.knowledge_entries (class_id, author_id, slug, title, content_md)
  values (current_setting('tap.class_id')::uuid, '00000000-0000-0000-0000-0000000000d2',
          'anon-palsu', 'Anon', 'Isi') $$, '42501', null,
  'anon tidak bisa menulis entri langsung');
select throws_ok($$ select * from public.knowledge_edit_requests $$, '42501', null,
  'anon tidak bisa membaca permintaan edit');
select throws_ok($$ select * from public.knowledge_audit $$, '42501', null,
  'anon tidak bisa membaca audit');

-- ===== Langit-langit page.knowledge ==========================================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.save_class_visibility(
  '[{"key":"page.knowledge","audience":"class_member"}]'::jsonb) $$,
  'Ketua mempersempit page.knowledge ke anggota');
reset role;
do $$ begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select is((select count(*) from public.knowledge_entries)::int, 0,
  'anon kehilangan akses saat page.knowledge dipersempit');
select is((select count(*) from public.search_knowledge(null, null, '{}', 'newest', 12, 0))::int, 0,
  'penjelajah ikut tertutup');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_entries)::int, 4,
  'anggota tetap melihat entri publik, tautan, dan class_only');
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_class')::uuid)::int, 1,
  'anggota aktif melihat entri class_only');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.save_class_visibility(
  '[{"key":"page.knowledge","audience":"public"}]'::jsonb) $$,
  'Ketua membuka kembali page.knowledge');
reset role;
do $$ begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select is((select count(*) from public.knowledge_entries)::int, 3,
  'entri publik terbuka lagi untuk anon');

-- ===== Anggota dan undangan ==================================================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_draft')::uuid)::int, 0,
  'anggota lain tidak melihat draf privat');
select is((select author_name from public.search_knowledge(null, null, '{}', 'newest', 12, 0)
  where slug = 'catatan-algoritma'), 'Author A',
  'nama penulis terlihat oleh anggota saat page.members aktif');
select is((select total from public.search_knowledge(null, null, '{}', 'newest', 12, 0) limit 1)::int, 3,
  'penjelajah anggota memuat public dan class_only');
select is((select total from public.search_knowledge(null, null, array['algoritma'], 'newest', 12, 0) limit 1)::int, 2,
  'filter tag memakai tag ternormalisasi');
select is((select total from public.search_knowledge(null, 'Kuliah', '{}', 'newest', 12, 0) limit 1)::int, 2,
  'filter kategori menghormati visibilitas');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d5","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_entries)::int, 3,
  'undangan hanya melihat entri publik dan tautan');
select throws_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_public')::uuid, 'Ingin memperbaiki') $$, '42501', null,
  'undangan belum aktif tidak bisa meminta akses');

-- ===== Penolakan tulis langsung dan request awal =============================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is(public.t_rows($$ update public.knowledge_entries set title = 'Hack'
  where id = current_setting('tap.kb_public')::uuid $$)::int, 0,
  'B tidak bisa mengubah entri A lewat update langsung');
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 1, 'Catatan Algoritma', null,
  'Isi', 'Kuliah', 'published', '{}') $$, '42501', null,
  'B tidak bisa memakai RPC update tanpa izin');
select throws_ok($$ select public.set_knowledge_visibility(
  current_setting('tap.kb_public')::uuid, 'private', null) $$, '42501', null,
  'B tidak bisa mengubah visibilitas entri A');
select throws_ok($$ insert into public.knowledge_entries (class_id, author_id, slug, title, content_md)
  values (current_setting('tap.class_id')::uuid, '00000000-0000-0000-0000-0000000000d2',
          'palsu-b', 'Palsu', 'Isi') $$, '42501', null,
  'B tidak bisa memasukkan entri atas nama A');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
end $$;
select throws_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_unlisted')::uuid, 'x') $$, '22023', null,
  'alasan permintaan terlalu pendek ditolak');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_public')::uuid, 'Memperbaiki tautan rusak') $$,
  'B mengirim permintaan edit');
select is((select status::text from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid
    and requester_id = '00000000-0000-0000-0000-0000000000d3'), 'pending_author',
  'permintaan menunggu penulis');
select throws_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_public')::uuid, 'Permintaan kedua') $$, 'EC056', null,
  'permintaan ganda ditolak');
select throws_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_draft')::uuid, 'Ingin membaca draf') $$, 'P0002', null,
  'draf privat tidak bisa diminta anggota lain');
select throws_ok($$ select public.decide_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d3'), true) $$,
  '42501', null, 'pemohon tidak bisa menyetujui permintaannya sendiri');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_edit_requests)::int, 0,
  'anggota lain tidak melihat permintaan');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid)::int, 1,
  'penulis melihat permintaan untuk entrinya');

-- ===== Eskalasi dan persetujuan Ketua =======================================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select throws_ok($$ select public.escalate_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d3'), 'x') $$,
  '22023', null, 'alasan eskalasi terlalu pendek ditolak');
select lives_ok($$ select public.escalate_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d3'),
  'Penulis tidak merespons') $$, 'B meneruskan permintaan ke Ketua');
select is((select status::text from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid
    and requester_id = '00000000-0000-0000-0000-0000000000d3'), 'escalated',
  'status menjadi escalated');
select throws_ok($$ select public.escalate_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d3'),
  'Meneruskan lagi') $$, 'EC057', null, 'eskalasi kedua ditolak');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select throws_ok($$ select public.decide_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d3'), true) $$,
  '42501', null, 'penulis tidak bisa memutus permintaan yang sudah dieskalasi');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.decide_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d3'), true) $$,
  'Ketua menyetujui eskalasi');
select is((select status::text from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid
    and requester_id = '00000000-0000-0000-0000-0000000000d3'), 'approved',
  'permintaan eskalasi disetujui');
select is((select decided_as from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid
    and requester_id = '00000000-0000-0000-0000-0000000000d3'), 'leader',
  'keputusan dicatat sebagai Ketua');
select ok((select expires_at > now() + interval '6 days'
  and expires_at < now() + interval '8 days' from public.knowledge_editors
  where entry_id = current_setting('tap.kb_public')::uuid
    and user_id = '00000000-0000-0000-0000-0000000000d3'),
  'persetujuan Ketua memberi akses 7 hari');
select ok(exists (select 1 from public.knowledge_audit
  where entry_id = current_setting('tap.kb_public')::uuid and action = 'editor_granted'),
  'pemberian akses tercatat di audit');

-- ===== Editor: boleh isi, tidak boleh status/visibilitas ====================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 1, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi dari editor.', 'Kuliah', 'published', array['algoritma', 'sorting'],
  '{"blocks":[0],"at":"2026-02-01T00:00:00Z"}'::jsonb)), 2,
  'editor memperbarui isi dan versi naik');
select ok((select edited_at is not null
  and last_edited_by = '00000000-0000-0000-0000-0000000000d3'
  from public.knowledge_entries where id = current_setting('tap.kb_public')::uuid),
  'edited_at dan last_edited_by terisi');
select is((select highlights->'blocks' from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::text, '[0]',
  'anotasi sorotan tersimpan');
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 2, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi dari editor.', 'Kuliah', 'draft', array['algoritma', 'sorting']) $$,
  'EC051', null, 'editor tidak bisa mengubah status');
select throws_ok($$ update public.knowledge_entries set visibility = 'private'
  where id = current_setting('tap.kb_public')::uuid $$,
  'EC051', null, 'editor tidak bisa mengubah visibilitas');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
end $$;
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 2, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi dari Ketua.', 'Kuliah', 'published', '{}') $$, '42501', null,
  'Ketua tidak otomatis mendapat hak menulis isi');
select throws_ok($$ update public.knowledge_entries set title = 'Dihack Ketua'
  where id = current_setting('tap.kb_public')::uuid $$, '42501', null,
  'trigger menolak perubahan isi oleh Ketua meski RLS mengizinkan');
select lives_ok($$ select public.set_knowledge_visibility(
  current_setting('tap.kb_public')::uuid, 'private', 'Uji moderasi') $$,
  'Ketua dapat mengubah visibilitas');
reset role;
do $$ begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::int, 0,
  'entri privat tidak terlihat anon');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::int, 1,
  'editor tetap dapat membaca entri privat');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.set_knowledge_visibility(
  current_setting('tap.kb_public')::uuid, 'public', 'Selesai uji') $$,
  'Ketua mengembalikan visibilitas publik');
select ok(exists (select 1 from public.knowledge_audit
  where entry_id = current_setting('tap.kb_public')::uuid
    and action = 'visibility_changed' and reason = 'Uji moderasi'),
  'perubahan visibilitas Ketua masuk audit');
select lives_ok($$ select public.revoke_knowledge_editor(
  current_setting('tap.kb_public')::uuid, '00000000-0000-0000-0000-0000000000d3') $$,
  'Ketua mencabut akses editor B');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select status::text from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid
    and requester_id = '00000000-0000-0000-0000-0000000000d3'), 'revoked',
  'permintaan ikut berstatus revoked');
select ok((select revoked_at is not null from public.knowledge_editors
  where entry_id = current_setting('tap.kb_public')::uuid
    and user_id = '00000000-0000-0000-0000-0000000000d3'),
  'izin editor dicabut');
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 2, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi setelah dicabut.', 'Kuliah', 'published', '{}') $$, '42501', null,
  'akses edit yang dicabut langsung berlaku');

-- ===== Persetujuan penulis (berkelanjutan) ==================================
select lives_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_public')::uuid, 'Memperbaiki isi setelah dicabut') $$,
  'B meminta akses lagi setelah dicabut');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.decide_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d3'
     and status = 'pending_author'), true) $$,
  'penulis menyetujui permintaan B');
select is((select decided_as from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid
    and requester_id = '00000000-0000-0000-0000-0000000000d3'
    and status = 'approved'), 'author', 'keputusan dicatat sebagai penulis');
select ok((select expires_at is null from public.knowledge_editors
  where entry_id = current_setting('tap.kb_public')::uuid
    and user_id = '00000000-0000-0000-0000-0000000000d3'),
  'persetujuan penulis tidak kedaluwarsa otomatis');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 2, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi dari editor kedua.', 'Kuliah', 'published', array['algoritma', 'sorting'],
  '{"blocks":[1],"at":"2026-03-01T00:00:00Z"}'::jsonb)), 3,
  'editor memperbarui isi setelah persetujuan penulis');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.revoke_knowledge_editor(
  current_setting('tap.kb_public')::uuid, '00000000-0000-0000-0000-0000000000d3') $$,
  'penulis mencabut akses B');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 3, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi setelah cabut kedua.', 'Kuliah', 'published', '{}') $$, '42501', null,
  'akses B dicabut oleh penulis');

-- ===== Penolakan penulis ====================================================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_public')::uuid, 'Ingin menambah contoh') $$,
  'C mengirim permintaan edit');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select lives_ok($$ select public.decide_knowledge_request(
  (select id from public.knowledge_edit_requests
   where entry_id = current_setting('tap.kb_public')::uuid
     and requester_id = '00000000-0000-0000-0000-0000000000d4'
     and status = 'pending_author'), false) $$,
  'penulis menolak permintaan C');
select is((select status::text from public.knowledge_edit_requests
  where entry_id = current_setting('tap.kb_public')::uuid
    and requester_id = '00000000-0000-0000-0000-0000000000d4'
    and status <> 'revoked'), 'rejected', 'permintaan C ditolak');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
end $$;
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 3, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi dari C.', 'Kuliah', 'published', '{}') $$, '42501', null,
  'C tidak mendapat akses dari penolakan');

-- ===== Versi, guard, dan sorotan ============================================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select throws_ok($$ select public.request_knowledge_edit(
  current_setting('tap.kb_public')::uuid, 'Permintaan sendiri') $$, 'EC055', null,
  'penulis tidak bisa meminta akses ke entrinya sendiri');
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 1, 'Catatan Algoritma', 'Ringkasan sorting',
  'Versi basi.', 'Kuliah', 'published', '{}') $$, '40001', null,
  'versi lama ditolak');
select is((select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 3, 'Catatan Algoritma', 'Ringkasan sorting',
  'Isi final.', 'Kuliah', 'published', array['algoritma', 'sorting'],
  '{"blocks":[2],"at":"2026-04-01T00:00:00Z"}'::jsonb)), 4,
  'penulis memperbarui versi saat ini');
select is((select highlights->'blocks' from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::text, '[2]',
  'sorotan diganti pada suntingan isi');
select is((select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 4, 'Judul Baru', 'Ringkasan sorting',
  'Isi final.', 'Kuliah', 'published', array['algoritma', 'sorting'],
  '{"blocks":[9],"at":"2026-05-01T00:00:00Z"}'::jsonb)), 5,
  'judul saja tetap menaikkan versi');
select is((select highlights->'blocks' from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::text, '[2]',
  'sorotan tidak berubah bila isi tidak berubah');
-- slug dan author_id tidak punya grant UPDATE; buka sementara agar guard trigger
-- (lapisan kedua) benar-benar diuji, lalu cabut kembali.
reset role;
grant update (slug, author_id) on public.knowledge_entries to authenticated;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select throws_ok($$ update public.knowledge_entries set slug = 'slug-baru'
  where id = current_setting('tap.kb_public')::uuid $$, 'EC052', null,
  'slug tidak dapat diubah');
select throws_ok($$ update public.knowledge_entries set version = version + 2
  where id = current_setting('tap.kb_public')::uuid $$, 'EC053', null,
  'lonjakan versi ditolak');
select throws_ok($$ update public.knowledge_entries set author_id = '00000000-0000-0000-0000-0000000000d3'
  where id = current_setting('tap.kb_public')::uuid $$, 'EC050', null,
  'kepemilikan tidak dapat diubah');
reset role;
revoke update (slug, author_id) on public.knowledge_entries from authenticated;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;

-- ===== Arsip dan hapus ======================================================
select is((select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 5, 'Judul Baru', 'Ringkasan sorting',
  'Isi final.', 'Kuliah', 'archived', array['algoritma', 'sorting'])), 6,
  'penulis mengarsipkan entri');
reset role;
do $$ begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::int, 0,
  'entri arsip tidak terlihat anon');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::int, 1,
  'penulis tetap dapat membaca entri arsip');
select lives_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 6, 'Judul Baru', 'Ringkasan sorting',
  'Isi final.', 'Kuliah', 'published', array['algoritma', 'sorting']) $$,
  'penulis menerbitkan kembali entri');
reset role;
do $$ begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_public')::uuid)::int, 1,
  'entri terbit kembali terlihat anon');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
end $$;
select is(public.t_rows($$ delete from public.knowledge_entries
  where id = current_setting('tap.kb_dup')::uuid $$)::int, 0,
  'Ketua tidak bisa menghapus entri penulis');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select is(public.t_rows($$ delete from public.knowledge_entries
  where id = current_setting('tap.kb_dup')::uuid $$)::int, 1,
  'penulis dapat menghapus entrinya sendiri');

-- ===== Audit, grant langsung, dan status keanggotaan ========================
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_audit
  where entry_id = current_setting('tap.kb_public')::uuid)::int, 0,
  'pemohon tidak membaca audit');
select throws_ok($$ insert into public.knowledge_edit_requests
  (class_id, entry_id, requester_id, reason)
  values (current_setting('tap.class_id')::uuid, current_setting('tap.kb_public')::uuid,
          '00000000-0000-0000-0000-0000000000d3', 'Lewat RPC') $$,
  '42501', null, 'permintaan hanya bisa dibuat lewat RPC');

reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
end $$;
select ok((select count(*) from public.knowledge_audit
  where entry_id = current_setting('tap.kb_public')::uuid) > 0,
  'penulis melihat audit entrinya');
reset role;
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
end $$;
select ok((select count(*) from public.knowledge_audit
  where entry_id = current_setting('tap.kb_public')::uuid) > 0,
  'Ketua melihat audit entri');

-- Anggota yang dinonaktifkan kehilangan akses non-publik dan hak tulis.
reset role;
update public.memberships set status = 'inactive'
 where user_id = '00000000-0000-0000-0000-0000000000d3';
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
end $$;
select is((select count(*) from public.knowledge_entries
  where id = current_setting('tap.kb_class')::uuid)::int, 0,
  'anggota nonaktif kehilangan entri class_only');
select throws_ok($$ select public.update_knowledge_entry(
  current_setting('tap.kb_public')::uuid, 7, 'Judul Baru', 'Ringkasan sorting',
  'Isi setelah nonaktif.', 'Kuliah', 'published', '{}') $$, '42501', null,
  'anggota nonaktif kehilangan hak tulis meski grant masih ada');

select * from finish();
rollback;
