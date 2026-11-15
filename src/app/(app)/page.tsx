import { redirect } from 'next/navigation';
import { ClassicHome } from '@/features/home/classic-home';
import { getClass } from '@/lib/class';
import { homeDestination } from '@/lib/theme/home-mode';

// Gerbang server-side: mode intro mengalihkan / ke halaman sinematik, sedangkan mode
// klasik tetap merender beranda lama di tempat. Tanpa JavaScript pun redirect ini berlaku.
export default async function Home() {
  const cls = await getClass();
  const destination = homeDestination(cls?.theme);
  if (destination === '/intro') redirect(destination);
  return <ClassicHome next="/" />;
}
