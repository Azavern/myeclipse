import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { PageHeader } from '@/components/ui/primitives';
import { updateTheme } from '@/features/theme/actions';
import { ThemeEditor } from '@/features/theme/editor';
import { createClient } from '@/lib/supabase/server';
import { fontClass, templateFontClass } from '@/lib/theme/fonts';
import { resolveStoredTheme } from '@/lib/theme/resolve';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Tema kelas' };

export default async function ThemePage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Ftheme');
  if (!viewer.can('class.manage')) return <NoAccess />;
  const { data } = await (await createClient()).from('classes').select('theme').single();
  const resolved = resolveStoredTheme((data as { theme: unknown } | null)?.theme);
  if (resolved.invalidTemplate) console.error('Template tema di DB tidak dikenal; memakai template default');
  else if (resolved.invalid) console.error('Theme di DB tidak valid; memakai DEFAULT_THEME');
  const fonts = { editorial: fontClass('editorial'), grotesk: fontClass('grotesk'), rounded: fontClass('rounded') };
  const templateFonts = { neobrutalism: templateFontClass('neobrutalism'), archive: templateFontClass('archive') };
  return (
    <>
      <PageHeader icon="palette" title="Tema kelas" description="Pilih template, warna, gaya huruf, dan tata letak Beranda. Pratinjau hanya di layar ini sampai kamu menekan Publikasikan." />
      <ThemeEditor initial={resolved.theme} action={updateTheme} fontClasses={fonts} templateFontClasses={templateFonts} />
    </>
  );
}
