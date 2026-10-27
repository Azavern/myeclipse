import { Icon, type IconName } from '@/components/ui/icon';
import { Tile } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

// Tampilan pratinjau tautan portofolio. Gambar dimuat browser langsung dari host situs sumber (hotlink);
// CSP rute terkait mengizinkan https (src/lib/security/csp.ts). Gambar bersifat dekoratif (alt="") karena
// judul item sudah ada di sebelahnya, dan lapisan pengganti di bawahnya yang terlihat bila hotlink ditolak.
// Tanpa gambar sama sekali, kotak itu menampilkan origin tautan agar kartu tidak terlihat kosong.
export function LinkPreviewMedia({ src, icon, site, label, alt = '', className }: {
  src?: string | null; icon: IconName; site?: string | null; label?: string | null; alt?: string; className?: string;
}) {
  return (
    <div className={cx('media', 'media--link', className)}>
      <span className="media__ph">
        <Icon name={icon} size={32} />
        {!src && label && <span className="media__domain">{label}</span>}
      </span>
      {src && <img src={src} alt={alt} width={640} height={360} loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
      {src && site && <span className="media__site"><Icon name="globe" size={14} /><span className="media__site-name">{site}</span></span>}
    </div>
  );
}

// Thumbnail baris daftar: gambar item (atau pratinjau tautannya) bila ada, selain itu kotak ikon jenis.
export function PreviewThumb({ src, icon }: { src?: string | null; icon: IconName }) {
  if (!src) return <Tile icon={icon} tone="accent" size="sm" />;
  return (
    <span className="thumb">
      <img src={src} alt="" width={56} height={56} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    </span>
  );
}
