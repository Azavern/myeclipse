// Tipe saja (tanpa import runtime) agar aman dipakai di server.ts maupun proxy.ts.
// Overload createServerClient di @supabase/ssr 0.6.x tidak memberi tipe kontekstual pada setAll, jadi tipe harus eksplisit.
// `options?: any` mengikuti bentuk yang terbukti lolos build; nilainya selalu dispread lalu ditimpa flag keamanan.
export type CookieToSet = { name: string; value: string; options?: any };
