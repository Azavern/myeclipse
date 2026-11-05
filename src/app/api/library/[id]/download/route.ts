import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { DriveError, fileResponse } from '@/lib/gdrive/drive';
import { contentDisposition, libraryDownloadName } from '@/lib/library/shared';

type Row = {
  title: string;
  storage_path: string;
  original_name: string | null;
  original_ext: string | null;
  original_mime: string | null;
  drive_file_id: string | null;
};

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

// Unduhan hanya untuk anggota yang boleh membaca item (RLS). `v=hd` memakai
// file asli dari Drive; bila Drive belum punya salinannya, jawabannya 409 agar
// UI bisa menawarkan versi kompresi.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return fail(400, 'validation', 'Gambar tidak valid.');

  const ctx = await requireActionContext();
  if (!ctx) return fail(401, 'unauthenticated', 'Masuk sebagai anggota aktif untuk mengunduh.');

  const { data } = await ctx.supabase.from('library_items')
    .select('title,storage_path,original_name,original_ext,original_mime,drive_file_id')
    .eq('id', id.data).maybeSingle();
  if (!data) return fail(404, 'not_found', 'Gambar tidak ditemukan atau tidak dibagikan kepadamu.');
  const row = data as Row;

  const version = new URL(request.url).searchParams.get('v') === 'hd' ? 'hd' : 'preview';
  const fileName = libraryDownloadName(row.original_name, row.title, row.original_ext);

  if (version === 'hd') {
    if (!row.drive_file_id) {
      return fail(409, 'hd_unavailable', 'Versi HD untuk gambar ini belum tersedia. Gunakan versi kompresi.');
    }
    try {
      const drive = await fileResponse(row.drive_file_id);
      if (!drive.body) return fail(502, 'drive', 'Google Drive tidak mengirim isi file.');
      return new Response(drive.body, {
        status: 200,
        headers: {
          'Content-Type': row.original_mime ?? 'application/octet-stream',
          'Content-Disposition': contentDisposition(fileName),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      console.error('library download: Drive gagal', error instanceof DriveError ? error.kind : 'unknown');
      return fail(502, 'drive', 'Versi HD belum bisa diunduh sekarang. Coba lagi.');
    }
  }

  const signed = await ctx.supabase.storage.from('member-media')
    .createSignedUrl(row.storage_path, 60, { download: fileName });
  if (signed.error || !signed.data?.signedUrl) {
    console.error('library download: URL bertanda tangan gagal');
    return fail(500, 'storage', 'Versi kompresi belum bisa diunduh. Coba lagi.');
  }
  const redirect = NextResponse.redirect(signed.data.signedUrl, 307);
  redirect.headers.set('Cache-Control', 'private, no-store');
  return redirect;
}
