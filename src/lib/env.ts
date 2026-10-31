import 'server-only';
import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1), // hanya dipakai lib/supabase/admin.ts
  APP_URL: z.string().url(),
  // Client ID Google (Web). Bukan rahasia: dipakai tombol Google Identity Services
  // di peramban. Client Secret hanya ada di Supabase Dashboard, tidak di aplikasi.
  GOOGLE_CLIENT_ID: z.string().min(10).optional(),
  // Opsional: tanpa keduanya, perubahan email lewat OTP tidak bisa mengirim kode.
  SMTP_EMAIL: z.string().email().optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  // Google Drive Uploader. Semua hanya dibaca server; tidak ada NEXT_PUBLIC_*.
  // Kosong = fitur Cloud menampilkan pesan konfigurasi, bukan crash saat build.
  GDRIVE_CLIENT_ID: z.string().optional(),
  GDRIVE_CLIENT_SECRET: z.string().optional(),
  GDRIVE_REFRESH_TOKEN: z.string().optional(),
  GDRIVE_ROOT_FOLDER_ID: z.string().optional(),
  GDRIVE_ARCHIVES_ID: z.string().optional(),
  GDRIVE_AUDIOS: z.string().optional(),
  GDRIVE_DOCUMENTS: z.string().optional(),
  GDRIVE_PICTURES: z.string().optional(),
  GDRIVE_VIDEOS: z.string().optional(),
  GDRIVE_CUSTOM: z.string().optional(),
});
export const env = { ...schema.parse(process.env), IS_PROD: process.env.NODE_ENV === 'production' };
