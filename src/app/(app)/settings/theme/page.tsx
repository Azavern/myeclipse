import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { PageHeader } from '@/components/ui/primitives';
import { updateTheme } from '@/features/theme/actions';
import { ThemeEditor } from '@/features/theme/editor';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_THEME } from '@/lib/theme/defaults';
import { fontClass } from '@/lib/theme/fonts';
import { ThemeSchema } from '@/lib/theme/schema';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Tema kelas' };

export default async function ThemePage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Ftheme');
  if (!viewer.can('class.manage')) return <NoAccess />;
  const { data } = await (await createClient()).from('classes').select('theme').single();
  const parsed = ThemeSchema.safeParse((data as { theme: unknown } | null)?.theme);
  const fonts = { editorial: fontClass('editorial'), grotesk: fontClass('grotesk'), rounded: fontClass('rounded') };
  return (
    <>
      <PageHeader icon="palette" title="Tema kelas" description="Ubah warna, gaya huruf, dan tata letak Beranda. Pratinjau hanya di layar ini sampai kamu menekan Publikasikan." />
      <ThemeEditor initial={parsed.success ? parsed.data : DEFAULT_THEME} action={updateTheme} fontClasses={fonts} />
    </>
  );
}
