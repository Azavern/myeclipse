import type { ComponentPropsWithoutRef } from 'react';

type LoginLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & {
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined;
};

// /login memasang CSP khusus Google. Navigasi <Link> mempertahankan CSP dokumen
// asal sehingga stylesheet dan frame GIS diblokir; tautan ini sengaja memuat
// dokumen baru agar seluruh kebijakan halaman masuk berlaku.
export function LoginLink(props: LoginLinkProps) {
  return <a href="/login" {...props} />;
}
